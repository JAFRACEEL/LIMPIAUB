// Forma de los datos del formulario de registro que todavía no tienen fila
// en perfiles/trabajadores. Cuando Supabase exige confirmar el correo antes
// de abrir sesión, estos datos viajan en user_metadata (supabase.auth.signUp
// con `options: { data }`) en vez de localStorage: así sobreviven aunque el
// enlace de confirmación se abra en otro navegador o dispositivo del que se
// registró. AuthContext.cargarPerfil los usa para completar el alta en el
// primer login. Nota: los archivos (foto, CV, antecedentes, documentos
// migratorios) no viajan aquí (user_metadata no admite File) y se pierden en
// este camino; la persona deberá volver a subirlos desde su panel.
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

// Respaldo temporal: registros que quedaron pendientes con una versión
// anterior (antes de mover esto a user_metadata) guardaron sus datos aquí.
// Sin este fallback, esas cuentas quedarían varadas para siempre. Se puede
// quitar una vez que ya no queden registros pendientes de esa época.
const CLAVE = 'limpi_registro_pendiente'

export function leerPendienteLegado(email: string): RegistroPendiente | null {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return null
    const datos = JSON.parse(crudo) as RegistroPendiente
    return datos.email === email ? datos : null
  } catch {
    return null
  }
}

export function limpiarPendienteLegado() {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // ignorar
  }
}
