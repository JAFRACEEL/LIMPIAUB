import { describe, it, expect } from 'vitest'
import {
  avisosActivos,
  estimarFechaEntrega,
  preguntasVisibles,
  resumenRespuestas,
  validarRespuestas,
} from './preguntasServicio'

const POST_OBRA = 'Limpieza post obra'
const LAVADO = 'Lavado y planchado'

describe('preguntasVisibles - post obra', () => {
  it('pregunta por escombros solo en la modalidad pesada', () => {
    const pesada = preguntasVisibles(POST_OBRA, 'pesada', {}).map((p) => p.id)
    const fina = preguntasVisibles(POST_OBRA, 'fina', {}).map((p) => p.id)
    expect(pesada).toEqual(['estado_inmueble', 'retiro_escombros'])
    expect(fina).toEqual(['estado_inmueble'])
  })

  it('exige el estado del inmueble', () => {
    const preguntas = preguntasVisibles(POST_OBRA, 'fina', {})
    expect(validarRespuestas(preguntas, {})).toMatch(/estado se encuentra/)
    expect(validarRespuestas(preguntas, { estado_inmueble: 'No estoy seguro/a.' })).toBeNull()
  })

  it('avisa el costo adicional si pide retirar escombros', () => {
    const preguntas = preguntasVisibles(POST_OBRA, 'pesada', {})
    const avisos = avisosActivos(
      preguntas,
      { estado_inmueble: 'No estoy seguro/a.', retiro_escombros: 'Sí' },
      'pesada',
    )
    expect(avisos.some((a) => a.includes('costo adicional'))).toBe(true)
  })

  it('sugiere la otra modalidad si el estado no calza', () => {
    const pesada = preguntasVisibles(POST_OBRA, 'pesada', {})
    const avisos = avisosActivos(
      pesada,
      { estado_inmueble: 'Los escombros ya fueron retirados y necesito la limpieza final.', retiro_escombros: 'No' },
      'pesada',
    )
    expect(avisos.some((a) => a.includes('Limpieza fina'))).toBe(true)
  })
})

describe('preguntasVisibles - lavado y planchado', () => {
  it('en domicilio, solo planchado no pregunta por lavadora ni secadora', () => {
    const ids = preguntasVisibles(LAVADO, 'domicilio', { tipo_servicio: 'Solo planchado' }).map((p) => p.id)
    expect(ids).not.toContain('tiene_lavadora')
    expect(ids).not.toContain('tiene_secadora')
    expect(ids).not.toContain('productos_lavado')
    expect(ids).toContain('tiene_plancha')
    expect(ids).toContain('tiene_tabla')
  })

  it('en domicilio, solo lavado pregunta por lavadora y productos, no por plancha', () => {
    const ids = preguntasVisibles(LAVADO, 'domicilio', { tipo_servicio: 'Solo lavado' }).map((p) => p.id)
    expect(ids).toContain('tiene_lavadora')
    expect(ids).toContain('productos_lavado')
    expect(ids).not.toContain('tiene_plancha')
    expect(ids).not.toContain('tiene_secadora')
  })

  it('pregunta por secadora solo si el servicio incluye secado', () => {
    const ids = preguntasVisibles(LAVADO, 'domicilio', { tipo_servicio: 'Lavado y secado' }).map((p) => p.id)
    expect(ids).toContain('tiene_secadora')
  })

  it('recojo no pregunta por equipos y pide cantidad y datos de contacto', () => {
    const ids = preguntasVisibles(LAVADO, 'recojo', { tipo_servicio: 'Lavado y planchado' }).map((p) => p.id)
    expect(ids).not.toContain('tiene_lavadora')
    expect(ids).toEqual(
      expect.arrayContaining(['cantidad_prendas', 'persona_entrega', 'contacto_recojo', 'direccion_entrega_opcion']),
    )
  })

  it('pide la otra dirección solo si la elige', () => {
    const sin = preguntasVisibles(LAVADO, 'recojo', { direccion_entrega_opcion: 'La misma dirección de recojo.' })
    const con = preguntasVisibles(LAVADO, 'recojo', { direccion_entrega_opcion: 'Otra dirección.' })
    expect(sin.map((p) => p.id)).not.toContain('direccion_entrega')
    expect(con.map((p) => p.id)).toContain('direccion_entrega')
  })

  it('exige el detalle si hay prendas delicadas', () => {
    const respuestas = { prendas_delicadas: 'Sí' }
    const preguntas = preguntasVisibles(LAVADO, 'domicilio', { tipo_servicio: 'Solo planchado', ...respuestas })
    expect(preguntas.map((p) => p.id)).toContain('detalle_prendas_delicadas')
  })
})

describe('validarRespuestas', () => {
  it('rechaza cantidades no enteras o menores a 1', () => {
    const preguntas = preguntasVisibles(LAVADO, 'recojo', {})
    const base = { tipo_servicio: 'Solo lavado', persona_entrega: 'Ana', contacto_recojo: '987654321' }
    expect(validarRespuestas(preguntas, { ...base, cantidad_prendas: '0' })).toMatch(/cantidad/)
    expect(validarRespuestas(preguntas, { ...base, cantidad_prendas: '2.5' })).toMatch(/cantidad/)
  })

  it('rechaza un celular inválido', () => {
    const preguntas = preguntasVisibles(LAVADO, 'recojo', {})
    const r = {
      tipo_servicio: 'Solo lavado',
      cantidad_prendas: '10',
      persona_entrega: 'Ana',
      contacto_recojo: '12345',
      direccion_entrega_opcion: 'La misma dirección de recojo.',
      prendas_delicadas: 'No',
    }
    expect(validarRespuestas(preguntas, r)).toMatch(/celular/)
    expect(validarRespuestas(preguntas, { ...r, contacto_recojo: '987654321' })).toBeNull()
  })
})

describe('resumenRespuestas', () => {
  it('omite las vacías y une las de selección múltiple', () => {
    const preguntas = preguntasVisibles(LAVADO, 'recojo', { tipo_servicio: 'Solo lavado' })
    const { publico: resumen } = resumenRespuestas(preguntas, {
      tipo_servicio: 'Solo lavado',
      tipos_prenda: ['Toallas', 'Ropa de cama'],
      observaciones_prendas: '  ',
    })
    expect(resumen).toEqual([
      { etiqueta: '¿Qué servicio necesita?', valor: 'Solo lavado' },
      { etiqueta: 'Tipo de prendas (marca las que apliquen)', valor: 'Toallas, Ropa de cama' },
    ])
  })
})

describe('resumenRespuestas - datos personales', () => {
  it('separa nombre, celular y dirección de entrega de lo que ve cualquier candidata', () => {
    const preguntas = preguntasVisibles(LAVADO, 'recojo', {
      tipo_servicio: 'Solo lavado',
      direccion_entrega_opcion: 'Otra dirección.',
    })
    const { publico, privado } = resumenRespuestas(preguntas, {
      tipo_servicio: 'Solo lavado',
      persona_entrega: 'Ana Pérez',
      contacto_recojo: '987654321',
      direccion_entrega_opcion: 'Otra dirección.',
      direccion_entrega: 'Jr. Lima 123',
    })
    const textoPublico = JSON.stringify(publico)
    expect(textoPublico).not.toContain('Ana Pérez')
    expect(textoPublico).not.toContain('987654321')
    expect(textoPublico).not.toContain('Jr. Lima 123')
    expect(privado.map((p) => p.valor)).toEqual(['Ana Pérez', '987654321', 'Jr. Lima 123'])
  })
})

describe('estimarFechaEntrega', () => {
  it('suma 1 día hasta 15 prendas y 2 hasta 30', () => {
    expect(estimarFechaEntrega('2026-10-30', 10)).toBe('2026-10-31')
    expect(estimarFechaEntrega('2026-10-30', 25)).toBe('2026-11-01')
  })

  it('devuelve null con cantidades grandes o inválidas', () => {
    expect(estimarFechaEntrega('2026-10-30', 31)).toBeNull()
    expect(estimarFechaEntrega('2026-10-30', 0)).toBeNull()
    expect(estimarFechaEntrega('', 5)).toBeNull()
  })
})
