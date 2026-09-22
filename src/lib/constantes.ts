export const ZONAS = [
  'Iquitos centro',
  'Punchana',
  'Belén',
  'San Juan Bautista',
  'Moronacocha',
  'Versalles / Sachachorro',
  'Nanay / Bellavista',
  'Quistococha',
  'Otra',
] as const

export type Zona = (typeof ZONAS)[number]

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
