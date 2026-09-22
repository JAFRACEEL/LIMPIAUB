import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import type { Trabajador } from '../types'

export function Panel() {
  const { session } = useAuth()
  const [trabajador, setTrabajador] = useState<Trabajador | null>(null)
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    if (!session) return
    setCargando(true)
    const { data, error } = await supabase
      .from('trabajadores')
      .select('*')
      .eq('id', session.user.id)
      .single()
    if (error) setError(traducirError(error))
    else setTrabajador(data)
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  async function alternarDisponible() {
    if (!trabajador) return
    setActualizando(true)
    setError(null)
    const nuevoValor = !trabajador.disponible_ahora
    const { error } = await supabase
      .from('trabajadores')
      .update({ disponible_ahora: nuevoValor, ultima_actividad: new Date().toISOString() })
      .eq('id', trabajador.id)

    if (error) {
      setError(traducirError(error))
    } else {
      setTrabajador({ ...trabajador, disponible_ahora: nuevoValor })
    }
    setActualizando(false)
  }

  if (cargando) {
    return <div className="p-6 text-center text-neutral-500">Cargando tu panel…</div>
  }

  if (!trabajador) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? 'No encontramos tu perfil de trabajadora.'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold">Tu panel</h1>
      <p className="mb-6 text-neutral-500">Activa tu disponibilidad cuando quieras recibir pedidos.</p>

      {!trabajador.verificado ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          Tu perfil está en revisión. Un administrador de Limpi verificará tus datos antes de que
          puedas activar "Disponible ahora".
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Disponible ahora</p>
              <p className="text-sm text-neutral-500">
                {trabajador.disponible_ahora
                  ? 'Las clientas te ven en la búsqueda.'
                  : 'No apareces en la búsqueda.'}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={trabajador.disponible_ahora}
              onClick={alternarDisponible}
              disabled={actualizando}
              className={`relative h-9 w-16 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                trabajador.disponible_ahora ? 'bg-green-600' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-transform ${
                  trabajador.disponible_ahora ? 'translate-x-8' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-neutral-100 p-3">
          <dt className="text-xs text-neutral-500">Tarifa</dt>
          <dd className="font-semibold">S/ {trabajador.tarifa_hora.toFixed(2)}</dd>
        </div>
        <div className="rounded-xl bg-neutral-100 p-3">
          <dt className="text-xs text-neutral-500">Trabajos</dt>
          <dd className="font-semibold">{trabajador.trabajos_completados}</dd>
        </div>
        <div className="rounded-xl bg-neutral-100 p-3">
          <dt className="text-xs text-neutral-500">Rating</dt>
          <dd className="font-semibold">
            {trabajador.rating_n > 0 ? trabajador.rating_avg.toFixed(1) : '—'}
          </dd>
        </div>
      </dl>
    </div>
  )
}
