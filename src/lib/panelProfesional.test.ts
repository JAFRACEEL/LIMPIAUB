import { describe, expect, it } from 'vitest'
import { especialidad, iniciales, ofreceKitDeLimpieza } from './panelProfesional'

describe('iniciales del avatar', () => {
  it('toma la primera letra de las dos primeras palabras', () => {
    expect(iniciales('Rosa Tuanama Pinedo')).toBe('RT')
    expect(iniciales('  carmen  ')).toBe('C')
    expect(iniciales('ñusta ríos')).toBe('ÑR')
  })
  it('sin nombre muestra un signo en vez de quedar vacío', () => {
    expect(iniciales('')).toBe('?')
    expect(iniciales(null)).toBe('?')
    expect(iniciales('   ')).toBe('?')
  })
})

describe('especialidad', () => {
  it('sin servicios no inventa una especialidad', () => {
    expect(especialidad([])).toBe('Aún no elegiste servicios')
  })
  it('un servicio, o el primero más cuántos otros ofrece', () => {
    expect(especialidad(['Gasfitería'])).toBe('Gasfitería')
    expect(especialidad(['Gasfitería', 'Pintura'])).toBe('Gasfitería y 1 servicio más')
    expect(especialidad(['Gasfitería', 'Pintura', 'Electricidad'])).toBe('Gasfitería y 2 servicios más')
  })
})

describe('"Mi kit de limpieza" solo si corresponde a sus servicios', () => {
  it('aparece con servicios de limpieza por horas', () => {
    expect(ofreceKitDeLimpieza(['Limpieza básica del hogar'])).toBe(true)
    expect(ofreceKitDeLimpieza(['Gasfitería', 'Limpieza post obra'])).toBe(true)
  })
  it('no aparece con oficios, con lavado y planchado ni sin servicios', () => {
    expect(ofreceKitDeLimpieza(['Gasfitería', 'Electricidad'])).toBe(false)
    expect(ofreceKitDeLimpieza(['Lavado y planchado'])).toBe(false)
    expect(ofreceKitDeLimpieza([])).toBe(false)
  })
  it('ignora nombres que ya no están en el catálogo', () => {
    expect(ofreceKitDeLimpieza(['Servicio inexistente'])).toBe(false)
  })
})
