import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { desglosar, formatoSoles } from '../lib/precios'
import type { Propuesta } from '../types'
import { AlcanceServicio } from './AlcanceServicio'
import { DesglosePrecio } from './DesglosePrecio'

const TITULO: Record<Propuesta['tipo'], string> = {
  servicio: 'Propuesta',
  presupuesto_reparacion: 'Presupuesto de reparación',
  adicional: 'Cargo adicional',
}

function textoManoObra(p: Propuesta): string | undefined {
  if (p.modalidad === 'horas' && p.tarifa_hora != null && p.horas) {
    return `${formatoSoles(p.tarifa_hora)} × ${p.horas} h${p.personas && p.personas > 1 ? ` × ${p.personas} personas` : ''}`
  }
  return undefined
}

/**
 * Una propuesta concreta, con precio desglosado y alcance. El cliente la acepta o la rechaza
 * con una acción explícita: nada se asigna ni se suma al total sin eso.
 */
export function PropuestaTarjeta({
  propuesta,
  nombre,
  contratar = false,
  kit = 0,
  onResuelta,
}: {
  propuesta: Propuesta
  nombre?: string
  /** true = propuesta inicial del servicio ("Contratar por S/ …"); false = presupuesto o adicional ("Aceptar"). */
  contratar?: boolean
  /** Kit de limpieza de la reserva (S/18 si se pidió): se suma al contratar el servicio, no a presupuestos ni adicionales. */
  kit?: number
  onResuelta: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const desglose = desglosar({
    manoObra: propuesta.mano_obra,
    descuentoVisita: propuesta.descuento_visita,
    materiales: propuesta.materiales,
    movilidad: propuesta.movilidad,
    otros: propuesta.otros,
    kit: propuesta.tipo === 'servicio' ? kit : 0,
  })
  const esVisita = propuesta.tipo === 'servicio' && propuesta.modalidad === 'diagnostico'

  async function aceptar() {
    setTrabajando(true)
    setError(null)
    const { error: e } = contratar
      ? await supabase.rpc('contratar_propuesta', { p_propuesta_id: propuesta.id })
      : await supabase.rpc('responder_propuesta', { p_propuesta_id: propuesta.id, p_aceptar: true })
    setTrabajando(false)
    if (e) {
      setError(traducirError(e))
      return
    }
    onResuelta()
  }

  async function rechazar() {
    setTrabajando(true)
    setError(null)
    const { error: e } = await supabase.rpc('responder_propuesta', { p_propuesta_id: propuesta.id, p_aceptar: false })
    setTrabajando(false)
    if (e) {
      setError(traducirError(e))
      return
    }
    onResuelta()
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-teal-200 bg-white p-4">
      <div>
        <p className="font-semibold text-neutral-900">
          {TITULO[propuesta.tipo]}
          {nombre ? ` de ${nombre.split(' ')[0]}` : ''}
        </p>
        {propuesta.version > 1 && <p className="text-xs text-neutral-500">Versión {propuesta.version}: reemplaza la anterior</p>}
        {propuesta.alcance && <p className="mt-1 text-sm text-neutral-600">{propuesta.alcance}</p>}
      </div>

      <DesglosePrecio desglose={desglose} detalleManoObra={textoManoObra(propuesta)} />

      {esVisita && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Este importe es solo por la visita. Si hay que reparar, recibirás otro presupuesto y tú decides si lo aceptas.
        </p>
      )}
      {propuesta.descuento_visita > 0 && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
          Ya pagaste la visita de diagnóstico ({formatoSoles(propuesta.descuento_visita)}): se descuenta aquí para que no pagues dos veces.
        </p>
      )}

      <AlcanceServicio incluye={propuesta.incluye} noIncluye={propuesta.no_incluye} condiciones={propuesta.condiciones} abierto={false} />

      {propuesta.vigente_hasta && (
        <p className="text-xs text-neutral-500">
          Vigente hasta {new Date(propuesta.vigente_hasta).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!confirmando ? (
        <div className={contratar ? '' : 'grid grid-cols-2 gap-2'}>
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="w-full rounded-xl bg-teal-700 px-4 py-3.5 text-base font-semibold text-white"
          >
            {contratar ? `Contratar por ${formatoSoles(desglose.total)}` : `Aceptar ${formatoSoles(desglose.total)}`}
          </button>
          {!contratar && (
            <button
              type="button"
              disabled={trabajando}
              onClick={rechazar}
              className="rounded-xl border border-neutral-300 px-4 py-3.5 text-base font-semibold text-neutral-700 disabled:opacity-60"
            >
              Rechazar
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-teal-300 bg-teal-50 p-3">
          <p className="text-sm text-teal-950">
            {contratar
              ? `Vas a contratar${nombre ? ` a ${nombre.split(' ')[0]}` : ''} por ${formatoSoles(desglose.total)}. Aceptas este precio, lo que incluye y las condiciones. Cualquier cambio necesitará tu aprobación.`
              : `Aceptas ${formatoSoles(desglose.total)} más al total del servicio.`}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={trabajando} onClick={aceptar} className="rounded-xl bg-teal-700 px-3 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {trabajando ? 'Confirmando…' : 'Sí, confirmar'}
            </button>
            <button type="button" disabled={trabajando} onClick={() => setConfirmando(false)} className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm font-semibold text-neutral-700">
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
