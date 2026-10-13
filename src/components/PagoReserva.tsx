import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { DATOS_PAGO } from '../lib/constantes'
import { ETIQUETA_PAGO, datosPagoDisponibles, type ResumenPago } from '../lib/estadoPago'
import { formatoSoles } from '../lib/precios'
import type { MetodoPago } from '../types'

const METODOS: { v: MetodoPago; t: string }[] = [
  { v: 'yape', t: 'Yape' },
  { v: 'plin', t: 'Plin' },
  { v: 'transferencia', t: 'Transferencia bancaria' },
  { v: 'efectivo', t: 'Efectivo' },
]

const COLOR: Record<ResumenPago['estado'], string> = {
  sin_monto: 'bg-neutral-100 text-neutral-600',
  por_registrar: 'bg-amber-100 text-amber-800',
  pendiente_verificacion: 'bg-blue-100 text-blue-800',
  confirmado: 'bg-green-100 text-green-800',
}

export function EtiquetaPago({ estado }: { estado: ResumenPago['estado'] }) {
  if (estado === 'sin_monto') return null
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR[estado]}`}>{ETIQUETA_PAGO[estado]}</span>
}

/**
 * Pago manual. Registrar el pago NO lo confirma: queda "pendiente de verificación" hasta que un
 * administrador lo revise. Si Limpi aún no cargó sus datos de cobro, se dice y no se simula el pago.
 */
export function PagoReserva({
  reservaId,
  clienteId,
  resumen,
  onCambio,
}: {
  reservaId: string
  clienteId: string
  resumen: ResumenPago
  onCambio: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [metodo, setMetodo] = useState<MetodoPago | ''>('')
  const [referencia, setReferencia] = useState('')
  const [captura, setCaptura] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (resumen.estado === 'sin_monto') return null

  const hayDatos = metodo !== '' && datosPagoDisponibles(metodo)

  async function registrar() {
    if (!metodo) return
    if (metodo !== 'efectivo' && !referencia.trim() && !captura) {
      setError('Agrega el número de operación o una captura del pago.')
      return
    }
    setEnviando(true)
    setError(null)
    let ruta: string | null = null
    if (captura) {
      const extension = captura.name.split('.').pop() ?? 'jpg'
      ruta = `${clienteId}/pago-${Date.now()}.${extension}`
      const { error: errorSubida } = await supabase.storage.from('documentos').upload(ruta, captura, { upsert: true })
      if (errorSubida) {
        setError(`No pudimos subir la captura (${traducirError(errorSubida)}). Intenta de nuevo.`)
        setEnviando(false)
        return
      }
    }
    const { error: e } = await supabase.rpc('registrar_pago', {
      p_reserva_id: reservaId,
      p_metodo: metodo,
      p_referencia: referencia.trim() || null,
      p_evidencia_ruta: ruta,
    })
    setEnviando(false)
    if (e) {
      setError(traducirError(e))
      return
    }
    setAbierto(false)
    setReferencia('')
    setCaptura(null)
    onCambio()
  }

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <EtiquetaPago estado={resumen.estado} />
        <span className="font-semibold tabular-nums">{formatoSoles(resumen.monto)}</span>
      </div>

      {resumen.estado === 'pendiente_verificacion' && (
        <p className="mt-2 text-neutral-600">Recibimos tu registro de pago. Un administrador lo verificará; te avisamos cuando esté confirmado.</p>
      )}
      {resumen.estado === 'confirmado' && <p className="mt-2 text-green-800">Verificamos tu pago. ¡Gracias!</p>}
      {resumen.ultimoRechazo && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-red-700">
          No pudimos confirmar tu último pago{resumen.ultimoRechazo.motivo_rechazo ? `: ${resumen.ultimoRechazo.motivo_rechazo}` : '.'} Puedes registrarlo de nuevo.
        </p>
      )}

      {resumen.saldo > 0 && (
        <>
          {resumen.confirmado + resumen.pendiente > 0 && (
            <p className="mt-2 text-neutral-600">Falta registrar {formatoSoles(resumen.saldo)} (por cargos aceptados después).</p>
          )}
          {!abierto ? (
            <button type="button" onClick={() => setAbierto(true)} className="mt-3 w-full rounded-xl border border-teal-700 px-4 py-3 font-semibold text-teal-800">
              Registrar mi pago de {formatoSoles(resumen.saldo)}
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-medium text-neutral-700">¿Cómo pagaste o pagarás?</span>
                <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className="input">
                  <option value="">Elige una opción</option>
                  {METODOS.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.t}
                    </option>
                  ))}
                </select>
              </label>

              {metodo && metodo !== 'efectivo' && !hayDatos && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                  Todavía no tenemos listos los datos para cobrar por {METODOS.find((m) => m.v === metodo)?.t}. Elige efectivo o espera a que te los enviemos por WhatsApp. No registres un pago que aún no hiciste.
                </p>
              )}
              {metodo && metodo !== 'efectivo' && hayDatos && (
                <div className="rounded-lg bg-white px-3 py-2 text-neutral-700">
                  <p className="font-medium">Datos para el abono</p>
                  <p>{DATOS_PAGO[metodo]}</p>
                </div>
              )}
              {metodo === 'efectivo' && <p className="rounded-lg bg-white px-3 py-2 text-neutral-700">Pagas en efectivo al profesional al terminar. Limpi lo verificará.</p>}

              {metodo && (metodo === 'efectivo' || hayDatos) && (
                <>
                  {metodo !== 'efectivo' && (
                    <>
                      <label className="flex flex-col gap-1">
                        <span className="font-medium text-neutral-700">Número de operación</span>
                        <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className="input" placeholder="Ej. 123456" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="font-medium text-neutral-700">Captura del pago (opcional si pusiste el número)</span>
                        <input type="file" accept="image/*" onChange={(e) => setCaptura(e.target.files?.[0] ?? null)} className="text-sm" />
                      </label>
                    </>
                  )}
                  <p className="text-xs text-neutral-500">Esto no confirma tu pago: queda pendiente hasta que lo verifiquemos.</p>
                  <button type="button" disabled={enviando} onClick={registrar} className="rounded-xl bg-teal-700 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60">
                    {enviando ? 'Registrando…' : 'Registrar pago'}
                  </button>
                </>
              )}
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
              <button type="button" onClick={() => setAbierto(false)} className="text-center text-xs text-neutral-500 underline">
                Cancelar
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
