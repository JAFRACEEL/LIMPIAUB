import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { ESTADO_RESERVA_LABELS, whatsappUrl } from '../lib/constantes'
import { useToasts } from '../lib/useToasts'
import { Estrellas } from '../components/Estrellas'
import { FormularioCalificacion } from '../components/FormularioCalificacion'
import type { Reserva, TrabajadorContacto } from '../types'

export function MisReservas() {
  const { session } = useAuth()
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [contactos, setContactos] = useState<Record<string, TrabajadorContacto>>({})
  const [calificadas, setCalificadas] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { toasts, agregar } = useToasts()

  const cargar = useCallback(async () => {
    if (!session) return
    setError(null)
    const [{ data: datos, error: errorReservas }, { data: propias }] = await Promise.all([
      supabase.from('reservas').select('*').eq('cliente_id', session.user.id).order('creado_en', { ascending: false }),
      supabase.from('calificaciones').select('reserva_id').eq('de_id', session.user.id),
    ])
    if (errorReservas) {
      setError(traducirError(errorReservas))
    } else {
      const lista = (datos as Reserva[]) ?? []
      setReservas(lista)
      const idsTrabajador = Array.from(new Set(lista.map((r) => r.trabajador_id).filter((id): id is string => !!id)))
      if (idsTrabajador.length > 0) {
        const { data: datosContacto } = await supabase.from('v_trabajador_contacto').select('*').in('id', idsTrabajador)
        const mapa: Record<string, TrabajadorContacto> = {}
        for (const c of (datosContacto as TrabajadorContacto[]) ?? []) mapa[c.id] = c
        setContactos(mapa)
      } else {
        setContactos({})
      }
    }
    setCalificadas(new Set((propias ?? []).map((c) => c.reserva_id)))
    setCargando(false)
  }, [session])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (!session) return
    const canal = supabase
      .channel(`reservas-cliente-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reservas', filter: `cliente_id=eq.${session.user.id}` },
        (payload) => {
          const estado = (payload.new as { estado?: string }).estado
          if (estado) agregar(`Tu reserva cambió a: ${ESTADO_RESERVA_LABELS[estado] ?? estado}`)
          cargar()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [session, cargar, agregar])

  async function cancelar(id: string) {
    // Si la trabajadora ya inició o terminó el servicio justo antes de este
    // clic, no queremos pisar ese cambio: solo cancela si sigue solicitada o
    // recién aceptada.
    const { data, error: errorCancelar } = await supabase
      .from('reservas')
      .update({ estado: 'cancelada' })
      .eq('id', id)
      .in('estado', ['solicitada', 'aceptada'])
      .select('id')
    if (errorCancelar) alert(traducirError(errorCancelar))
    else if (!data || data.length === 0) agregar('Esta reserva ya había cambiado. Actualizamos tu lista.')
    cargar()
  }

  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando tus reservas…</div>

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Mis reservas</h1>

      <div className="pointer-events-none fixed inset-x-0 top-16 z-20 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg">
            {t.mensaje}
          </div>
        ))}
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {reservas.length === 0 ? (
        <p className="rounded-xl bg-neutral-100 px-4 py-6 text-center text-sm text-neutral-500">
          Todavía no tienes reservas.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reservas.map((r) => {
            const contacto = r.trabajador_id ? contactos[r.trabajador_id] : undefined
            return (
              <li key={r.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{r.servicio}</p>
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                    {ESTADO_RESERVA_LABELS[r.estado] ?? r.estado}
                  </span>
                </div>
                <p className="text-sm text-neutral-500">
                  {new Date(`${r.fecha}T${r.hora}`).toLocaleDateString('es-PE', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}{' '}
                  · {r.hora.slice(0, 5)} · {r.horas}h
                </p>
                <p className="text-sm text-neutral-500">{r.zona}</p>
                {r.total != null && (
                  <p className="mt-1 text-sm font-semibold text-teal-700">Total: S/ {r.total.toFixed(2)}</p>
                )}

                {contacto && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={contacto.foto_url ?? 'https://placehold.co/40x40?text=%20'}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{contacto.nombre}</p>
                      <Estrellas promedio={contacto.rating_avg} cantidad={1} />
                    </div>
                    {(r.estado === 'aceptada' || r.estado === 'en_curso' || r.estado === 'completada') && (
                      <a
                        href={whatsappUrl(
                          contacto.telefono,
                          `Hola ${contacto.nombre}, te escribo por mi reserva de Limpi (${r.servicio}).`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                )}

                {r.estado === 'solicitada' && r.modo === 'abierto' && !r.trabajador_id && (
                  <CandidatasDeReserva reservaId={r.id} ventanaCierraEn={r.ventana_cierra_en} onElegido={cargar} />
                )}

                {(r.estado === 'solicitada' || r.estado === 'aceptada') && (
                  <button
                    onClick={() => cancelar(r.id)}
                    className="mt-3 w-full rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700"
                  >
                    Cancelar
                  </button>
                )}

                {r.estado === 'completada' && r.trabajador_id && !calificadas.has(r.id) && session && (
                  <div className="mt-3">
                    <FormularioCalificacion
                      reservaId={r.id}
                      paraId={r.trabajador_id}
                      deId={session.user.id}
                      onCalificado={cargar}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function CandidatasDeReserva({
  reservaId,
  ventanaCierraEn,
  onElegido,
}: {
  reservaId: string
  ventanaCierraEn: string | null
  onElegido: () => void
}) {
  const [candidatas, setCandidatas] = useState<TrabajadorContacto[]>([])
  const [cargando, setCargando] = useState(true)
  const [eligiendo, setEligiendo] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data: filas } = await supabase
      .from('candidaturas')
      .select('trabajador_id')
      .eq('reserva_id', reservaId)
      .eq('estado', 'pendiente')
    const ids = ((filas as { trabajador_id: string }[]) ?? []).map((f) => f.trabajador_id)
    if (ids.length === 0) {
      setCandidatas([])
      setCargando(false)
      return
    }
    const { data } = await supabase.from('v_trabajador_contacto').select('*').in('id', ids)
    setCandidatas((data as TrabajadorContacto[]) ?? [])
    setCargando(false)
  }, [reservaId])

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel(`candidaturas-${reservaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'candidaturas', filter: `reserva_id=eq.${reservaId}` },
        cargar,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [reservaId, cargar])

  // Sin esto, si nadie se postula el mensaje se queda en "Buscando…" para
  // siempre aunque ya haya pasado la ventana: no llega ningún evento de
  // candidaturas que fuerce un nuevo render.
  const [, forzarRender] = useState(0)
  useEffect(() => {
    if (!ventanaCierraEn) return
    const ms = new Date(ventanaCierraEn).getTime() - Date.now()
    if (ms <= 0) return
    const id = window.setTimeout(() => forzarRender((n) => n + 1), ms + 1000)
    return () => window.clearTimeout(id)
  }, [ventanaCierraEn])

  async function elegir(trabajadorId: string) {
    setEligiendo(trabajadorId)
    const { error } = await supabase.rpc('elegir_candidata', {
      p_reserva_id: reservaId,
      p_trabajador_id: trabajadorId,
    })
    if (error) alert(traducirError(error))
    setEligiendo(null)
    onElegido()
  }

  const ventanaVencida = ventanaCierraEn ? new Date(ventanaCierraEn).getTime() < Date.now() : false

  if (cargando) return <p className="mt-3 text-sm text-neutral-500">Buscando trabajadoras…</p>

  if (candidatas.length === 0) {
    return (
      <p className="mt-3 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-500">
        {ventanaVencida
          ? 'Nadie disponible ahora. ¿Programamos para otra hora? Puedes cancelar e intentar de nuevo más tarde.'
          : 'Buscando trabajadoras disponibles en tu zona…'}
      </p>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-sm font-medium text-neutral-700">Elige una trabajadora:</p>
      {candidatas.map((c) => (
        <div key={c.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 p-2">
          <img
            src={c.foto_url ?? 'https://placehold.co/40x40?text=%20'}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{c.nombre}</p>
            <Estrellas promedio={c.rating_avg} cantidad={c.rating_n} />
            <p className="text-xs text-neutral-500">
              S/ {c.tarifa_hora.toFixed(2)}/h · {c.trabajos_completados} trabajos
            </p>
          </div>
          <button
            disabled={eligiendo === c.id}
            onClick={() => elegir(c.id)}
            className="shrink-0 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            Elegir
          </button>
        </div>
      ))}
    </div>
  )
}
