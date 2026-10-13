import { modalidadesDeServicio, servicioPorId } from './catalogoServicios'
import {
  ETIQUETA_MODALIDAD,
  MODALIDADES_OPERATIVAS,
  modalidadesDisponibles,
  type ModalidadPrecio,
} from './modalidades'

/**
 * ¿Se puede contratar este servicio hoy? Tres motivos honestos para decir que no:
 *  - ficha:      el servicio no está habilitado en el catálogo.
 *  - modalidad:  se cobra de una forma que todavía no está disponible (no se sustituye por horas).
 *  - cobertura:  no hay profesionales habilitados que lo ofrezcan.
 */
export type MotivoNoDisponible = 'ficha' | 'modalidad' | 'cobertura' | 'zona'

export interface EstadoServicio {
  contratable: boolean
  motivo?: MotivoNoDisponible
  /** Texto para mostrarle al cliente. */
  texto?: string
}

/** Profesionales habilitados por servicio y zona (vista v_cobertura_servicios: solo conteos, sin datos personales). */
export interface Cobertura {
  /** nombre de servicio -> total de profesionales habilitados */
  porServicio: Record<string, number>
  /** `${servicio}|${zona}` -> profesionales */
  porServicioZona: Record<string, number>
}

export const SIN_DATOS_DE_COBERTURA: Cobertura | null = null

/** Filas de la vista: una por servicio y zona, más una por servicio con zona '*' (profesionales distintos en total). */
export function coberturaDesdeFilas(filas: { servicio: string; zona: string; profesionales: number }[]): Cobertura {
  const porServicio: Record<string, number> = {}
  const porServicioZona: Record<string, number> = {}
  for (const f of filas) {
    if (f.zona === '*') porServicio[f.servicio] = f.profesionales
    else porServicioZona[`${f.servicio}|${f.zona}`] = f.profesionales
  }
  return { porServicio, porServicioZona }
}

function listaLegible(modalidades: ModalidadPrecio[]): string {
  const nombres = modalidades.map((m) => ETIQUETA_MODALIDAD[m].toLowerCase())
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} o ${nombres[nombres.length - 1]}`
}

export function estadoServicio(
  servicioId: string,
  cobertura: Cobertura | null,
  operativas: ModalidadPrecio[] = MODALIDADES_OPERATIVAS,
): EstadoServicio {
  const servicio = servicioPorId(servicioId)
  if (!servicio || servicio.habilitado === false) {
    return { contratable: false, motivo: 'ficha', texto: 'Este servicio todavía no está disponible.' }
  }
  const admitidas = modalidadesDeServicio(servicioId)
  // Sin datos de cobertura (sin conexión o vista no cargada) no se bloquea por cobertura: el servidor sigue siendo la barrera.
  const sinProfesionales = !!cobertura && (cobertura.porServicio[servicio.nombre] ?? 0) === 0
  const textoCobertura = `Todavía no tenemos profesionales de ${servicio.nombre} registrados. Estamos sumando técnicos.`
  if (modalidadesDisponibles(admitidas, operativas).length === 0) {
    const texto = `${servicio.nombre} se contrata con ${listaLegible(admitidas)}, y esa forma de contratar todavía no está disponible. Estamos preparándola.`
    // Si además no hay profesionales, se dicen las dos cosas: no se presenta como disponible por ningún motivo.
    return { contratable: false, motivo: 'modalidad', texto: sinProfesionales ? `${texto} ${textoCobertura}` : texto }
  }
  if (sinProfesionales) return { contratable: false, motivo: 'cobertura', texto: textoCobertura }
  return { contratable: true }
}

/** ¿Hay profesionales de este servicio en la zona elegida? (null = sin datos para decirlo) */
export function coberturaEnZona(servicioNombre: string, zona: string, cobertura: Cobertura | null): number | null {
  if (!cobertura || !zona) return null
  return cobertura.porServicioZona[`${servicioNombre}|${zona}`] ?? 0
}
