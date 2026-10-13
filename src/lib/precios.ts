import { calcularComision } from './calculos'
import { HORAS_MAX, HORAS_MIN, PERSONAS_MAX, type ModalidadPrecio } from './modalidades'

/** Recargo de kit de limpieza (se reparte S/13 profesional + S/5 Limpi, ver calcularComision). */
export const RECARGO_KIT = 18

export function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Mano de obra por horas: tarifa × horas × personas. Misma regla que el servidor. */
export function manoObraPorHoras(tarifaHora: number, horas: number, personas = 1): number {
  return redondear(tarifaHora * horas * personas)
}

export function horasValidas(horas: number): boolean {
  return Number.isInteger(horas) && horas >= HORAS_MIN && horas <= HORAS_MAX
}

export function personasValidas(personas: number): boolean {
  return Number.isInteger(personas) && personas >= 1 && personas <= PERSONAS_MAX
}

/** Mano de obra de una modalidad con precio conocido; null cuando todavía no hay precio. */
export function manoObraOferta(
  modalidad: ModalidadPrecio,
  datos: { tarifaHora?: number | null; horas?: number; personas?: number; montoFijo?: number | null; cantidad?: number },
): number | null {
  if (modalidad === 'horas') {
    if (datos.tarifaHora == null || !datos.horas) return null
    return manoObraPorHoras(datos.tarifaHora, datos.horas, datos.personas ?? 1)
  }
  if (modalidad === 'fijo' || modalidad === 'diagnostico') {
    if (datos.montoFijo == null) return null
    return redondear(datos.montoFijo * (modalidad === 'fijo' ? (datos.cantidad ?? 1) : 1))
  }
  return null // cotización: nunca hay precio automático
}

export interface Cargos {
  manoObra: number
  materiales?: number
  movilidad?: number
  otros?: number
  /** Parte de la visita de diagnóstico que se descuenta al contratar la reparación. */
  descuentoVisita?: number
  /** Recargo de kit de limpieza (aparte del resto de materiales). */
  kit?: number
}

export interface Desglose {
  manoObra: number
  descuentoVisita: number
  manoObraNeta: number
  materiales: number
  kit: number
  movilidad: number
  otros: number
  /** Lo que paga el cliente. */
  total: number
  /** Base de la comisión del 20%: mano de obra neta (diagnóstico incluido) + kit con su reparto fijo. */
  baseComision: number
}

/** Separa mano de obra, materiales, movilidad y otros cargos autorizados. */
export function desglosar(c: Cargos): Desglose {
  const descuentoVisita = Math.min(c.descuentoVisita ?? 0, c.manoObra)
  const manoObraNeta = redondear(c.manoObra - descuentoVisita)
  const materiales = c.materiales ?? 0
  const kit = c.kit ?? 0
  const movilidad = c.movilidad ?? 0
  const otros = c.otros ?? 0
  return {
    manoObra: c.manoObra,
    descuentoVisita,
    manoObraNeta,
    materiales,
    kit,
    movilidad,
    otros,
    total: redondear(manoObraNeta + materiales + kit + movilidad + otros),
    baseComision: manoObraNeta,
  }
}

/**
 * Descuento de la visita al contratar la reparación con el mismo profesional.
 * Nunca supera el presupuesto de reparación (no hay importe negativo) y solo
 * aplica si la visita ya fue aceptada y es del mismo profesional: así no se
 * cobra dos veces la visita.
 */
export function descuentoDeVisita(
  manoObraReparacion: number,
  visita: { manoObra: number; trabajadorId: string; aceptada: boolean } | null,
  trabajadorReparacionId: string,
): number {
  if (!visita || !visita.aceptada || visita.trabajadorId !== trabajadorReparacionId) return 0
  return Math.min(visita.manoObra, manoObraReparacion)
}

/** Comisión de Limpi y neto del profesional sobre un desglose (regla vigente: % sobre mano de obra). */
export function repartoDelDesglose(d: Desglose, comisionPct: number) {
  return calcularComision(d.baseComision, comisionPct, d.kit)
}

export function formatoSoles(n: number): string {
  return `S/ ${n.toFixed(2)}`
}
