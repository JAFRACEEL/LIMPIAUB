import { describe, it, expect } from 'vitest'
import { calcularTotal, calcularComision, seSolapan } from './calculos'

describe('calcularTotal', () => {
  it('multiplica tarifa por horas', () => {
    expect(calcularTotal(20, 3, 0)).toBe(60)
  })

  it('suma el recargo por materiales', () => {
    expect(calcularTotal(20, 3, 18)).toBe(78)
  })
})

describe('calcularComision', () => {
  it('aplica el % solo sobre el servicio, no sobre el recargo', () => {
    // Servicio: 20 * 3 = 60. Comisión 20% = 12. Con kit: +S/5 fijos para
    // Limpi y +S/13 fijos para la trabajadora (del recargo de S/18).
    const { comisionLimpi, netoTrabajadora } = calcularComision(60, 20, 18)
    expect(comisionLimpi).toBe(12 + 5)
    expect(netoTrabajadora).toBe(60 - 12 + 13)
  })

  it('sin materiales, la comisión es solo sobre el servicio', () => {
    const { comisionLimpi, netoTrabajadora } = calcularComision(60, 20, 0)
    expect(comisionLimpi).toBe(12)
    expect(netoTrabajadora).toBe(48)
  })
})

describe('seSolapan', () => {
  it('detecta un cruce de horario el mismo día', () => {
    expect(seSolapan('2026-10-01', '09:00', 3, '2026-10-01', '10:00', 2)).toBe(true)
  })

  it('no detecta cruce cuando un turno termina justo antes de que empiece el otro', () => {
    expect(seSolapan('2026-10-01', '09:00', 2, '2026-10-01', '11:00', 2)).toBe(false)
  })

  it('no detecta cruce en fechas distintas', () => {
    expect(seSolapan('2026-10-01', '09:00', 3, '2026-10-02', '09:00', 3)).toBe(false)
  })

  it('detecta un turno que cruza la medianoche', () => {
    expect(seSolapan('2026-10-01', '23:00', 3, '2026-10-02', '00:30', 2)).toBe(true)
  })
})
