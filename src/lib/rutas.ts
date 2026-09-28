import type { Perfil } from '../types'

export function destinoPorRol(perfil: Perfil | null): string {
  if (!perfil) return '/'
  if (perfil.rol === 'trabajador') return '/panel'
  if (perfil.rol === 'admin') return '/admin'
  return '/buscar'
}
