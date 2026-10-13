import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { ZONAS, SERVICIOS } from '../lib/constantes'
import { Estrellas } from '../components/Estrellas'
import type { TrabajadorPublico } from '../types'

export function Buscar() {
  const [trabajadores, setTrabajadores] = useState<TrabajadorPublico[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [zona, setZona] = useState('')
  const [servicio, setServicio] = useState('')
  const [soloDisponibles, setSoloDisponibles] = useState(false)

  useEffect(() => {
    let activo = true
    setCargando(true)
    setError(null)

    let query = supabase
      .from('v_trabajadores_publicos')
      .select('*')
      .order('rating_avg', { ascending: false })
      .order('trabajos_completados', { ascending: false })

    if (zona) query = query.contains('zonas', [zona])
    if (servicio) query = query.contains('servicios', [servicio])
    if (soloDisponibles) query = query.eq('disponible_ahora', true)

    query.then(({ data, error }) => {
      if (!activo) return
      if (error) {
        setError(traducirError(error))
      } else {
        setTrabajadores(data ?? [])
      }
      setCargando(false)
    })

    return () => {
      activo = false
    }
  }, [zona, servicio, soloDisponibles])

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Profesionales</h1>
        <Link
          to="/pedir"
          className="shrink-0 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
        >
          Pedir un servicio
        </Link>
      </div>

      <div className="mb-5 flex flex-col gap-3">
        <select
          value={zona}
          onChange={(e) => setZona(e.target.value)}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm"
        >
          <option value="">Todas las zonas</option>
          {ZONAS.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>

        <select
          value={servicio}
          onChange={(e) => setServicio(e.target.value)}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm"
        >
          <option value="">Todos los servicios</option>
          {SERVICIOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={soloDisponibles}
            onChange={(e) => setSoloDisponibles(e.target.checked)}
            className="h-4 w-4 accent-teal-700"
          />
          Solo disponibles ahora
        </label>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {cargando ? (
        <p className="text-center text-neutral-500">Buscando…</p>
      ) : trabajadores.length === 0 ? (
        <p className="rounded-xl bg-neutral-100 px-4 py-6 text-center text-sm text-neutral-500">
          {zona
            ? `Aún no hay profesionales en ${zona}. Prueba con Iquitos u otra zona.`
            : 'Aún no hay profesionales disponibles con esos filtros.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {trabajadores.map((t) => (
            <li key={t.id}>
              <Link
                to={`/t/${t.id}`}
                className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-3"
              >
                <img
                  src={t.foto_url ?? 'https://placehold.co/64x64?text=%20'}
                  alt={t.nombre}
                  className="h-16 w-16 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold">{t.nombre}</p>
                    {t.disponible_ahora && (
                      <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Disponible ahora
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-500">{t.zonas.join(' · ')}</p>
                  <Estrellas promedio={t.rating_avg} cantidad={t.rating_n} />
                  <p className="mt-1 text-sm font-semibold text-teal-700">
                    S/ {t.tarifa_hora.toFixed(2)} / hora
                  </p>
                  <p className="truncate text-xs text-neutral-500">{t.servicios.join(' · ')}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
