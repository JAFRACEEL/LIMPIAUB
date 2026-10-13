import { servicioPorId, type PreguntaServicio, type ServicioCatalogo, type SubtipoServicio } from './catalogoServicios'
import { clasificarLimpieza, resumenLimpieza } from './flujoLimpieza'
import { HORAS_AGENDA_SIN_HORAS, modalidadesDisponibles, type ModalidadPrecio } from './modalidades'
import { modalidadesDeServicio } from './catalogoServicios'
import type { PedidoBorrador } from './borrador'
import { lomasPronto } from './horario'
import {
  estimarFechaEntrega,
  preguntasVisibles,
  resumenRespuestas,
  type DetallesServicio,
  type RespuestaResumen,
} from './preguntasServicio'
import { RECARGO_KIT } from './precios'

export interface ServicioResuelto {
  servicio: ServicioCatalogo
  subtipo: SubtipoServicio | null
}

/** Servicio y subtipo internos que se guardarán, deducidos de lo que respondió el cliente. */
export function resolverServicio(b: PedidoBorrador): ServicioResuelto | null {
  if (b.limpieza) {
    const { servicioId, subtipoId } = clasificarLimpieza(b.limpieza)
    const servicio = servicioPorId(servicioId)
    if (!servicio) return null
    return { servicio, subtipo: servicio.subtipos?.find((s) => s.id === subtipoId) ?? null }
  }
  if (!b.servicioId) return null
  const servicio = servicioPorId(b.servicioId)
  if (!servicio) return null
  const subtipoId = b.subtipoId ?? servicio.subtipoPorDefecto ?? null
  return { servicio, subtipo: servicio.subtipos?.find((s) => s.id === subtipoId) ?? null }
}

export function preguntasDelPedido(b: PedidoBorrador): PreguntaServicio[] {
  const r = resolverServicio(b)
  if (!r) return []
  return preguntasVisibles(r.servicio.nombre, r.subtipo?.id ?? null, b.respuestas)
}

/** Modalidades de cobro que se pueden ofrecer para este pedido. */
export function modalidadesDelPedido(b: PedidoBorrador): ModalidadPrecio[] {
  const r = resolverServicio(b)
  if (!r) return []
  return modalidadesDisponibles(modalidadesDeServicio(r.servicio.id))
}

export function pideKit(b: PedidoBorrador): boolean {
  const r = resolverServicio(b)
  return !!r && r.servicio.seccion === 'limpieza' && r.servicio.pideMateriales !== false && b.modalidad === 'horas'
}

export function conKit(b: PedidoBorrador): boolean {
  return pideKit(b) && b.materiales === 'no' && b.opcionSinMateriales === 'trae_kit'
}

/** Lavado y planchado con recojo y entrega: cambian los textos de fecha y dirección y hay fecha de entrega estimada. */
export function esRecojo(b: PedidoBorrador): boolean {
  return resolverServicio(b)?.servicio.id === 'lavado_planchado' && resolverServicio(b)?.subtipo?.id === 'recojo'
}

/** Fecha en que se hará el servicio (la elegida, o la de "lo antes posible"). */
export function fechaEfectiva(b: PedidoBorrador, ahora: Date): string {
  return b.programacion === 'ahora' ? lomasPronto(ahora).fecha : b.fecha
}

/** Entrega estimada del recojo (orientativa). null si no aplica o si la cantidad es grande: entonces se confirma al recoger. */
export function entregaEstimada(b: PedidoBorrador, ahora: Date): string | null {
  if (!esRecojo(b)) return null
  return estimarFechaEntrega(fechaEfectiva(b, ahora), Number(b.respuestas.cantidad_prendas))
}

export function detalleDelPedido(b: PedidoBorrador) {
  const r = resolverServicio(b)
  return r?.subtipo?.detalle ?? r?.servicio.detalle ?? null
}

export interface ContextoSolicitud {
  clienteId: string
  ahora: Date
  rutasFotos: string[]
}

/** Respuestas legibles que viajan en detalles_servicio (las privadas van aparte, como hasta ahora). */
export function armarDetalles(b: PedidoBorrador, rutasFotos: string[], ahora: Date = new Date()): DetallesServicio | null {
  const r = resolverServicio(b)
  if (!r) return null
  const { publico, privado } = resumenRespuestas(preguntasDelPedido(b), b.respuestas)
  const filas: RespuestaResumen[] = []
  if (b.limpieza) filas.push(...resumenLimpieza(b.limpieza, b.modalidad))
  filas.push(...publico)
  const entrega = entregaEstimada(b, ahora)
  if (entrega) filas.push({ etiqueta: 'Fecha estimada de entrega', valor: entrega })
  if (b.personas > 1) filas.push({ etiqueta: 'Personas', valor: String(b.personas) })
  if (b.modalidad === 'fijo' && b.cantidad > 1) filas.push({ etiqueta: 'Cantidad', valor: String(b.cantidad) })
  if (b.opcionSinMateriales === 'compra_kit') {
    filas.push({ etiqueta: 'Materiales', valor: 'Quiere comprar un kit; se coordina por WhatsApp' })
  }
  if (filas.length === 0 && privado.length === 0 && rutasFotos.length === 0) return null
  return {
    respuestas: filas,
    ...(privado.length > 0 ? { privado } : {}),
    ...(rutasFotos.length > 0 ? { fotos: rutasFotos } : {}),
  }
}

/**
 * Fila que se inserta en `reservas`. NO incluye precios ni comisión: el
 * servidor calcula tarifa, totales y comisión (ver migración 0015), y rechaza
 * lo que el navegador intente mandar.
 */
export function construirSolicitud(b: PedidoBorrador, ctx: ContextoSolicitud): Record<string, unknown> {
  const r = resolverServicio(b)
  if (!r) throw new Error('Falta elegir el servicio.')
  const ahora = b.programacion === 'ahora'
  const { fecha, hora } = ahora ? lomasPronto(ctx.ahora) : { fecha: b.fecha, hora: b.hora }
  const kit = conKit(b)
  const detalle = detalleDelPedido(b)
  const directo = !!b.trabajadorDirectoId

  const notas = [b.notas.trim()].filter(Boolean).join(' · ')

  const fila: Record<string, unknown> = {
    cliente_id: ctx.clienteId,
    servicio: r.servicio.nombre,
    subtipo_servicio: r.subtipo?.nombre ?? null,
    descripcion_trabajo: b.texto.trim() || null,
    foto_referencia_ruta: ctx.rutasFotos[0] ?? null,
    detalles_servicio: armarDetalles(b, ctx.rutasFotos, ctx.ahora),
    fecha,
    hora,
    horas: b.modalidad === 'horas' ? b.horas : HORAS_AGENDA_SIN_HORAS,
    personas: b.personas,
    cantidad: b.modalidad === 'fijo' ? b.cantidad : 1,
    modalidad_precio: b.modalidad,
    programacion: b.programacion,
    direccion: b.direccion.trim(),
    zona: b.zona,
    notas: notas || null,
    con_materiales: kit,
    recargo_materiales: kit ? RECARGO_KIT : 0,
    necesidad: {
      version: 1,
      texto_original: b.texto.trim(),
      servicio_id: r.servicio.id,
      sugerido_id: b.sugeridoId,
      corregido_por_cliente: !!b.sugeridoId && b.sugeridoId !== r.servicio.id,
      alcance: detalle
        ? { incluye: detalle.incluye, no_incluye: detalle.noIncluye, notas: detalle.notas ?? [] }
        : null,
    },
    modo: directo ? 'directo' : 'abierto',
  }
  if (directo) fila.trabajador_id = b.trabajadorDirectoId
  return fila
}
