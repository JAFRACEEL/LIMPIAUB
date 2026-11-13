import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { APP } from '../lib/app'

/** Qué hace falta para entrar: 'cliente' = cualquier cuenta con perfil; 'profesional' = tener su perfil de profesional; 'admin' = estar en `admins`. */
export type Capacidad = 'cliente' | 'profesional' | 'admin'

export function RutaProtegida({ children, requiere }: { children: ReactNode; requiere?: Capacidad }) {
  const { cargando, session, perfil, esProfesional, esAdmin } = useAuth()
  const ubicacion = useLocation()

  if (cargando) {
    return <div className="p-6 text-center text-neutral-500">Cargando…</div>
  }

  if (!session) {
    // Después de entrar se vuelve a donde estaba (los pedidos en borrador se conservan).
    return <Navigate to={`/login?volver=${encodeURIComponent(ubicacion.pathname + ubicacion.search)}`} replace />
  }

  if (requiere) {
    // Sin perfil de profesional (con o sin perfil base): en la app Profesional se completa; en las demás se vuelve al inicio.
    if (requiere === 'profesional' && !esProfesional) return <Navigate to={APP === 'profesional' ? '/registro' : '/'} replace />
    if (!perfil) return <Navigate to="/" replace />
    if (requiere === 'admin' && !esAdmin) return <Navigate to="/" replace />
  }

  return <>{children}</>
}
