export const ZONAS = [
  'Iquitos',
  'Belén',
  'Participación',
  'San Juan',
  'Santa Clara',
  'Santo Tomás',
  'Carretera Iquitos–Nauta hasta Quistococha',
  'Punchana',
  'Circunvalación',
  'Versalles',
  'Masusa',
  'Bellavista-Nanay',
] as const

export type Zona = (typeof ZONAS)[number]

export const MAX_ZONAS_TRABAJADOR = 3

export const SERVICIOS = [
  'Casas y departamentos',
  'Oficinas y comercios',
  'Hospedajes / Airbnb',
  'Limpieza profunda / post fiesta',
  'Lavado y planchado',
  'Post construcción',
] as const

export type Servicio = (typeof SERVICIOS)[number]

export const ANTECEDENTES = [
  { value: 'vigente', label: 'Vigente' },
  { value: 'en_tramite', label: 'En trámite' },
  { value: 'no', label: 'No tengo' },
] as const

export const GENEROS = [
  { value: 'femenino', label: 'Femenino' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'otro', label: 'Otro' },
  { value: 'prefiero_no_decir', label: 'Prefiero no decirlo' },
] as const

export const NACIONALIDADES = [
  { value: 'peruana', label: 'Peruana' },
  { value: 'extranjera', label: 'Extranjera' },
] as const

export const TIPO_DOCUMENTO_PERUANA = { value: 'dni', label: 'DNI' } as const

export const TIPOS_DOCUMENTO_EXTRANJERA = [
  { value: 'carne_extranjeria', label: 'Carné de Extranjería' },
  { value: 'cpp', label: 'Carné de Permiso Temporal de Permanencia (CPP)' },
  { value: 'ctm', label: 'Carné Temporal Migratorio (CTM)' },
  { value: 'carne_mre', label: 'Carné de Identidad emitido por el Ministerio de Relaciones Exteriores' },
  { value: 'pasaporte', label: 'Pasaporte' },
] as const

const TIPOS_DOCUMENTO_TODOS = [TIPO_DOCUMENTO_PERUANA, ...TIPOS_DOCUMENTO_EXTRANJERA]

export function etiquetaTipoDocumento(valor: string): string {
  return TIPOS_DOCUMENTO_TODOS.find((t) => t.value === valor)?.label ?? valor
}

export function etiquetaAntecedentes(valor: string | null): string {
  if (!valor) return '—'
  return ANTECEDENTES.find((a) => a.value === valor)?.label ?? valor
}

export function etiquetaGenero(valor: string): string {
  return GENEROS.find((g) => g.value === valor)?.label ?? valor
}

export const ESTADO_RESERVA_LABELS: Record<string, string> = {
  solicitada: 'Buscando trabajadora',
  aceptada: 'Confirmada',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
  rechazada: 'Rechazada',
}

export function fechaHoyLima(): string {
  // en-CA da formato YYYY-MM-DD. new Date().toISOString() usa UTC y se
  // adelanta un día entre 7pm y medianoche hora de Perú (UTC-5).
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
}

function formatoFecha(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

export function inicioSemanaLima(): string {
  const d = new Date(`${fechaHoyLima()}T00:00:00`)
  const diaSemana = d.getDay() // 0 = domingo … 6 = sábado
  const diasDesdeLunes = diaSemana === 0 ? 6 : diaSemana - 1
  d.setDate(d.getDate() - diasDesdeLunes)
  return formatoFecha(d)
}

export function inicioMesLima(): string {
  return `${fechaHoyLima().slice(0, 7)}-01`
}

export function whatsappUrl(celular: string, mensaje?: string): string {
  const numero = `51${celular.replace(/\D/g, '')}`
  return `https://wa.me/${numero}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`
}
