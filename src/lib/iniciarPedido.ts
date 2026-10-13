import { borradorVacio, type PedidoBorrador } from './borrador'
import type { DatosLimpieza } from './flujoLimpieza'
import type { PrefillLimpieza } from './interpretar'
import { modalidadesDeServicio, servicioPorId } from './catalogoServicios'
import { modalidadesDisponibles, type ModalidadPrecio } from './modalidades'

/** Clasificaciones que se piden con el flujo de limpieza (casa / ambientes / algo puntual). */
export const FLUJO_LIMPIEZA_IDS = [
  'limpieza_basica',
  'limpieza_profunda_reorganizacion',
  'oficinas_comercios',
  'alojamientos_airbnb',
  'postevento',
]

export function usaFlujoLimpieza(servicioId: string | null): boolean {
  return !!servicioId && FLUJO_LIMPIEZA_IDS.includes(servicioId)
}

export function datosLimpiezaIniciales(pre?: Partial<PrefillLimpieza>): DatosLimpieza {
  return {
    espacio: pre?.espacio ?? 'hogar',
    alcance: pre?.alcance ?? 'casa',
    ambientes: pre?.ambientes ?? [],
    puntual: pre?.puntual ?? '',
    tareas: [],
    reorganizar: pre?.reorganizar ?? false,
  }
}

/** Modalidad inicial: la sugerida si está operativa; si no, la primera disponible del servicio. */
export function modalidadInicial(servicioId: string, sugerida?: ModalidadPrecio): ModalidadPrecio {
  const disponibles = modalidadesDisponibles(modalidadesDeServicio(servicioId))
  if (sugerida && disponibles.includes(sugerida)) return sugerida
  return disponibles[0] ?? 'horas'
}

/**
 * Prepara un borrador para un servicio ya elegido. Para limpieza arma los datos
 * del flujo (casa / ambientes / puntual) y deja la clasificación interna sin
 * preguntársela al cliente.
 */
export function borradorParaServicio(
  servicioId: string,
  opciones: { texto?: string; sugeridoId?: string | null; limpieza?: Partial<PrefillLimpieza>; modalidadSugerida?: ModalidadPrecio; trabajadorDirectoId?: string | null } = {},
): PedidoBorrador {
  const base = borradorVacio()
  const servicio = servicioPorId(servicioId)
  const limpieza = usaFlujoLimpieza(servicioId) ? datosLimpiezaIniciales(opciones.limpieza) : null
  return {
    ...base,
    texto: opciones.texto ?? '',
    servicioId,
    sugeridoId: opciones.sugeridoId ?? servicioId,
    confirmado: true,
    limpieza,
    subtipoId: servicio?.subtipoPorDefecto ?? null,
    modalidad: modalidadInicial(servicioId, opciones.modalidadSugerida),
    horas: 2,
    trabajadorDirectoId: opciones.trabajadorDirectoId ?? null,
  }
}

/** Cambiar de servicio conservando lo que el cliente escribió. */
export function cambiarServicio(b: PedidoBorrador, servicioId: string): PedidoBorrador {
  return {
    ...borradorParaServicio(servicioId, {
      texto: b.texto,
      sugeridoId: b.sugeridoId,
      trabajadorDirectoId: b.trabajadorDirectoId,
    }),
    direccion: b.direccion,
    zona: b.zona,
    programacion: b.programacion,
    fecha: b.fecha,
    hora: b.hora,
    notas: b.notas,
  }
}
