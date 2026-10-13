import { limpiezaCompleta } from './flujoLimpieza'
import { esFuturo } from './horario'
import { HORAS_MAX, HORAS_MIN, PERSONAS_MAX } from './modalidades'
import { validarRespuestas } from './preguntasServicio'
import { oficiosFueraDeGenerales } from './interpretar'
import { ETIQUETA_SERVICIO_CORTA } from './sinonimos'
import type { PedidoBorrador } from './borrador'
import { conKit, modalidadesDelPedido, pideKit, preguntasDelPedido, resolverServicio } from './solicitud'

/** Cada validador devuelve el primer problema en lenguaje cotidiano, o null si se puede avanzar. */

export function validarNecesidad(b: PedidoBorrador, cantidadFotos: number): string | null {
  const r = resolverServicio(b)
  if (!r) return 'Cuéntanos qué necesitas o elige un servicio.'
  if (r.servicio.habilitado === false) return 'Este servicio todavía no está disponible.'

  if (r.servicio.requiereDescripcionTrabajo && b.texto.trim().length < 3) {
    return 'Cuéntanos con tus palabras qué pasa, para que el profesional sepa a qué va.'
  }

  const oficio = problemaDeOficio(b)
  if (oficio) return oficio

  const permitidas = modalidadesDelPedido(b)
  if (permitidas.length === 0) return 'Este servicio se contrata de una forma que todavía no está disponible.'
  if (!permitidas.includes(b.modalidad)) return 'Elige cómo quieres contratar.'

  if (r.servicio.preguntaSubtipoSimple && !b.subtipoId) return r.servicio.preguntaSubtipoSimple.pregunta

  const errorPreguntas = validarRespuestas(preguntasDelPedido(b), b.respuestas)
  if (errorPreguntas) return errorPreguntas

  if (b.limpieza) {
    const falta = limpiezaCompleta(b.limpieza, b.modalidad)
    if (falta) return falta
  }

  if (r.servicio.fotos?.obligatorias && cantidadFotos === 0) {
    return 'Sube al menos una foto actual para poder preparar el servicio.'
  }

  if (b.modalidad === 'horas') {
    if (!Number.isInteger(b.horas) || b.horas < HORAS_MIN || b.horas > HORAS_MAX) {
      return `Elige entre ${HORAS_MIN} y ${HORAS_MAX} horas.`
    }
  }
  if (!Number.isInteger(b.personas) || b.personas < 1 || b.personas > PERSONAS_MAX) {
    return `Las personas deben ser entre 1 y ${PERSONAS_MAX}.`
  }

  if (pideKit(b)) {
    if (!b.materiales) return '¿Tu espacio tiene materiales de limpieza? Elige Sí o No.'
    if (b.materiales === 'no' && !b.opcionSinMateriales) return 'Elige cómo resolver los materiales de limpieza.'
  }
  return null
}

/** "Reparaciones generales" no es un atajo para pedir por horas un oficio cuya forma de cobro está deshabilitada. */
export function problemaDeOficio(b: PedidoBorrador): string | null {
  if (resolverServicio(b)?.servicio.id !== 'mantenimiento_general') return null
  const oficios = oficiosFueraDeGenerales(b.texto)
  if (oficios.length === 0) return null
  const etiqueta = ETIQUETA_SERVICIO_CORTA[oficios[0]] ?? oficios[0]
  return `Lo que cuentas parece ser de ${etiqueta}. «Reparaciones generales» no cubre electricidad, gasfitería ni otros oficios: pídelo como ${etiqueta}.`
}

export function validarLugarYHorario(b: PedidoBorrador, ahora: Date): string | null {
  if (!b.direccion.trim()) return 'Escribe la dirección donde se hará el trabajo.'
  if (!b.zona) return 'Elige tu zona.'
  if (b.programacion === 'programada') {
    if (!b.fecha) return 'Elige el día.'
    if (!b.hora) return 'Elige la hora.'
    if (!esFuturo(b.fecha, b.hora, ahora)) return 'Elige una hora que falte al menos 30 minutos.'
  }
  return null
}

export function validarPedidoCompleto(b: PedidoBorrador, cantidadFotos: number, ahora: Date): string | null {
  return validarNecesidad(b, cantidadFotos) ?? validarLugarYHorario(b, ahora)
}

/** ¿Este pedido necesita foto para poder atenderse, o son opcionales? */
export function fotosRequeridas(b: PedidoBorrador): { obligatorias: boolean; maximo: number; etiqueta: string } {
  const r = resolverServicio(b)
  if (r?.servicio.fotos) return r.servicio.fotos
  return { obligatorias: false, maximo: 4, etiqueta: 'Fotos (opcional)' }
}

/**
 * Reglas del pedido directo a un profesional elegido: debe ofrecer ese servicio y, si se pidió kit,
 * poder traerlo. (Se repiten en el servidor, que es la barrera real.)
 */
export function validarDirecto(
  b: PedidoBorrador,
  directo: { nombre: string; servicios: string[]; kit_propio: boolean } | null,
): string | null {
  if (!b.trabajadorDirectoId) return null
  if (!directo) return 'No pudimos cargar al profesional elegido. Recarga o envía tu pedido a otros profesionales.'
  const primero = directo.nombre.split(' ')[0]
  const nombreServicio = resolverServicio(b)?.servicio.nombre
  if (nombreServicio && !directo.servicios.includes(nombreServicio)) {
    return `${primero} no ofrece este servicio. Elige otro servicio o envía tu pedido a otros profesionales.`
  }
  if (conKit(b) && !directo.kit_propio) {
    return `${primero} no ofrece llevar su propio kit de limpieza. Cambia la opción de materiales o envía tu pedido a otros profesionales.`
  }
  return null
}

export { conKit }
