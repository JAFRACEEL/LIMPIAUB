import { describe, expect, it } from 'vitest'
import { lineasDeTexto, montoDeTexto, ranurasDePrecio, validarPrecio } from './preciosProfesional'

const base = { monto: '40', unidad: 'trabajo' as const, alcance: 'Cambio de tomacorriente', incluye: '', noIncluye: '' }

describe('ranurasDePrecio', () => {
  it('electricidad ofrece diagnóstico y precio fijo', () => {
    expect(ranurasDePrecio(['Electricidad'])).toEqual([
      { servicio: 'Electricidad', modalidad: 'diagnostico' },
      { servicio: 'Electricidad', modalidad: 'fijo' },
    ])
  })
  it('limpieza (solo horas y cotización) no pide precio guardado', () => {
    expect(ranurasDePrecio(['Limpieza básica'])).toEqual([])
  })
  it('ignora nombres que no están en el catálogo', () => {
    expect(ranurasDePrecio(['Inventado'])).toEqual([])
  })
})

describe('validarPrecio', () => {
  it('acepta un borrador correcto', () => expect(validarPrecio(base)).toBeNull())
  it('acepta coma decimal', () => expect(validarPrecio({ ...base, monto: '35,50' })).toBeNull())
  it('rechaza cero, vacío y texto', () => {
    for (const monto of ['0', '', 'abc', '-5']) expect(validarPrecio({ ...base, monto })).not.toBeNull()
  })
  it('rechaza más de dos decimales', () => expect(validarPrecio({ ...base, monto: '10.555' })).not.toBeNull())
  it('rechaza montos fuera de numeric(8,2)', () => expect(validarPrecio({ ...base, monto: '100000' })).not.toBeNull())
  it('exige descripción del alcance', () => expect(validarPrecio({ ...base, alcance: '  ' })).not.toBeNull())
})

describe('lineasDeTexto', () => {
  it('quita vacíos y repetidos', () => expect(lineasDeTexto('a\n\n A \nb')).toEqual(['a', 'b']))
  it('limita a 20 líneas de 200 caracteres', () => {
    const muchas = Array.from({ length: 30 }, (_, i) => `x${i}`).join('\n')
    expect(lineasDeTexto(muchas)).toHaveLength(20)
    expect(lineasDeTexto('y'.repeat(300))[0]).toHaveLength(200)
  })
})

describe('montoDeTexto', () => {
  it('redondea a centavos', () => expect(montoDeTexto('12,5')).toBe(12.5))
})

import { subtotalParaPedido } from './preciosProfesional'

describe('subtotalParaPedido', () => {
  it('horas: tarifa × horas × personas', () => expect(subtotalParaPedido('horas', { tarifaHora: 15, horas: 3, personas: 2 })).toBe(90))
  it('sin modalidad se trata como horas', () => expect(subtotalParaPedido(undefined, { tarifaHora: 10, horas: 2 })).toBe(20))
  it('fijo por unidad multiplica por cantidad', () =>
    expect(subtotalParaPedido('fijo', { tarifaHora: 0, horas: 2, cantidad: 4, precio: { monto: 25, unidad: 'unidad' } })).toBe(100))
  it('fijo por trabajo ignora la cantidad', () =>
    expect(subtotalParaPedido('fijo', { tarifaHora: 0, horas: 2, cantidad: 4, precio: { monto: 80, unidad: 'trabajo' } })).toBe(80))
  it('diagnóstico usa el monto de la visita', () =>
    expect(subtotalParaPedido('diagnostico', { tarifaHora: 0, horas: 2, precio: { monto: 30, unidad: 'trabajo' } })).toBe(30))
  it('sin precio configurado o en cotización no inventa monto', () => {
    expect(subtotalParaPedido('fijo', { tarifaHora: 20, horas: 2, precio: null })).toBeNull()
    expect(subtotalParaPedido('cotizacion', { tarifaHora: 20, horas: 2 })).toBeNull()
  })
})

import { totalPropuesta, validarPropuesta } from './preciosProfesional'

const prop = { manoObra: '80', materiales: '20,50', movilidad: '', otros: '', alcance: 'Pintar sala', incluye: '', noIncluye: '' }

describe('propuesta', () => {
  it('suma los importes y tolera vacíos y coma', () => expect(totalPropuesta(prop)).toBe(100.5))
  it('acepta una propuesta válida', () => expect(validarPropuesta(prop)).toBeNull())
  it('exige mano de obra mayor a cero', () => expect(validarPropuesta({ ...prop, manoObra: '0' })).not.toBeNull())
  it('rechaza negativos y texto', () => {
    expect(validarPropuesta({ ...prop, materiales: '-1' })).not.toBeNull()
    expect(validarPropuesta({ ...prop, otros: 'abc' })).not.toBeNull()
  })
  it('exige alcance', () => expect(validarPropuesta({ ...prop, alcance: '' })).not.toBeNull())
})

import { tienePrecioParaPedido } from './preciosProfesional'

describe('tienePrecioParaPedido', () => {
  const precios = [
    { servicio: 'Electricidad', modalidad: 'fijo' as const, activo: true },
    { servicio: 'Gasfitería', modalidad: 'fijo' as const, activo: false },
  ]
  it('horas, cotización y sin modalidad no necesitan precio', () => {
    for (const m of ['horas', 'cotizacion', undefined] as const) expect(tienePrecioParaPedido(m, 'Electricidad', [])).toBe(true)
  })
  it('fijo con precio activo se puede aceptar', () => expect(tienePrecioParaPedido('fijo', 'Electricidad', precios)).toBe(true))
  it('fijo sin precio, o con precio pausado, no', () => {
    expect(tienePrecioParaPedido('fijo', 'Cerrajería', precios)).toBe(false)
    expect(tienePrecioParaPedido('fijo', 'Gasfitería', precios)).toBe(false)
  })
  it('el precio debe ser de la misma modalidad', () => expect(tienePrecioParaPedido('diagnostico', 'Electricidad', precios)).toBe(false))
})
