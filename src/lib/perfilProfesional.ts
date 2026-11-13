// Al completar el perfil de profesional con una cuenta que ya existe (p. ej. un cliente), el perfil base no se crea
// de nuevo: se actualizan solo los datos de contacto que la persona editó. NUNCA se envía `rol` (la API no puede
// cambiarlo y la columna está congelada), ni `zona` salvo que se haya cambiado.

export interface DatosContacto {
  nombre: string
  telefono: string
  direccion: string
  zona?: string
}

export interface PerfilBase {
  nombre: string
  telefono: string
  direccion: string | null
  zona: string
}

/** Campos de `perfiles` a actualizar: solo los que cambiaron (y la foto, si se subió una). Vacío = nada que guardar. */
export function cambiosPerfilAlCompletar(
  actual: PerfilBase,
  nuevo: DatosContacto,
  fotoUrl: string | null,
): Record<string, string> {
  const cambios: Record<string, string> = {}
  const nombre = nuevo.nombre.trim()
  const direccion = nuevo.direccion.trim()
  if (nombre && nombre !== actual.nombre) cambios.nombre = nombre
  if (nuevo.telefono !== actual.telefono) cambios.telefono = nuevo.telefono
  if (direccion && direccion !== (actual.direccion ?? '')) cambios.direccion = direccion
  if (nuevo.zona && nuevo.zona !== actual.zona) cambios.zona = nuevo.zona
  if (fotoUrl) cambios.foto_url = fotoUrl
  return cambios
}
