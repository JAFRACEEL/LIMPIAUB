import { describe, it, expect } from 'vitest'
import {
  desglosar,
  descuentoDeVisita,
  manoObraOferta,
  manoObraPorHoras,
  repartoDelDesglose,
  RECARGO_KIT,
  totalAContratar,
} from './precios'
import { modalidadesDisponibles, modalidadesOperativas, servicioContratable } from './modalidades'

describe('manoObraPorHoras', () => {
  it('multiplica tarifa × horas × personas', () => {
    expect(manoObraPorHoras(15, 3, 1)).toBe(45)
    expect(manoObraPorHoras(15, 3, 2)).toBe(90)
  })
  it('redondea a centavos', () => {
    expect(manoObraPorHoras(12.345, 3, 1)).toBe(37.04)
  })
})

describe('manoObraOferta', () => {
  it('por horas usa la tarifa del profesional', () => {
    expect(manoObraOferta('horas', { tarifaHora: 20, horas: 4, personas: 1 })).toBe(80)
  })
  it('por horas sin tarifa no inventa precio', () => {
    expect(manoObraOferta('horas', { horas: 4 })).toBeNull()
  })
  it('precio fijo multiplica por unidades y diagnóstico no', () => {
    expect(manoObraOferta('fijo', { montoFijo: 40, cantidad: 3 })).toBe(120)
    expect(manoObraOferta('diagnostico', { montoFijo: 30, cantidad: 3 })).toBe(30)
  })
  it('fijo/diagnóstico sin precio configurado no inventa precio ni usa horas', () => {
    expect(manoObraOferta('fijo', { tarifaHora: 20, horas: 2 })).toBeNull()
    expect(manoObraOferta('diagnostico', { tarifaHora: 20, horas: 2 })).toBeNull()
  })
  it('la cotización nunca tiene precio automático', () => {
    expect(manoObraOferta('cotizacion', { tarifaHora: 20, horas: 2, montoFijo: 50 })).toBeNull()
  })
})

describe('desglosar', () => {
  it('separa mano de obra, materiales, movilidad y otros', () => {
    const d = desglosar({ manoObra: 60, materiales: 15, movilidad: 5, otros: 2 })
    expect(d.total).toBe(82)
    expect(d.baseComision).toBe(60)
  })
  it('el kit no entra a la base de la comisión porcentual', () => {
    const d = desglosar({ manoObra: 60, kit: RECARGO_KIT })
    expect(d.total).toBe(78)
    const { comisionLimpi, netoTrabajadora } = repartoDelDesglose(d, 20)
    expect(comisionLimpi).toBe(12 + 5)
    expect(netoTrabajadora).toBe(60 - 12 + 13)
  })
  it('materiales, movilidad y otros no pagan comisión', () => {
    const d = desglosar({ manoObra: 100, materiales: 40, movilidad: 10 })
    const { comisionLimpi, netoTrabajadora } = repartoDelDesglose(d, 20)
    expect(comisionLimpi).toBe(20)
    expect(netoTrabajadora).toBe(80)
  })
})

describe('descuento de la visita de diagnóstico', () => {
  const visita = { manoObra: 30, trabajadorId: 'p1', aceptada: true }

  it('descuenta la visita al contratar la reparación con el mismo profesional', () => {
    expect(descuentoDeVisita(150, visita, 'p1')).toBe(30)
  })
  it('no hay doble cobro: visita + reparación neta = precio de la reparación', () => {
    const d = desglosar({ manoObra: 150, descuentoVisita: descuentoDeVisita(150, visita, 'p1') })
    expect(visita.manoObra + d.manoObraNeta).toBe(150)
  })
  it('la comisión total sobre visita + reparación es la del precio de la reparación', () => {
    const rep = desglosar({ manoObra: 150, descuentoVisita: 30 })
    const base = visita.manoObra + rep.baseComision
    expect(base * 0.2).toBe(150 * 0.2)
  })
  it('no descuenta con otro profesional ni si la visita no fue aceptada', () => {
    expect(descuentoDeVisita(150, visita, 'p2')).toBe(0)
    expect(descuentoDeVisita(150, { ...visita, aceptada: false }, 'p1')).toBe(0)
    expect(descuentoDeVisita(150, null, 'p1')).toBe(0)
  })
  it('nunca supera el presupuesto de reparación', () => {
    expect(descuentoDeVisita(20, visita, 'p1')).toBe(20)
    expect(desglosar({ manoObra: 20, descuentoVisita: 999 }).total).toBe(0)
  })
})

describe('modalidades operativas', () => {
  it('sin el interruptor solo se contrata por horas', () => {
    expect(modalidadesOperativas(undefined)).toEqual(['horas'])
    expect(modalidadesDisponibles(['diagnostico', 'fijo', 'horas'], modalidadesOperativas(undefined))).toEqual(['horas'])
  })
  it('con el interruptor se habilitan todas', () => {
    expect(modalidadesOperativas('1')).toHaveLength(4)
  })
  it('un servicio sin forma operativa de contratar no es contratable', () => {
    expect(servicioContratable(true, ['cotizacion'], ['horas'])).toBe(false)
    expect(servicioContratable(false, ['horas'], ['horas'])).toBe(false)
    expect(servicioContratable(undefined, undefined, ['horas'])).toBe(true)
  })
})

describe('lo que se muestra al contratar incluye el kit (no hay sorpresa de S/18)', () => {
  it('la propuesta de servicio suma el kit: S/60 + S/18 = S/78', () => {
    expect(totalAContratar({ tipo: 'servicio', total_propuesta: 60 }, RECARGO_KIT)).toBe(78)
  })
  it('sin kit es el total de la propuesta', () => {
    expect(totalAContratar({ tipo: 'servicio', total_propuesta: 60 }, 0)).toBe(60)
  })
  it('presupuestos y adicionales nunca llevan kit', () => {
    expect(totalAContratar({ tipo: 'presupuesto_reparacion', total_propuesta: 140 }, RECARGO_KIT)).toBe(140)
    expect(totalAContratar({ tipo: 'adicional', total_propuesta: 10 }, RECARGO_KIT)).toBe(10)
  })
})
