import type { Pago, Propuesta, Reserva } from '../types'
import { desglosar, redondear, type Desglose } from './precios'
import { DATOS_PAGO } from './constantes'

/** Estado del PAGO, separado del estado del servicio. Elegir Yape/Plin/transferencia NO equivale a pago confirmado. */
export type EstadoPagoVisible = 'sin_monto' | 'por_registrar' | 'pendiente_verificacion' | 'confirmado'

export const ETIQUETA_PAGO: Record<EstadoPagoVisible, string> = {
  sin_monto: 'Pago: aún sin monto',
  por_registrar: 'Pago: por registrar',
  pendiente_verificacion: 'Pago: pendiente de verificación',
  confirmado: 'Pago: confirmado',
}

const ESTADOS_CON_SERVICIO = ['aceptada', 'en_camino', 'en_curso', 'completada']

export interface ResumenPago {
  estado: EstadoPagoVisible
  monto: number
  confirmado: number
  pendiente: number
  /** Lo que falta registrar (monto − confirmado − pendiente de verificación). */
  saldo: number
  /** Último pago que se rechazó, para explicarle al cliente por qué debe registrar de nuevo. */
  ultimoRechazo: Pago | null
}

export function resumenPago(
  reserva: Pick<Reserva, 'estado' | 'total_cliente' | 'total' | 'pago_confirmado'>,
  pagos: Pago[],
): ResumenPago {
  const monto = reserva.total_cliente ?? reserva.total ?? 0
  const suma = (e: Pago['estado']) => redondear(pagos.filter((p) => p.estado === e).reduce((a, p) => a + p.monto, 0))
  const confirmado = suma('confirmado')
  const pendiente = suma('pendiente_verificacion')
  const saldo = Math.max(0, redondear(monto - confirmado - pendiente))
  const rechazados = pagos.filter((p) => p.estado === 'rechazado').sort((a, b) => b.creado_en.localeCompare(a.creado_en))
  const ultimoRechazo = saldo > 0 ? (rechazados[0] ?? null) : null

  let estado: EstadoPagoVisible
  if (!ESTADOS_CON_SERVICIO.includes(reserva.estado) || monto <= 0) estado = 'sin_monto'
  else if (reserva.pago_confirmado) estado = 'confirmado'
  else if (pendiente > 0) estado = 'pendiente_verificacion'
  else estado = 'por_registrar'
  return { estado, monto, confirmado, pendiente, saldo, ultimoRechazo }
}

/** Para mostrar el desglose de lo ya aceptado (servicio + presupuestos + adicionales). */
export function desgloseAceptado(reserva: Pick<Reserva, 'recargo_materiales'>, propuestas: Propuesta[]): Desglose | null {
  const aceptadas = propuestas.filter((p) => p.estado === 'aceptada')
  if (aceptadas.length === 0) return null
  const suma = (campo: 'mano_obra' | 'materiales' | 'movilidad' | 'otros' | 'descuento_visita') =>
    redondear(aceptadas.reduce((a, p) => a + p[campo], 0))
  return desglosar({
    manoObra: suma('mano_obra'),
    descuentoVisita: suma('descuento_visita'),
    materiales: suma('materiales'),
    movilidad: suma('movilidad'),
    otros: suma('otros'),
    kit: reserva.recargo_materiales,
  })
}

/** ¿Hay datos reales de cobro para este método? El efectivo no necesita datos de YAVI. */
export function datosPagoDisponibles(metodo: 'yape' | 'plin' | 'transferencia' | 'efectivo'): boolean {
  if (metodo === 'efectivo') return true
  return !DATOS_PAGO[metodo].trimStart().startsWith('(pendiente')
}
