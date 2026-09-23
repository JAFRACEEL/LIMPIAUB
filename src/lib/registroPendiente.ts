// Guarda los datos del formulario de registro cuando Supabase exige confirmar el
// correo antes de abrir sesión. Se completan perfiles/trabajadores en el primer
// login, una vez que sí hay una sesión activa (auth.uid() disponible para RLS).
// Nota: los archivos (foto, CV, antecedentes, documentos migratorios) no se
// pueden guardar aquí (localStorage no admite File) y se pierden en este
// camino; la persona deberá volver a subirlos desde su panel más adelante.
import type { Rol, Genero, Nacionalidad, TipoDocumento, EstadoMigratorio } from '../types'

export interface RegistroPendiente {
  email: string
  rol: Rol
  nombre: string
  telefono: string
  zona: string
  direccion?: string
  genero?: Genero
  nacionalidad?: Nacionalidad
  tipo_documento?: TipoDocumento
  numero_documento?: string
  zonas?: string[]
  servicios?: string[]
  tarifa_hora?: number
  experiencia?: string
  antecedentes?: string
  cuenta_autorizacion_migratoria?: boolean
  estado_migratorio?: EstadoMigratorio
  doc_migratorio_numero?: string
  doc_migratorio_vencimiento?: string
  referencia1_nombre?: string
  referencia1_celular?: string
  referencia2_nombre?: string
  referencia2_celular?: string
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
