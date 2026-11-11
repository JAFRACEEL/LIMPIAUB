import { buscarServicioPorNombre, modalidadesDeServicio } from './catalogoServicios'
import type { ModalidadPrecio } from './modalidades'

/** Modalidades en las que el profesional fija su propio precio (las demás no necesitan precio guardado). */
export type ModalidadConPrecio = Extract<ModalidadPrecio, 'fijo' | 'diagnostico'>

export interface RanuraPrecio {
  servicio: string
  modalidad: ModalidadConPrecio
}

export interface PrecioProfesional {
  id: string
  servicio: string
  modalidad: ModalidadConPrecio
  monto: number
  unidad: 'trabajo' | 'unidad'
  alcance: string
  incluye: string[]
  no_incluye: string[]
  activo: boolean
}

export const MONTO_MAXIMO = 99999.99 // numeric(8,2)
export const MAX_LINEAS = 20
export const MAX_LARGO_LINEA = 200

/** Combinaciones servicio + modalidad para las que este profesional puede configurar un precio. */
export function ranurasDePrecio(serviciosDelProfesional: string[]): RanuraPrecio[] {
  const ranuras: RanuraPrecio[] = []
  for (const nombre of serviciosDelProfesional) {
    const servicio = buscarServicioPorNombre(nombre)
    if (!servicio) continue
    for (const m of modalidadesDeServicio(servicio.id)) {
      if (m === 'fijo' || m === 'diagnostico') ranuras.push({ servicio: nombre, modalidad: m })
    }
  }
  return ranuras
}

/** Convierte un texto con una línea por ítem en una lista limpia (sin vacíos ni repetidos). */
export function lineasDeTexto(texto: string): string[] {
  const vistas = new Set<string>()
  const salida: string[] = []
  for (const bruta of texto.split('\n')) {
    const linea = bruta.trim().slice(0, MAX_LARGO_LINEA)
    if (!linea || vistas.has(linea.toLowerCase())) continue
    vistas.add(linea.toLowerCase())
    salida.push(linea)
    if (salida.length >= MAX_LINEAS) break
  }
  return salida
}

export interface BorradorPrecio {
  monto: string
  unidad: 'trabajo' | 'unidad'
  alcance: string
  incluye: string
  noIncluye: string
}

/** Devuelve el mensaje de error en español, o null si el borrador es válido. */
export function validarPrecio(b: BorradorPrecio): string | null {
  const monto = Number(b.monto.replace(',', '.'))
  if (!b.monto.trim() || !Number.isFinite(monto) || monto <= 0) return 'Escribe un precio mayor a cero.'
  if (monto > MONTO_MAXIMO) return 'El precio es demasiado alto.'
  if (Math.round(monto * 100) !== monto * 100 && Math.abs(Math.round(monto * 100) - monto * 100) > 1e-6) {
    return 'Usa como máximo dos decimales.'
  }
  if (!b.alcance.trim()) return 'Describe qué incluye tu trabajo en una o dos frases.'
  if (b.alcance.trim().length > 500) return 'La descripción es muy larga (máximo 500 letras).'
  return null
}

export function montoDeTexto(texto: string): number {
  return Math.round(Number(texto.replace(',', '.')) * 100) / 100
}

/**
 * Pago neto estimado que se muestra al profesional en un pedido abierto.
 * - horas: su tarifa × horas × personas.
 * - fijo/diagnóstico: el precio que configuró (× cantidad si es por unidad); null si aún no lo configuró.
 * - cotización: null, porque el precio lo propone ella.
 */
export function subtotalParaPedido(
  modalidad: ModalidadPrecio | undefined,
  d: { tarifaHora: number; horas: number; personas?: number; cantidad?: number | null; precio?: Pick<PrecioProfesional, 'monto' | 'unidad'> | null },
): number | null {
  const m = modalidad ?? 'horas'
  if (m === 'horas') return Math.round(d.tarifaHora * d.horas * (d.personas ?? 1) * 100) / 100
  if (m === 'fijo' || m === 'diagnostico') {
    if (!d.precio) return null
    const factor = m === 'fijo' && d.precio.unidad === 'unidad' ? (d.cantidad ?? 1) : 1
    return Math.round(d.precio.monto * factor * 100) / 100
  }
  return null
}

export interface BorradorPropuesta {
  manoObra: string
  materiales: string
  movilidad: string
  otros: string
  alcance: string
  incluye: string
  noIncluye: string
}

function importe(texto: string): number {
  const t = texto.trim()
  return t === '' ? 0 : Number(t.replace(',', '.'))
}

export function totalPropuesta(b: BorradorPropuesta): number {
  const partes = [b.manoObra, b.materiales, b.movilidad, b.otros].map(importe)
  return Math.round(partes.reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0) * 100) / 100
}

/** Mismas reglas que enviar_propuesta en el servidor, con mensajes para el profesional. */
export function validarPropuesta(b: BorradorPropuesta): string | null {
  const campos = [b.manoObra, b.materiales, b.movilidad, b.otros].map(importe)
  if (campos.some((n) => !Number.isFinite(n))) return 'Revisa los importes: solo números.'
  if (campos.some((n) => n < 0)) return 'Los importes no pueden ser negativos.'
  if (campos.some((n) => n > MONTO_MAXIMO)) return 'Un importe es demasiado alto.'
  if (campos[0] <= 0) return 'Escribe cuánto cobras por tu mano de obra.'
  if (!b.alcance.trim()) return 'Describe qué vas a hacer, para que el cliente sepa qué paga.'
  if (b.alcance.trim().length > 500) return 'La descripción es muy larga (máximo 500 letras).'
  return null
}

/**
 * Un pedido de precio fijo o de diagnóstico solo se puede aceptar si el profesional tiene un precio
 * activo para ese servicio (el servidor lo exige al generar la oferta). Horas y cotización no lo necesitan.
 */
export function tienePrecioParaPedido(
  modalidad: ModalidadPrecio | undefined,
  servicio: string,
  precios: Pick<PrecioProfesional, 'servicio' | 'modalidad' | 'activo'>[],
): boolean {
  if (modalidad !== 'fijo' && modalidad !== 'diagnostico') return true
  return precios.some((p) => p.activo && p.servicio === servicio && p.modalidad === modalidad)
}
