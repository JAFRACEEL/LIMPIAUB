// Alta de cuenta con confirmación de correo. Lógica pura (sin red) para poder probarla.
//
// Reglas:
//  - signUp NO crea nada en perfiles/trabajadores ni sube archivos: eso pasa solo con sesión (después de confirmar el correo).
//  - El rol NUNCA se lee de user_metadata (la persona puede editarlo): lo fija la app.
//  - De user_metadata solo se aceptan los datos de contacto del cliente, validados, y solo para llenar SU propia fila.
import { ZONAS } from './constantes'
import { esCelularValido } from './validadores'

export interface DatosCliente {
  nombre: string
  telefono: string
  zona: string
  direccion: string
}

/** Datos de contacto que el cliente escribió al registrarse (viajan en user_metadata). Nunca incluye `rol`. */
export function metadataCliente(d: DatosCliente): Record<string, string> {
  return { nombre: d.nombre.trim(), telefono: d.telefono.trim(), zona: d.zona, direccion: d.direccion.trim() }
}

/** Límites de los datos de contacto. Los usan el formulario (antes de crear la cuenta) y la lectura de user_metadata: así lo que se acepta al escribir es lo mismo que se acepta al crear el perfil. */
export const LIMITE_NOMBRE = 120
export const LIMITE_DIRECCION = 200

/**
 * Valida los datos de contacto (nombre, celular, dirección y, si se pide, zona). Devuelve el mensaje para la persona, o null si todo está bien.
 * Es la única regla: el formulario de registro, "Completa tus datos" y "Completar perfil de profesional" la comparten.
 */
export function errorContacto(
  d: { nombre: string; telefono: string; direccion: string; zona?: string | null },
  opciones: { pedirZona?: boolean } = {},
): string | null {
  const { pedirZona = true } = opciones
  const nombre = d.nombre.trim()
  const direccion = d.direccion.trim()
  if (!nombre) return 'Escribe tu nombre completo.'
  if (nombre.length > LIMITE_NOMBRE) return `El nombre es muy largo (máximo ${LIMITE_NOMBRE} caracteres).`
  if (!esCelularValido(d.telefono.trim())) return 'El celular debe tener 9 dígitos y empezar con 9.'
  if (!direccion) return 'Escribe tu dirección.'
  if (direccion.length > LIMITE_DIRECCION) return `La dirección es muy larga (máximo ${LIMITE_DIRECCION} caracteres).`
  if (pedirZona && !(ZONAS as readonly string[]).includes(d.zona ?? '')) return 'Elige tu zona.'
  return null
}

/** Lee y valida los datos del cliente desde user_metadata. null = faltan o son inválidos (no se crea nada). Ignora `rol` y todo lo demás. */
export function datosClienteDesdeMetadata(meta: unknown): DatosCliente | null {
  const d = borradorClienteDesdeMetadata(meta)
  if (errorContacto(d)) return null
  return { nombre: d.nombre.trim(), telefono: d.telefono.trim(), zona: d.zona, direccion: d.direccion.trim() }
}

/** Lo que se pueda leer de user_metadata, SIN validar, para rellenar el formulario "Completa tus datos" y que la persona corrija. */
export function borradorClienteDesdeMetadata(meta: unknown): DatosCliente {
  const m = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {}
  const texto = (v: unknown) => (typeof v === 'string' ? v : '')
  return { nombre: texto(m.nombre), telefono: texto(m.telefono), zona: texto(m.zona), direccion: texto(m.direccion) }
}

/** Fila de `perfiles` de un cliente nuevo. El rol es siempre 'cliente'. */
export function filaPerfilCliente(userId: string, d: DatosCliente) {
  return { id: userId, rol: 'cliente' as const, nombre: d.nombre, telefono: d.telefono, zona: d.zona, direccion: d.direccion }
}

/** Fila de `perfiles` de un profesional nuevo (su cuenta no tenía perfil). `zona` es la primera zona de atención. */
export function filaPerfilProfesional(
  userId: string,
  d: { nombre: string; telefono: string; direccion: string; zonas: string[] },
  fotoUrl: string | null,
) {
  return {
    id: userId,
    rol: 'trabajador' as const,
    nombre: d.nombre.trim(),
    telefono: d.telefono.trim(),
    zona: d.zonas[0],
    direccion: d.direccion.trim(),
    foto_url: fotoUrl,
  }
}

/** Rutas de los archivos ya subidos (Storage). */
export interface RutasArchivos {
  cv: string | null
  antecedentes: string | null
  docFrontal: string | null
  docPosterior: string | null
  docConstancia: string | null
}

export interface FormProfesional {
  genero: string
  nacionalidad: string
  tipoDocumento: string
  numeroDocumento: string
  zonas: string[]
  servicios: string[]
  tarifaHora: number
  experiencia: string
  antecedentes: string
  cuentaAutorizacion: string
  estadoMigratorio: string
  docNumero: string
  docVencimiento: string
  referencia1Nombre: string
  referencia1Celular: string
  referencia2Nombre: string
  referencia2Celular: string
}

/** Fila de `trabajadores`. Es la ÚNICA que crea al profesional, y solo se arma con sesión (desde "Completar perfil"). */
export function filaTrabajador(userId: string, f: FormProfesional, r: RutasArchivos) {
  const extranjera = f.nacionalidad === 'extranjera'
  const conAutorizacion = f.cuentaAutorizacion === 'si'
  return {
    id: userId,
    genero: f.genero,
    nacionalidad: f.nacionalidad,
    tipo_documento: f.tipoDocumento,
    numero_documento: f.numeroDocumento,
    zonas: f.zonas,
    servicios: f.servicios,
    tarifa_hora: f.tarifaHora,
    experiencia: f.experiencia || null,
    cv_ruta: r.cv,
    antecedentes: f.antecedentes,
    antecedentes_doc_ruta: r.antecedentes,
    cuenta_autorizacion_migratoria: extranjera ? conAutorizacion : null,
    estado_migratorio: f.estadoMigratorio,
    doc_migratorio_numero: conAutorizacion ? f.docNumero : null,
    doc_migratorio_vencimiento: conAutorizacion ? f.docVencimiento : null,
    doc_migratorio_frontal_ruta: r.docFrontal,
    doc_migratorio_posterior_ruta: r.docPosterior,
    doc_migratorio_constancia_ruta: r.docConstancia,
    referencia1_nombre: f.referencia1Nombre,
    referencia1_celular: f.referencia1Celular,
    referencia2_nombre: f.referencia2Nombre,
    referencia2_celular: f.referencia2Celular,
  }
}

/** El correo existe pero aún no se confirmó (error de inicio de sesión de Supabase). */
export function esErrorCorreoNoConfirmado(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { message?: unknown; code?: unknown }
  return e.code === 'email_not_confirmed' || (typeof e.message === 'string' && e.message.includes('Email not confirmed'))
}

/** Con la confirmación activa, Supabase no avisa que un correo YA confirmado existe: devuelve un usuario sin identidades. */
export function correoYaTieneCuenta(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0
}

/** Segundos de espera entre reenvíos del correo de confirmación. */
export const ESPERA_REENVIO_S = 60

/** Cliente mínimo de Auth que necesitan estas funciones (permite probarlas sin red). */
export interface AuthMinimo {
  resend: (p: { type: 'signup'; email: string; options?: { emailRedirectTo?: string } }) => Promise<{ error: { message: string } | null }>
}

/** Reenvía el correo de confirmación; el enlace vuelve a la app desde la que se pidió. */
export async function reenviarConfirmacion(auth: AuthMinimo, email: string, origen: string, volver?: string | null) {
  return auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: urlConfirmado(origen, volver) } })
}

/** A dónde vuelve el enlace del correo: la pantalla "/confirmado" de la MISMA app (mismo dominio que la originó). */
export function urlConfirmado(origen: string, volver?: string | null): string {
  const base = `${origen.replace(/\/+$/, '')}/confirmado`
  return volver ? `${base}?volver=${encodeURIComponent(volver)}` : base
}
