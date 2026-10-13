import { describe, it, expect } from 'vitest'
import { clasificarLimpieza, limpiezaCompleta, resumenLimpieza, tareasSugeridas, type DatosLimpieza } from './flujoLimpieza'
import { TAREA_REORGANIZAR } from './sinonimos'

const base: DatosLimpieza = { espacio: 'hogar', alcance: 'casa', ambientes: [], puntual: '', tareas: [], reorganizar: false }

describe('clasificación interna de limpieza', () => {
  it('una limpieza de casa va a la clasificación básica, sin preguntar básica o profunda', () => {
    expect(clasificarLimpieza(base)).toEqual({ servicioId: 'limpieza_basica', subtipoId: null })
  })
  it('mucha suciedad en una casa NO activa la reorganización: sigue siendo básica', () => {
    expect(clasificarLimpieza({ ...base, estado: 'acumulado' }).servicioId).toBe('limpieza_basica')
  })
  it('reorganizar solo entra si el cliente lo pidió expresamente', () => {
    expect(clasificarLimpieza({ ...base, reorganizar: true }).servicioId).toBe('limpieza_profunda_reorganizacion')
    expect(clasificarLimpieza({ ...base, tareas: [TAREA_REORGANIZAR] }).servicioId).toBe('limpieza_profunda_reorganizacion')
    expect(clasificarLimpieza({ ...base, tareas: ['Barrer y trapear pisos'] }).servicioId).toBe('limpieza_basica')
  })
  it('oficina o Airbnb deducen rutinaria/profunda por el estado, no por una pregunta técnica', () => {
    expect(clasificarLimpieza({ ...base, espacio: 'oficina' })).toEqual({ servicioId: 'oficinas_comercios', subtipoId: 'rutinaria' })
    expect(clasificarLimpieza({ ...base, espacio: 'oficina', estado: 'acumulado' }).subtipoId).toBe('profunda')
    expect(clasificarLimpieza({ ...base, espacio: 'alojamiento' }).servicioId).toBe('alojamientos_airbnb')
  })
  it('evento y obra mantienen sus clasificaciones', () => {
    expect(clasificarLimpieza({ ...base, espacio: 'evento' }).servicioId).toBe('postevento')
    expect(clasificarLimpieza({ ...base, espacio: 'obra' }).servicioId).toBe('postobra')
  })
})

describe('qué se pregunta solo cuando es necesario', () => {
  it('"mi casa" por horas no pide nada más', () => {
    expect(limpiezaCompleta(base, 'horas')).toBeNull()
  })
  it('algunos ambientes pide elegirlos', () => {
    expect(limpiezaCompleta({ ...base, alcance: 'ambientes' }, 'horas')).not.toBeNull()
    expect(limpiezaCompleta({ ...base, alcance: 'ambientes', ambientes: ['Cocina'] }, 'horas')).toBeNull()
  })
  it('algo puntual pide describirlo', () => {
    expect(limpiezaCompleta({ ...base, alcance: 'puntual' }, 'horas')).not.toBeNull()
    expect(limpiezaCompleta({ ...base, alcance: 'puntual', puntual: 'alfombra de la sala' }, 'horas')).toBeNull()
  })
  it('el tamaño solo se pide cuando se prepara una propuesta por alcance', () => {
    expect(limpiezaCompleta(base, 'horas')).toBeNull()
    expect(limpiezaCompleta(base, 'cotizacion')).not.toBeNull()
    expect(limpiezaCompleta({ ...base, tamano: 'mediano' }, 'cotizacion')).toBeNull()
  })
})

describe('tareas y resumen', () => {
  it('las tareas sugeridas dependen de los ambientes elegidos', () => {
    const tareas = tareasSugeridas({ alcance: 'ambientes', ambientes: ['Cocina'] })
    expect(tareas).toContain('Lavar los platos')
    expect(tareas).not.toContain('Limpiar ducha')
  })
  it('algo puntual no sugiere tareas', () => {
    expect(tareasSugeridas({ alcance: 'puntual', ambientes: [] })).toEqual([])
  })
  it('reorganizar aparece como opción explícita, no incluida por defecto', () => {
    expect(tareasSugeridas({ alcance: 'casa', ambientes: [] })).toContain(TAREA_REORGANIZAR)
    expect(resumenLimpieza(base, 'horas').some((f) => f.valor.includes('Reorganizar'))).toBe(false)
  })
  it('conserva el orden de prioridad de las tareas en el resumen', () => {
    const filas = resumenLimpieza({ ...base, tareas: ['Limpiar baños', 'Lavar los platos'] }, 'horas')
    expect(filas.find((f) => f.etiqueta.startsWith('Tareas'))?.valor).toBe('1. Limpiar baños · 2. Lavar los platos')
  })
  it('en propuesta por alcance no hay tareas por orden pero sí tamaño y estado', () => {
    const filas = resumenLimpieza({ ...base, tareas: ['Limpiar baños'], tamano: 'grande', estado: 'acumulado' }, 'cotizacion')
    expect(filas.some((f) => f.etiqueta.startsWith('Tareas'))).toBe(false)
    expect(filas.some((f) => f.etiqueta === 'Tamaño aproximado')).toBe(true)
  })
})
