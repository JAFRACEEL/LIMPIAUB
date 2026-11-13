import { describe, expect, it } from 'vitest'
import { debeOfrecerReactivacion, idsViejosDelMismoDispositivo, type FilaSuscripcion } from './pushReactivar'

const YO = 'u-yo'
const fila = (id: string, endpoint: string, app: string | null, user_agent: string | null = 'iPhone', user_id = YO): FilaSuscripcion => ({ id, user_id, endpoint, app, user_agent })

describe('aviso de reactivación de avisos push (app de clientes)', () => {
  it('usuario con suscripción app=NULL lo ve', () => {
    expect(debeOfrecerReactivacion([{ app: null }], 'cliente', false)).toBe(true)
  })
  it('una vez: si ya decidió (activó o "Ahora no") no vuelve a aparecer en cada visita', () => {
    expect(debeOfrecerReactivacion([{ app: null }], 'cliente', true)).toBe(false)
  })
  it('tras reactivar (ya hay una suscripción de esta app) no vuelve a aparecer', () => {
    expect(debeOfrecerReactivacion([{ app: null }, { app: 'cliente' }], 'cliente', false)).toBe(false)
  })
  it('quien nunca activó avisos no ve nada, y tampoco quien solo tiene los de otra app', () => {
    expect(debeOfrecerReactivacion([], 'cliente', false)).toBe(false)
    expect(debeOfrecerReactivacion([{ app: 'profesional' }], 'cliente', false)).toBe(false)
  })
})

describe('al reactivar se limpian las suscripciones viejas del mismo dispositivo', () => {
  const subs = [
    fila('1', 'https://push/vieja', null, 'iPhone'),
    fila('2', 'https://push/nueva', 'cliente', 'iPhone'),
    fila('3', 'https://push/otro-cel', null, 'Android'),
    fila('4', 'https://push/vieja-sin-ua', null, null),
  ]
  it('borra la vieja del mismo dispositivo; no toca las que ya tienen app, ni otros dispositivos, ni la que no se puede identificar', () => {
    expect(idsViejosDelMismoDispositivo(subs, YO, 'https://push/nueva', 'iPhone')).toEqual(['1'])
  })
  it('NUNCA borra una fila que ya tiene app, aunque coincida el user agent (dos equipos iguales de la misma persona)', () => {
    const dosEquiposIguales = [
      fila('a', 'https://push/equipo-1', 'cliente', 'iPhone 15'),
      fila('b', 'https://push/equipo-2', 'profesional', 'iPhone 15'),
      fila('c', 'https://push/equipo-3', 'admin', 'iPhone 15'),
    ]
    expect(idsViejosDelMismoDispositivo(dosEquiposIguales, YO, 'https://push/equipo-nuevo', 'iPhone 15')).toEqual([])
  })
  it('solo filas de la misma persona: la vieja de otra cuenta con el mismo user agent no se toca', () => {
    const mezcla = [fila('1', 'https://push/v1', null, 'iPhone', YO), fila('2', 'https://push/v2', null, 'iPhone', 'u-otra')]
    expect(idsViejosDelMismoDispositivo(mezcla, YO, 'https://push/nueva', 'iPhone')).toEqual(['1'])
  })
  it('la que tiene el mismo endpoint no se borra: se actualiza en su sitio al guardar la nueva', () => {
    expect(idsViejosDelMismoDispositivo([fila('1', 'https://push/x', null)], YO, 'https://push/x', 'iPhone')).toEqual([])
  })
})
