import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { Estrellas } from '../components/Estrellas'
import type { TrabajadorPublico } from '../types'

interface CalificacionConAutor {
  id: string
  estrellas: number
  comentario: string | null
  creado_en: string
  de_nombre: string
}

export function PerfilTrabajador() {
  const { id } = useParams<{ id: string }>()
  const [trabajador, setTrabajador] = useState<TrabajadorPublico | null>(null)
  const [calificaciones, setCalificaciones] = useState<CalificacionConAutor[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let activo = true
    setCargando(true)
    setError(null)

    Promise.all([
      supabase.from('v_trabajadores_publicos').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('v_calificaciones_publicas')
        .select('id, estrellas, comentario, creado_en, de_nombre')
        .eq('para_id', id)
        .order('creado_en', { ascending: false })
        .limit(5),
    ]).then(([resTrabajador, resCalificaciones]) => {
      if (!activo) return
      if (resTrabajador.error) {
        setError(traducirError(resTrabajador.error))
      } else {
        setTrabajador(resTrabajador.data)
      }
      setCalificaciones((resCalificaciones.data as CalificacionConAutor[]) ?? [])
      setCargando(false)
    })

    return () => {
      activo = false
    }
  }, [id])

  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando perfil…</div>

  if (error || !trabajador) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? 'No encontramos a este profesional, o ya no está disponible.'}
        </p>
        <Link to="/buscar" className="mt-4 inline-block text-sm font-semibold text-teal-700">
          Volver a buscar
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="flex gap-4">
        <img
          src={trabajador.foto_url ?? 'https://placehold.co/96x96?text=%20'}
          alt={trabajador.nombre}
          className="h-24 w-24 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{trabajador.nombre}</h1>
          <p className="text-sm text-neutral-500">{trabajador.zonas.join(' · ')}</p>
          <Estrellas promedio={trabajador.rating_avg} cantidad={trabajador.rating_n} />
          {trabajador.disponible_ahora && (
            <span className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              Disponible ahora
            </span>
          )}
        </div>
      </div>

      <p className="mt-4 text-lg font-semibold text-teal-700">S/ {trabajador.tarifa_hora.toFixed(2)} / hora</p>
      <p className="mt-1 text-sm text-neutral-500">{trabajador.trabajos_completados} trabajos completados</p>

      {trabajador.descripcion && <p className="mt-4 text-sm text-neutral-700">{trabajador.descripcion}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {trabajador.servicios.map((s) => (
          <span key={s} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">
            {s}
          </span>
        ))}
      </div>

      <Link
        to={`/pedir?trabajador=${trabajador.id}`}
        className="mt-6 block rounded-xl bg-teal-700 px-4 py-3 text-center font-semibold text-white"
      >
        Pedir a {trabajador.nombre.split(' ')[0]}
      </Link>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Últimas calificaciones</h2>
      {calificaciones.length === 0 ? (
        <p className="text-sm text-neutral-500">Todavía no tiene calificaciones.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {calificaciones.map((c) => (
            <li key={c.id} className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <Estrellas promedio={c.estrellas} cantidad={1} />
                <span className="text-xs text-neutral-400">
                  {new Date(c.creado_en).toLocaleDateString('es-PE')}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-neutral-600">{c.de_nombre}</p>
              {c.comentario && <p className="mt-1 text-sm text-neutral-700">{c.comentario}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
