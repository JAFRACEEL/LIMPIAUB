import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Rol } from '../types'

export function RutaProtegida({
  children,
  rolRequerido,
}: {
  children: ReactNode
  rolRequerido?: Rol
}) {
  const { cargando, session, perfil } = useAuth()
  const ubicacion = useLocation()

  if (cargando) {
    return <div className="p-6 text-center text-neutral-500">Cargando…</div>
  }

  if (!session) {
    // Después de entrar se vuelve a donde estaba (los pedidos en borrador se conservan).
    return <Navigate to={`/login?volver=${encodeURIComponent(ubicacion.pathname + ubicacion.search)}`} replace />
  }

  if (rolRequerido) {
    if (!perfil) return <Navigate to="/" replace />
    if (perfil.rol !== rolRequerido) {
      const destino = perfil.rol === 'trabajador' ? '/panel' : perfil.rol === 'admin' ? '/admin' : '/'
      return <Navigate to={destino} replace />
    }
  }

  return <>{children}</>
}
