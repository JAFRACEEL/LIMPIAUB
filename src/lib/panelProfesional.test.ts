import { describe, expect, it } from 'vitest'
import {
  especialidad,
  iniciales,
  netoDeReserva,
  ofreceKitDeLimpieza,
  proximoTrabajo,
  resumenCalificacion,
  vistaDePanel,
} from './panelProfesional'

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

describe('rutas del panel', () => {
  it('cada pestaña tiene su ruta y lo desconocido no es una vista', () => {
    expect(vistaDePanel('/panel')).toBe('inicio')
    expect(vistaDePanel('/panel/')).toBe('inicio')
    expect(vistaDePanel('/panel/servicios')).toBe('servicios')
    expect(vistaDePanel('/panel/ganancias')).toBe('ganancias')
    expect(vistaDePanel('/panel/ajustes/')).toBe('ajustes')
    expect(vistaDePanel('/panel/otra')).toBeNull()
  })
})

describe('próximo trabajo', () => {
  const r = (estado: string, fecha: string, hora: string) => ({ estado, fecha, hora })
  it('elige el vigente más cercano e ignora los que no están contratados', () => {
    const lista = [
      r('solicitada', '2026-11-01', '08:00:00'),
      r('completada', '2026-11-02', '08:00:00'),
      r('aceptada', '2026-11-05', '09:00:00'),
      r('aceptada', '2026-11-04', '15:00:00'),
      r('aceptada', '2026-11-04', '09:00:00'),
    ]
    expect(proximoTrabajo(lista)).toEqual(r('aceptada', '2026-11-04', '09:00:00'))
  })
  it('sin trabajos vigentes no inventa uno', () => {
    expect(proximoTrabajo([])).toBeNull()
    expect(proximoTrabajo([r('cancelada', '2026-11-04', '09:00:00')])).toBeNull()
  })
})

describe('ganancia neta por reserva', () => {
  it('descuenta la comisión del servicio y suma S/ 13 del kit', () => {
    expect(netoDeReserva({ total: 80, comision_pct: 20, recargo_materiales: 0 })).toBe(64)
    expect(netoDeReserva({ total: 98, comision_pct: 20, recargo_materiales: 18 })).toBe(77)
  })
  it('sin total no cuenta como cero', () => {
    expect(netoDeReserva({ total: null, comision_pct: 20, recargo_materiales: 0 })).toBeNull()
  })
})

describe('resumen de calificación', () => {
  it('sin reseñas lo dice; con reseñas muestra promedio y cantidad', () => {
    expect(resumenCalificacion(0, 0)).toBe('Sin reseñas')
    expect(resumenCalificacion(4.8, 1)).toBe('4.8 ★ · 1 reseña')
    expect(resumenCalificacion(4.75, 3)).toBe('4.8 ★ · 3 reseñas')
  })
})
