// Guarda los datos del formulario de registro cuando Supabase exige confirmar el
// correo antes de abrir sesión. Se completan perfiles/trabajadores en el primer
// login, una vez que sí hay una sesión activa (auth.uid() disponible para RLS).
import type { Rol } from '../types'

export interface RegistroPendiente {
  email: string
  rol: Rol
  nombre: string
  telefono: string
  zona: string
  direccion?: string
  dni?: string
  servicios?: string[]
  tarifa_hora?: number
  experiencia?: string
  antecedentes?: string
  referencias?: string
}

const CLAVE = 'limpi_registro_pendiente'

export function guardarPendiente(datos: RegistroPendiente) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos))
  } catch {
    // localStorage puede no estar disponible (modo privado); no es crítico.
  }
}

export function leerPendiente(email: string): RegistroPendiente | null {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return null
    const datos = JSON.parse(crudo) as RegistroPendiente
    return datos.email === email ? datos : null
  } catch {
    return null
  }
}

export function limpiarPendiente() {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // ignorar
  }
}
