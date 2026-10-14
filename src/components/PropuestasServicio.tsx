import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { hoyLima } from '../lib/horario'
import { formatoSoles, totalAContratar } from '../lib/precios'
import { ETIQUETA_MODALIDAD } from '../lib/modalidades'
import type { Propuesta, Reserva, TrabajadorPublico } from '../types'
import { Estrellas } from './Estrellas'
import { PropuestaTarjeta } from './PropuestaTarjeta'

/**
 * Pedido abierto: los profesionales que aceptaron, con su propuesta. Elegir a alguien NO lo asigna:
 * primero se ve el precio y el alcance y se confirma con "Contratar por S/ …".
 */
export function PropuestasServicio({
  reserva,
  propuestas,
  candidatos,
  perfiles,
  onCambio,
}: {
  reserva: Reserva
  /** Propuestas de servicio vigentes (estado ofrecida) de esta reserva. */
  propuestas: Propuesta[]
  /** Profesionales con candidatura pendiente (en cotización pueden no tener propuesta aún). */
  candidatos: string[]
  perfiles: Record<string, TrabajadorPublico>
  onCambio: () => void
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [, forzar] = useState(0)

  useEffect(() => {
    if (!reserva.ventana_cierra_en) return
    const ms = new Date(reserva.ventana_cierra_en).getTime() - Date.now()
    if (ms <= 0) return
    const id = window.setTimeout(() => forzar((n) => n + 1), ms + 1000)
    return () => window.clearTimeout(id)
  }, [reserva.ventana_cierra_en])

  const ventanaVencida = reserva.ventana_cierra_en ? new Date(reserva.ventana_cierra_en).getTime() < Date.now() : false
  const porProfesional = new Map(propuestas.map((p) => [p.trabajador_id, p]))
  const ids = Array.from(new Set([...propuestas.map((p) => p.trabajador_id), ...candidatos]))

  if (ids.length === 0) {
    return ventanaVencida ? (
      <SinRespuesta reserva={reserva} onCambio={onCambio} />
    ) : (
      <div className="mt-3 rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
        <p className="font-medium text-neutral-800">Buscando profesionales…</p>
        <p className="mt-1">Avisamos a los profesionales de tu zona que ofrecen este servicio. Verás aquí a quienes acepten.</p>
      </div>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-sm font-medium text-neutral-800">
        {ids.length === 1 ? '1 profesional aceptó' : `${ids.length} profesionales aceptaron`}. Revisa y elige:
      </p>
      {ids.map((id) => {
        const perfil = perfiles[id]
        const propuesta = porProfesional.get(id)
        const nombre = perfil?.nombre ?? 'Profesional'
        const expandida = abierta === id
        return (
          <div key={id} className="rounded-2xl border border-neutral-200 bg-white p-3">
            <div className="flex items-center gap-3">
              <img src={perfil?.foto_url ?? 'https://placehold.co/48x48?text=%20'} alt="" className="h-12 w-12 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{nombre}</p>
                <Estrellas promedio={perfil?.rating_avg ?? 0} cantidad={perfil?.rating_n ?? 0} />
                <p className="text-xs text-neutral-500">
                  {perfil ? `${perfil.trabajos_completados} trabajos` : ''}
                  {perfil && perfil.servicios.includes(reserva.servicio) ? ` · ${reserva.servicio}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {propuesta ? (
                  <p className="text-base font-bold text-teal-800">{formatoSoles(totalAContratar(propuesta, reserva.recargo_materiales))}</p>
                ) : (
                  <p className="text-xs text-neutral-500">Sin propuesta aún</p>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {perfil?.disponible_ahora && reserva.programacion === 'ahora' && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">Disponible ahora</span>
              )}
              {reserva.programacion === 'programada' && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">Libre en tu horario</span>
              )}
              {propuesta && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">{ETIQUETA_MODALIDAD[propuesta.modalidad]}</span>}
            </div>
            {propuesta ? (
              <>
                <button
                  type="button"
                  onClick={() => setAbierta(expandida ? null : id)}
                  aria-expanded={expandida}
                  className="mt-3 w-full rounded-xl border border-teal-700 px-4 py-3 text-sm font-semibold text-teal-800"
                >
                  {expandida ? 'Ocultar propuesta' : 'Ver propuesta'}
                </button>
                {expandida && (
                  <div className="mt-3">
                    <PropuestaTarjeta propuesta={propuesta} nombre={nombre} contratar kit={reserva.recargo_materiales} onResuelta={onCambio} />
                  </div>
                )}
              </>
            ) : (
              <p className="mt-3 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600">
                {nombre.split(' ')[0]} quiere atenderte y aún debe enviar su propuesta con precio. Te avisamos cuando llegue.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Nadie aceptó: cambiar horario o volver a intentar. No se amplía zona ni se asigna sola. */
function SinRespuesta({ reserva, onCambio }: { reserva: Reserva; onCambio: () => void }) {
  const [cambiando, setCambiando] = useState(false)
  const [fecha, setFecha] = useState(reserva.fecha)
  const [hora, setHora] = useState(reserva.hora.slice(0, 5))
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reintentar(args: { programacion: 'ahora' | 'programada'; fecha?: string; hora?: string }) {
    setTrabajando(true)
    setError(null)
    const { error: e } = await supabase.rpc('reintentar_solicitud', {
      p_reserva_id: reserva.id,
      p_programacion: args.programacion,
      p_fecha: args.fecha ?? null,
      p_hora: args.hora ?? null,
    })
    setTrabajando(false)
    if (e) {
      setError(traducirError(e))
      return
    }
    setCambiando(false)
    onCambio()
  }

  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Nadie aceptó todavía</p>
      <p className="mt-1">Puedes volver a intentarlo o cambiar el horario. No te cobramos nada.</p>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      {!cambiando ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={trabajando}
            onClick={() =>
              reintentar(
                reserva.programacion === 'ahora'
                  ? { programacion: 'ahora' }
                  : { programacion: 'programada', fecha: reserva.fecha, hora: reserva.hora.slice(0, 5) },
              )
            }
            className="rounded-xl bg-teal-700 px-3 py-3 font-semibold text-white disabled:opacity-60"
          >
            {trabajando ? 'Enviando…' : 'Volver a intentar'}
          </button>
          <button type="button" onClick={() => setCambiando(true)} className="rounded-xl border border-neutral-300 bg-white px-3 py-3 font-semibold text-neutral-700">
            Cambiar horario
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Día</span>
              <input type="date" min={hoyLima(new Date())} value={fecha} onChange={(e) => setFecha(e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Hora</span>
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="input" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={trabajando || !fecha || !hora}
              onClick={() => reintentar({ programacion: 'programada', fecha, hora })}
              className="rounded-xl bg-teal-700 px-3 py-3 font-semibold text-white disabled:opacity-60"
            >
              Enviar de nuevo
            </button>
            <button type="button" onClick={() => reintentar({ programacion: 'ahora' })} disabled={trabajando} className="rounded-xl border border-neutral-300 bg-white px-3 py-3 font-semibold text-neutral-700 disabled:opacity-60">
              Lo antes posible
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
