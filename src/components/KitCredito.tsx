import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import type { PrestamoKit } from '../types'

interface PrestamoConNombre extends PrestamoKit {
  trabajadores: { perfiles: { nombre: string } }
}

interface TrabajadorElegible {
  id: string
  trabajos_completados: number
  rating_avg: number
  perfiles: { nombre: string }
}

export function KitCredito() {
  const [activos, setActivos] = useState<PrestamoConNombre[]>([])
  const [elegibles, setElegibles] = useState<TrabajadorElegible[]>([])
  const [monto, setMonto] = useState('130')
  const [bodega, setBodega] = useState('')
  const [procesando, setProcesando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    const { data: prestamos, error: errorPrestamos } = await supabase
      .from('prestamos_kit')
      .select('*, trabajadores(perfiles(nombre))')
      .in('estado', ['emitido', 'retirado'])
      .order('creado_en', { ascending: false })

    if (errorPrestamos) {
      setError(traducirError(errorPrestamos))
      return
    }
    const listaActivos = (prestamos as unknown as PrestamoConNombre[]) ?? []
    setActivos(listaActivos)

    const idsConPrestamo = new Set(listaActivos.map((p) => p.trabajador_id))
    const { data: candidatas } = await supabase
      .from('trabajadores')
      .select('id, trabajos_completados, rating_avg, perfiles(nombre)')
      .eq('verificado', true)
      .gte('trabajos_completados', 2)
      .gte('rating_avg', 4.5)

    setElegibles(((candidatas as unknown as TrabajadorElegible[]) ?? []).filter((t) => !idsConPrestamo.has(t.id)))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function emitir(trabajadorId: string) {
    if (!bodega.trim()) {
      setError('Escribe la bodega donde se retirará el kit.')
      return
    }
    const montoNum = Number(monto)
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError('Escribe un monto válido.')
      return
    }
    setProcesando(trabajadorId)
    setError(null)
    const { error: errorRpc } = await supabase.rpc('emitir_prestamo_kit', {
      p_trabajador_id: trabajadorId,
      p_monto: montoNum,
      p_bodega: bodega,
    })
    setProcesando(null)
    if (errorRpc) {
      // cargar() empieza con setError(null): si lo llamamos aquí, React
      // agrupa ambos cambios y el mensaje de error nunca llega a mostrarse.
      setError(traducirError(errorRpc))
      return
    }
    cargar()
  }

  async function marcar(id: string, desdeEstado: string, estado: 'retirado' | 'perdida') {
    setProcesando(id)
    // Si la trabajadora ya terminó de pagarlo justo antes de este clic, no
    // queremos reabrir un préstamo que el trigger ya marcó "pagado".
    const { data, error: errorUpdate } = await supabase
      .from('prestamos_kit')
      .update({ estado })
      .eq('id', id)
      .eq('estado', desdeEstado)
      .select('id')
    setProcesando(null)
    if (errorUpdate) {
      alert(traducirError(errorUpdate))
      cargar()
      return
    }
    const desactualizado = !data || data.length === 0
    await cargar()
    // cargar() resetea el error al iniciar; recién ahora, después de que
    // terminó, es seguro mostrar este mensaje sin que se borre solo.
    if (desactualizado) setError('Este préstamo ya había cambiado de estado. Actualizamos la lista.')
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">Kit a crédito</h2>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {activos.length > 0 && (
        <ul className="mb-4 flex flex-col gap-3">
          {activos.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(p.codigo_retiro)}`}
                alt={`Código ${p.codigo_retiro}`}
                className="h-20 w-20 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.trabajadores.perfiles.nombre}</p>
                <p className="text-sm text-neutral-500">
                  Código {p.codigo_retiro} · {p.bodega}
                </p>
                <p className="text-sm text-neutral-500">
                  Saldo: S/ {p.saldo.toFixed(2)} de S/ {p.monto.toFixed(2)} · {p.estado}
                </p>
                {p.estado === 'emitido' && (
                  <button
                    disabled={procesando === p.id}
                    onClick={() => marcar(p.id, 'emitido', 'retirado')}
                    className="mt-1 mr-2 rounded-lg border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700"
                  >
                    Marcar retirado
                  </button>
                )}
                <button
                  disabled={procesando === p.id}
                  onClick={() => marcar(p.id, p.estado, 'perdida')}
                  className="mt-1 rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-700"
                >
                  Marcar perdida
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-3 flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3 sm:flex-row">
        <input
          type="number"
          min={1}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="Monto (S/)"
          className="input sm:w-32"
        />
        <input value={bodega} onChange={(e) => setBodega(e.target.value)} placeholder="Bodega" className="input flex-1" />
      </div>

      {elegibles.length === 0 ? (
        <p className="rounded-xl bg-neutral-100 px-4 py-6 text-center text-sm text-neutral-500">
          No hay trabajadoras elegibles ahora mismo (se necesita verificada, 2+ trabajos y rating ≥ 4.5, sin un
          préstamo activo).
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {elegibles.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-3">
              <div>
                <p className="text-sm font-medium">{t.perfiles.nombre}</p>
                <p className="text-xs text-neutral-500">
                  {t.trabajos_completados} trabajos · {t.rating_avg.toFixed(1)} ★
                </p>
              </div>
              <button
                disabled={procesando === t.id}
                onClick={() => emitir(t.id)}
                className="shrink-0 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                Emitir kit
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
