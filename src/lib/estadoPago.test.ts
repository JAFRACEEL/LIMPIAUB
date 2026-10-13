import { describe, it, expect } from 'vitest'
import { datosPagoDisponibles, desgloseAceptado, resumenPago } from './estadoPago'
import type { Pago, Propuesta } from '../types'

const reserva = (extra: Record<string, unknown> = {}) =>
  ({ estado: 'aceptada', total_cliente: 100, total: 100, pago_confirmado: false, recargo_materiales: 0, ...extra }) as Parameters<typeof resumenPago>[0] & { recargo_materiales: number }

const pago = (extra: Partial<Pago>): Pago => ({
  id: 'p', reserva_id: 'r', metodo: 'yape', monto: 100, estado: 'pendiente_verificacion',
  referencia: null, evidencia_ruta: null, motivo_rechazo: null, creado_en: '2026-10-13T10:00:00Z', verificado_en: null, ...extra,
})

describe('estado del pago (separado del estado del servicio)', () => {
  it('antes de contratar no hay pago que mostrar', () => {
    expect(resumenPago(reserva({ estado: 'solicitada', total_cliente: null, total: null }), []).estado).toBe('sin_monto')
  })
  it('elegir un método NO es pago: sin registro queda "por registrar"', () => {
    expect(resumenPago(reserva(), []).estado).toBe('por_registrar')
  })
  it('un pago registrado queda pendiente de verificación, nunca confirmado', () => {
    const r = resumenPago(reserva(), [pago({})])
    expect(r.estado).toBe('pendiente_verificacion')
    expect(r.saldo).toBe(0)
  })
  it('solo es confirmado cuando el servidor marcó pago_confirmado', () => {
    expect(resumenPago(reserva({ pago_confirmado: true }), [pago({ estado: 'confirmado' })]).estado).toBe('confirmado')
    expect(resumenPago(reserva({ pago_confirmado: false }), [pago({ estado: 'confirmado' })]).estado).toBe('por_registrar')
  })
  it('un pago rechazado deja el saldo por registrar y explica el motivo', () => {
    const r = resumenPago(reserva(), [pago({ estado: 'rechazado', motivo_rechazo: 'No vimos el abono' })])
    expect(r.estado).toBe('por_registrar')
    expect(r.saldo).toBe(100)
    expect(r.ultimoRechazo?.motivo_rechazo).toBe('No vimos el abono')
  })
  it('un adicional aceptado después de pagar deja saldo', () => {
    const r = resumenPago(reserva({ total_cliente: 130, pago_confirmado: false }), [pago({ estado: 'confirmado' })])
    expect(r.saldo).toBe(30)
    expect(r.estado).toBe('por_registrar')
  })
})

describe('desglose de lo aceptado', () => {
  const prop = (extra: Partial<Propuesta>): Propuesta => ({
    id: 'x', reserva_id: 'r', trabajador_id: 't', tipo: 'servicio', modalidad: 'diagnostico', version: 1, estado: 'aceptada',
    tarifa_hora: null, horas: null, personas: null, cantidad: null, mano_obra: 30, materiales: 0, movilidad: 0, otros: 0,
    descuento_visita: 0, total_propuesta: 30, alcance: null, incluye: [], no_incluye: [], condiciones: [], vigente_hasta: null,
    creado_en: '', respondido_en: null, ...extra,
  })

  it('visita + reparación descuenta la visita una sola vez', () => {
    const d = desgloseAceptado({ recargo_materiales: 0 }, [
      prop({}),
      prop({ tipo: 'presupuesto_reparacion', mano_obra: 150, descuento_visita: 30, materiales: 20, total_propuesta: 140 }),
    ])
    expect(d?.manoObraNeta).toBe(150)
    expect(d?.total).toBe(170)
  })
  it('ignora lo que no fue aceptado', () => {
    expect(desgloseAceptado({ recargo_materiales: 0 }, [prop({ estado: 'ofrecida' })])).toBeNull()
  })
  it('el kit se muestra aparte', () => {
    const d = desgloseAceptado({ recargo_materiales: 18 }, [prop({ mano_obra: 60 })])
    expect(d?.kit).toBe(18)
    expect(d?.total).toBe(78)
  })
})

describe('datos de cobro', () => {
  it('si Limpi aún no cargó sus datos reales, no se simula un pago', () => {
    expect(datosPagoDisponibles('yape')).toBe(false)
    expect(datosPagoDisponibles('transferencia')).toBe(false)
  })
  it('el efectivo no depende de datos de Limpi', () => {
    expect(datosPagoDisponibles('efectivo')).toBe(true)
  })
})
