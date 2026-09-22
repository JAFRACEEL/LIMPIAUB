import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
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

  if (cargando) {
    return <div className="p-6 text-center text-neutral-500">Cargando…</div>
  }

  if (!session) return <Navigate to="/login" replace />

  if (rolRequerido && perfil && perfil.rol !== rolRequerido) {
    const destino = perfil.rol === 'trabajador' ? '/panel' : '/buscar'
    return <Navigate to={destino} replace />
  }

  return <>{children}</>
}
