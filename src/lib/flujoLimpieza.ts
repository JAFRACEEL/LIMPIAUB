import { TAREA_REORGANIZAR } from './sinonimos'
import { servicioLimpiezaPrefill, type PrefillLimpieza } from './interpretar'
import type { RespuestaResumen } from './preguntasServicio'
import type { ModalidadPrecio } from './modalidades'

/**
 * Limpieza sin obligar a distinguir "básica" de "profunda".
 *
 * El cliente describe qué quiere limpiar y cuánto. Internamente se conservan
 * las clasificaciones del catálogo (porque las profesionales se asignan por
 * ellas), pero se deducen de lo que el cliente dijo, nunca de una pregunta
 * "¿básica o profunda?". Reorganizar pertenencias solo entra si el cliente lo
 * pide expresamente.
 */

export type AlcanceLimpieza = 'casa' | 'ambientes' | 'puntual'
export type TamanoLimpieza = 'pequeno' | 'mediano' | 'grande' | 'no_se'
export type EstadoLimpieza = 'normal' | 'acumulado'

export interface DatosLimpieza {
  espacio: PrefillLimpieza['espacio']
  alcance: AlcanceLimpieza
  ambientes: string[]
  puntual: string
  /** Tareas en el orden de prioridad que eligió el cliente (solo "por horas"). */
  tareas: string[]
  reorganizar: boolean
  tamano?: TamanoLimpieza
  estado?: EstadoLimpieza
}

export const ETIQUETA_ALCANCE: Record<AlcanceLimpieza, string> = {
  casa: 'Mi casa',
  ambientes: 'Algunos ambientes',
  puntual: 'Algo puntual',
}

export const ETIQUETA_TAMANO: Record<TamanoLimpieza, string> = {
  pequeno: 'Pequeño (hasta 2 ambientes)',
  mediano: 'Mediano (3 a 5 ambientes)',
  grande: 'Grande (6 ambientes o más)',
  no_se: 'No estoy seguro/a',
}

export const ETIQUETA_ESTADO: Record<EstadoLimpieza, string> = {
  normal: 'Limpieza de mantenimiento',
  acumulado: 'Hay mucha suciedad acumulada',
}

const TAREAS_CASA = [
  'Barrer y trapear pisos',
  'Limpiar baños',
  'Limpiar la cocina',
  'Quitar el polvo de muebles',
  'Limpiar espejos y vidrios al alcance',
  'Lavar los platos',
  'Sacar la basura',
]

const TAREAS_POR_AMBIENTE: Record<string, string[]> = {
  Cocina: ['Limpiar mesón y cocina', 'Lavar los platos', 'Limpiar el exterior de la refrigeradora', 'Trapear el piso'],
  Baños: ['Limpiar inodoro y lavatorio', 'Limpiar ducha', 'Limpiar espejos', 'Trapear el piso'],
  Dormitorios: ['Quitar el polvo', 'Barrer y trapear', 'Tender camas'],
  'Sala y comedor': ['Quitar el polvo', 'Barrer y trapear', 'Limpiar mesas y superficies'],
  'Patio o terraza': ['Barrer', 'Lavar el piso', 'Recoger hojas y residuos'],
  Lavandería: ['Limpiar el lavadero', 'Barrer y trapear'],
}

/** Tareas que se ofrecen como prioridades según lo que el cliente quiere limpiar. */
export function tareasSugeridas(d: Pick<DatosLimpieza, 'alcance' | 'ambientes'>): string[] {
  if (d.alcance === 'puntual') return []
  const base =
    d.alcance === 'casa'
      ? TAREAS_CASA
      : Array.from(new Set(d.ambientes.flatMap((a) => TAREAS_POR_AMBIENTE[a] ?? [])))
  return [...base, TAREA_REORGANIZAR]
}

/** ¿Hay que preguntar algo más de limpieza antes de seguir? Solo lo necesario. */
export function limpiezaCompleta(d: DatosLimpieza, modalidad: ModalidadPrecio): string | null {
  if (d.alcance === 'ambientes' && d.ambientes.length === 0) return 'Elige qué ambientes quieres limpiar.'
  if (d.alcance === 'puntual' && !d.puntual.trim()) return 'Cuéntanos qué quieres limpiar.'
  if (modalidad === 'cotizacion') {
    if (d.alcance !== 'puntual' && !d.tamano) return 'Elige el tamaño aproximado para preparar la propuesta.'
  }
  return null
}

/** Clasificación interna del catálogo y subtipo, deducidos (nunca preguntados). */
export function clasificarLimpieza(d: DatosLimpieza): { servicioId: string; subtipoId: string | null } {
  const pre: PrefillLimpieza = {
    espacio: d.espacio,
    alcance: d.alcance,
    ambientes: d.ambientes,
    puntual: d.puntual,
    reorganizar: d.reorganizar || d.tareas.includes(TAREA_REORGANIZAR),
  }
  const servicioId = servicioLimpiezaPrefill(pre)
  if (servicioId === 'oficinas_comercios' || servicioId === 'alojamientos_airbnb') {
    return { servicioId, subtipoId: d.estado === 'acumulado' ? 'profunda' : 'rutinaria' }
  }
  return { servicioId, subtipoId: null }
}

/** Resumen legible (etiqueta/valor) que viaja en detalles_servicio.respuestas. */
export function resumenLimpieza(d: DatosLimpieza, modalidad: ModalidadPrecio): RespuestaResumen[] {
  const filas: RespuestaResumen[] = [{ etiqueta: 'Qué limpiar', valor: ETIQUETA_ALCANCE[d.alcance] }]
  if (d.alcance === 'ambientes' && d.ambientes.length > 0) filas.push({ etiqueta: 'Ambientes', valor: d.ambientes.join(', ') })
  if (d.alcance === 'puntual' && d.puntual.trim()) filas.push({ etiqueta: 'Lo puntual', valor: d.puntual.trim() })
  if (modalidad === 'horas' && d.tareas.length > 0) {
    filas.push({ etiqueta: 'Tareas prioritarias (en orden)', valor: d.tareas.map((t, i) => `${i + 1}. ${t}`).join(' · ') })
  }
  if (d.tamano) filas.push({ etiqueta: 'Tamaño aproximado', valor: ETIQUETA_TAMANO[d.tamano] })
  if (d.estado) filas.push({ etiqueta: 'Estado', valor: ETIQUETA_ESTADO[d.estado] })
  if (d.reorganizar || d.tareas.includes(TAREA_REORGANIZAR)) {
    filas.push({ etiqueta: 'Pedido expreso', valor: 'Reorganizar pertenencias' })
  }
  return filas
}

export const AVISO_HORAS_LIMPIEZA =
  'Pagas por el tiempo de trabajo, no por terminar todo. Si el tiempo contratado no alcanza, la profesional avanza en el orden de prioridad que elegiste.'

export const TEXTO_MODALIDAD_LIMPIEZA: Record<'horas' | 'cotizacion', { titulo: string; detalle: string }> = {
  horas: {
    titulo: 'Ayuda para limpiar por horas',
    detalle: 'Eliges cuántas horas y qué es lo más importante. Ves el precio de cada profesional antes de contratar.',
  },
  cotizacion: {
    titulo: 'Quiero que limpien esto',
    detalle: 'Defines qué quieres limpiado y recibes una propuesta de precio. No hay estimación automática.',
  },
}
