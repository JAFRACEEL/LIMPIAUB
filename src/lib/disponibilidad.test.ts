import { describe, it, expect } from 'vitest'
import { coberturaDesdeFilas, coberturaEnZona, estadoServicio } from './disponibilidad'

const cobertura = coberturaDesdeFilas([
  { servicio: 'Limpieza básica del hogar', zona: '*', profesionales: 3 },
  { servicio: 'Limpieza básica del hogar', zona: 'Iquitos', profesionales: 3 },
  { servicio: 'Electricidad', zona: '*', profesionales: 2 },
  { servicio: 'Electricidad', zona: 'Belén', profesionales: 2 },
])

describe('qué servicios se pueden contratar hoy', () => {
  it('limpieza por horas con profesionales: sí', () => {
    expect(estadoServicio('limpieza_basica', cobertura, ['horas']).contratable).toBe(true)
  })
  it('un oficio que se cobra por diagnóstico o precio fijo NO se contrata por horas mientras no estén operativos', () => {
    const e = estadoServicio('electricidad', cobertura, ['horas'])
    expect(e.contratable).toBe(false)
    expect(e.motivo).toBe('modalidad')
    expect(e.texto).toContain('todavía no está disponible')
  })
  it('con las modalidades operativas y profesionales, el oficio sí se contrata', () => {
    expect(estadoServicio('electricidad', cobertura, ['horas', 'diagnostico', 'fijo', 'cotizacion']).contratable).toBe(true)
  })
  it('aire acondicionado sin profesionales registrados se muestra pero no se contrata, aun con todo operativo', () => {
    const e = estadoServicio('aire_acondicionado', cobertura, ['horas', 'diagnostico', 'fijo', 'cotizacion'])
    expect(e.contratable).toBe(false)
    expect(e.motivo).toBe('cobertura')
    expect(e.texto).toContain('Todavía no tenemos profesionales')
  })
  it('si faltan las dos cosas (forma de contratar y profesionales) se dicen las dos', () => {
    const e = estadoServicio('aire_acondicionado', cobertura, ['horas'])
    expect(e.contratable).toBe(false)
    expect(e.texto).toContain('todavía no está disponible')
    expect(e.texto).toContain('Todavía no tenemos profesionales')
  })
  it('sin datos de cobertura no se bloquea por cobertura (el servidor sigue siendo la barrera)', () => {
    expect(estadoServicio('limpieza_basica', null, ['horas']).contratable).toBe(true)
  })
  it('un servicio que no existe no es contratable', () => {
    expect(estadoServicio('nada', cobertura).contratable).toBe(false)
  })
})

describe('cobertura por zona', () => {
  it('distingue profesionales por zona', () => {
    expect(coberturaEnZona('Electricidad', 'Belén', cobertura)).toBe(2)
    expect(coberturaEnZona('Electricidad', 'Punchana', cobertura)).toBe(0)
    expect(coberturaEnZona('Electricidad', '', cobertura)).toBeNull()
    expect(coberturaEnZona('Electricidad', 'Belén', null)).toBeNull()
  })
})
