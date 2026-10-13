import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { formatoSoles } from '../lib/precios'
import type { Pago } from '../types'

interface Fila {
  pago: Pago
  servicio: string
  clienteNombre: string
  clienteTelefono: string
  totalReserva: number | null
}

/**
 * Solo un administrador confirma pagos manuales (Yape / Plin / transferencia / efectivo).
 * El servidor lo vuelve a comprobar: el cliente no puede marcar pago_confirmado por sí mismo.
 */
export function PagosPendientesAdmin() {
  const [filas, setFilas] = useState<Fila[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')

  const cargar = useCallback(async () => {
    const { data: pagos, error: e } = await supabase
      .from('pagos')
      .select('*')
      .eq('estado', 'pendiente_verificacion')
      .order('creado_en')
    if (e) {
      setError(traducirError(e))
      setCargando(false)
      return
    }
    const lista = (pagos as Pago[]) ?? []
    const ids = lista.map((p) => p.reserva_id)
    const { data: reservas } = ids.length
      ? await supabase.from('reservas').select('id, servicio, cliente_id, total_cliente, total').in('id', ids)
      : { data: [] }
    const porReserva = new Map((reservas ?? []).map((r) => [r.id as string, r]))
    const idsCliente = Array.from(new Set((reservas ?? []).map((r) => r.cliente_id as string)))
    const { data: perfiles } = idsCliente.length
      ? await supabase.from('perfiles').select('id, nombre, telefono').in('id', idsCliente)
      : { data: [] }
    const porCliente = new Map((perfiles ?? []).map((p) => [p.id as string, p]))
    setFilas(
      lista.map((pago) => {
        const r = porReserva.get(pago.reserva_id)
        const c = r ? porCliente.get(r.cliente_id as string) : undefined
        return {
          pago,
          servicio: (r?.servicio as string) ?? '—',
          clienteNombre: (c?.nombre as string) ?? '—',
          clienteTelefono: (c?.telefono as string) ?? '',
          totalReserva: (r?.total_cliente as number | null) ?? (r?.total as number | null) ?? null,
        }
      }),
    )
    setError(null)
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function verEvidencia(ruta: string | null) {
    if (!ruta) return
    const { data, error: e } = await supabase.storage.from('documentos').createSignedUrl(ruta, 300)
    if (e || !data) {
      setError(traducirError(e ?? new Error('No se pudo abrir la captura.')))
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function resolver(pagoId: string, confirmar: boolean) {
    setProcesando(pagoId)
    const { error: e } = await supabase.rpc('confirmar_pago', {
      p_pago_id: pagoId,
      p_confirmar: confirmar,
      p_motivo: confirmar ? null : motivo.trim() || null,
    })
    setProcesando(null)
    if (e) {
      setError(traducirError(e))
      return
    }
    setRechazando(null)
    setMotivo('')
    cargar()
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">Pagos por verificar</h2>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {cargando ? (
        <p className="text-sm text-neutral-500">Cargando pagos…</p>
      ) : filas.length === 0 ? (
        <p className="rounded-xl bg-neutral-100 px-4 py-4 text-sm text-neutral-500">No hay pagos pendientes de verificación.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filas.map(({ pago, servicio, clienteNombre, clienteTelefono, totalReserva }) => (
            <li key={pago.id} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{servicio}</p>
                  <p className="text-neutral-500">
                    {clienteNombre}
                    {clienteTelefono ? ` · ${clienteTelefono}` : ''}
                  </p>
                </div>
                <p className="shrink-0 text-base font-bold tabular-nums">{formatoSoles(pago.monto)}</p>
              </div>
              <p className="mt-1 text-neutral-600">
                {pago.metodo.toUpperCase()}
                {pago.referencia ? ` · Operación ${pago.referencia}` : ''}
                {totalReserva != null && Math.abs(totalReserva - pago.monto) > 0.009 ? ` · Total del servicio ${formatoSoles(totalReserva)}` : ''}
              </p>
              <p className="text-xs text-neutral-400">Registrado {new Date(pago.creado_en).toLocaleString('es-PE')}</p>
              {pago.evidencia_ruta && (
                <button type="button" onClick={() => verEvidencia(pago.evidencia_ruta)} className="mt-2 text-xs font-semibold text-teal-700 underline">
                  Ver captura
                </button>
              )}
              {rechazando === pago.id ? (
                <div className="mt-3 flex flex-col gap-2">
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input" placeholder="Motivo (el cliente lo verá)" />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={procesando === pago.id} onClick={() => resolver(pago.id, false)} className="rounded-lg bg-red-600 px-3 py-2 font-semibold text-white disabled:opacity-60">
                      Rechazar pago
                    </button>
                    <button type="button" onClick={() => setRechazando(null)} className="rounded-lg border border-neutral-300 px-3 py-2 font-semibold text-neutral-700">
                      Volver
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" disabled={procesando === pago.id} onClick={() => resolver(pago.id, true)} className="rounded-lg bg-green-600 px-3 py-2 font-semibold text-white disabled:opacity-60">
                    Confirmar pago
                  </button>
                  <button type="button" onClick={() => setRechazando(pago.id)} className="rounded-lg border border-red-300 px-3 py-2 font-semibold text-red-700">
                    Rechazar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
