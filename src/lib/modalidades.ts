/**
 * Formas de cobrar un trabajo. Se guardan en `reservas.modalidad_precio`.
 *
 * - horas:       tarifa del profesional × horas × personas.
 * - fijo:        importe por trabajo o unidad, con alcance definido por el profesional.
 * - diagnostico: visita con precio conocido; la reparación va aparte, con presupuesto.
 * - cotizacion:  el profesional evalúa (tamaño, condiciones, fotos) y envía una propuesta.
 */
export type ModalidadPrecio = 'horas' | 'fijo' | 'diagnostico' | 'cotizacion'

export const TODAS_LAS_MODALIDADES: ModalidadPrecio[] = ['horas', 'fijo', 'diagnostico', 'cotizacion']

export const ETIQUETA_MODALIDAD: Record<ModalidadPrecio, string> = {
  horas: 'Por horas',
  fijo: 'Precio fijo',
  diagnostico: 'Visita de diagnóstico',
  cotizacion: 'Cotización',
}

/**
 * Modalidades que hoy se pueden CONTRATAR de punta a punta.
 *
 * Fijo, diagnóstico y cotización necesitan que el profesional configure sus
 * precios y envíe propuestas, y eso vive en el panel del profesional (etapa
 * siguiente). El modelo de datos, las funciones del servidor y la pantalla del
 * cliente ya existen, pero no se ofrecen hasta activar VITE_PROPUESTAS_ACTIVAS=1
 * para no dejar al cliente esperando algo que nadie puede responder.
 */
export function modalidadesOperativas(propuestasActivas: string | undefined): ModalidadPrecio[] {
  return propuestasActivas === '1' ? TODAS_LAS_MODALIDADES : ['horas']
}

export const MODALIDADES_OPERATIVAS = modalidadesOperativas(import.meta.env.VITE_PROPUESTAS_ACTIVAS)

/** Modalidades que el servicio admite (catálogo) y que hoy son operativas. */
export function modalidadesDisponibles(
  admitidas: ModalidadPrecio[] | undefined,
  operativas: ModalidadPrecio[] = MODALIDADES_OPERATIVAS,
): ModalidadPrecio[] {
  const base = admitidas && admitidas.length > 0 ? admitidas : (['horas'] as ModalidadPrecio[])
  return base.filter((m) => operativas.includes(m))
}

/** Un servicio solo se ofrece si tiene al menos una forma de contratación operativa. */
export function servicioContratable(
  habilitado: boolean | undefined,
  admitidas: ModalidadPrecio[] | undefined,
  operativas: ModalidadPrecio[] = MODALIDADES_OPERATIVAS,
): boolean {
  return habilitado !== false && modalidadesDisponibles(admitidas, operativas).length > 0
}

/**
 * Horas que se reservan en agenda cuando el cobro no es por horas. No es un
 * precio ni una promesa de duración: solo evita solapar al profesional (el
 * servidor y los controles de cruce trabajan con una ventana de tiempo).
 */
export const HORAS_AGENDA_SIN_HORAS = 2
export const HORAS_MIN = 2
export const HORAS_MAX = 12
export const PERSONAS_MAX = 4
