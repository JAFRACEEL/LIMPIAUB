import { describe, it, expect } from 'vitest'
import {
  esDniValido,
  esCelularValido,
  esTarifaValida,
  esNumeroDocumentoValido,
  sonZonasValidas,
  esFechaFuturaValida,
} from './validadores'

describe('esDniValido', () => {
  it('acepta 8 dígitos', () => {
    expect(esDniValido('12345678')).toBe(true)
  })
  it('rechaza menos de 8 dígitos', () => {
    expect(esDniValido('1234567')).toBe(false)
  })
  it('rechaza letras', () => {
    expect(esDniValido('1234567a')).toBe(false)
  })
})

describe('esCelularValido', () => {
  it('acepta 9 dígitos empezando en 9', () => {
    expect(esCelularValido('987654321')).toBe(true)
  })
  it('rechaza celulares que no empiezan en 9', () => {
    expect(esCelularValido('887654321')).toBe(false)
  })
  it('rechaza menos de 9 dígitos', () => {
    expect(esCelularValido('98765432')).toBe(false)
  })
})

describe('esTarifaValida', () => {
  it('acepta el rango S/ 5 - 100', () => {
    expect(esTarifaValida(5)).toBe(true)
    expect(esTarifaValida(100)).toBe(true)
    expect(esTarifaValida(50)).toBe(true)
  })
  it('rechaza fuera de rango', () => {
    expect(esTarifaValida(4.99)).toBe(false)
    expect(esTarifaValida(100.01)).toBe(false)
  })
})

describe('esNumeroDocumentoValido', () => {
  it('para DNI exige 8 dígitos', () => {
    expect(esNumeroDocumentoValido('dni', '12345678')).toBe(true)
    expect(esNumeroDocumentoValido('dni', '1234567')).toBe(false)
  })
  it('para documento extranjero exige al menos 5 caracteres', () => {
    expect(esNumeroDocumentoValido('pasaporte', 'AB1234')).toBe(true)
    expect(esNumeroDocumentoValido('pasaporte', 'AB12')).toBe(false)
  })
})

describe('sonZonasValidas', () => {
  it('exige entre 1 y el máximo', () => {
    expect(sonZonasValidas([], 3)).toBe(false)
    expect(sonZonasValidas(['Iquitos'], 3)).toBe(true)
    expect(sonZonasValidas(['Iquitos', 'Belén', 'Punchana'], 3)).toBe(true)
    expect(sonZonasValidas(['Iquitos', 'Belén', 'Punchana', 'Masusa'], 3)).toBe(false)
  })
})

describe('esFechaFuturaValida', () => {
  it('rechaza vacío', () => {
    expect(esFechaFuturaValida('')).toBe(false)
  })
  it('rechaza una fecha pasada', () => {
    expect(esFechaFuturaValida('2020-01-01')).toBe(false)
  })
  it('acepta una fecha futura', () => {
    const futura = new Date()
    futura.setFullYear(futura.getFullYear() + 1)
    const iso = futura.toISOString().slice(0, 10)
    expect(esFechaFuturaValida(iso)).toBe(true)
  })
})
