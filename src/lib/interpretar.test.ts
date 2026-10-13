import { describe, it, expect } from 'vitest'
import { contiene, interpretar, normalizar } from './interpretar'

describe('normalizar', () => {
  it('quita tildes, eñes y signos', () => {
    expect(normalizar('¡Arreglar el CAÑO del baño!')).toBe('arreglar el cano del bano')
  })
})

describe('contiene (sinónimos y errores de tecleo)', () => {
  it('tolera errores frecuentes en palabras largas', () => {
    expect(contiene('mi tomacorente no funciona', 'tomacorriente')).toBe(true)
    expect(contiene('se rompio una losetta', 'loseta')).toBe(true)
  })
  it('no confunde palabras cortas distintas', () => {
    expect(contiene('la luna', 'luz')).toBe(false)
  })
  it('las frases exigen todas sus palabras, sin importar el orden', () => {
    expect(contiene('cambiar la llave de agua', 'llave de agua')).toBe(true)
    expect(contiene('cambiar la llave', 'llave de agua')).toBe(false)
  })
  it('acepta raíces con asterisco', () => {
    expect(contiene('quiero pintarla', 'pint*')).toBe(true)
  })
})

describe('interpretar: ejemplos del inicio', () => {
  it('"Quiero cambiar una loseta rota" → albañilería, con la confirmación esperada', () => {
    const r = interpretar('Quiero cambiar una loseta rota')
    expect(r.estado).toBe('claro')
    if (r.estado === 'claro') {
      expect(r.servicioId).toBe('albanileria')
      expect(r.confirmacion).toBe('¿Necesitas cambiar una loseta rota?')
    }
  })

  it('"Quiero arreglar mi tomacorriente" → electricidad', () => {
    const r = interpretar('Quiero arreglar mi tomacorriente')
    expect(r.estado).toBe('claro')
    if (r.estado === 'claro') {
      expect(r.servicioId).toBe('electricidad')
      expect(r.confirmacion).toContain('tomacorriente')
    }
  })

  it('reconoce el tomacorriente aunque esté mal escrito o diga enchufe', () => {
    for (const t of ['se quemo el tomacoriente', 'mi enchufe no sirve', 'toma corriente suelto']) {
      const r = interpretar(t)
      expect(r.estado === 'claro' && r.servicioId).toBe('electricidad')
    }
  })

  it('"Quiero que limpien mi cocina" → limpieza de un ambiente, sin hablar de básica o profunda', () => {
    const r = interpretar('Quiero que limpien mi cocina')
    expect(r.estado).toBe('claro')
    if (r.estado === 'claro') {
      expect(r.servicioId).toBe('limpieza_basica')
      expect(r.limpieza?.alcance).toBe('ambientes')
      expect(r.limpieza?.ambientes).toEqual(['Cocina'])
      expect(r.confirmacion).toBe('¿Quieres que limpien tu cocina?')
    }
  })

  it('"limpiar mi casa" → alcance casa', () => {
    const r = interpretar('necesito limpiar mi casa')
    expect(r.estado === 'claro' && r.limpieza?.alcance).toBe('casa')
  })

  it('una alfombra o un sofá es algo puntual', () => {
    const r = interpretar('quiero lavar y limpiar la alfombra de la sala')
    expect(r.estado === 'claro' && r.limpieza?.alcance).toBe('puntual')
  })

  it('reorganizar solo se marca si lo pidió', () => {
    const sin = interpretar('limpiar mi casa')
    const con = interpretar('limpiar mi casa y reorganizar los cajones')
    expect(sin.estado === 'claro' && sin.limpieza?.reorganizar).toBe(false)
    expect(con.estado === 'claro' && con.limpieza?.reorganizar).toBe(true)
  })

  it('después de una obra o una fiesta cambia la clasificación de limpieza', () => {
    const obra = interpretar('limpieza despues de la obra, quedó polvo')
    const fiesta = interpretar('limpiar mi casa después de la fiesta')
    expect(obra.estado === 'claro' && obra.servicioId).toBe('postobra')
    expect(fiesta.estado === 'claro' && fiesta.servicioId).toBe('postevento')
  })
})

describe('interpretar: ambigüedad y aclaraciones', () => {
  it('pared con hongo NO se resuelve como solo pintura: pregunta y permite evaluar humedad primero', () => {
    const r = interpretar('Quiero pintar mi pared con hongo')
    expect(r.estado).toBe('aclarar')
    if (r.estado === 'aclarar') {
      const servicios = r.opciones.map((o) => o.servicioId)
      expect(servicios).toContain('albanileria')
      expect(servicios).toContain('pintura')
      expect(r.opciones[0].modalidadSugerida).toBe('diagnostico')
    }
  })

  it('no emite un diagnóstico técnico: las confirmaciones son preguntas de necesidad', () => {
    for (const t of ['pared con hongo', 'se me gotea el caño', 'no enfría el aire']) {
      const r = interpretar(t)
      const textos =
        r.estado === 'claro' ? [r.confirmacion] : r.estado === 'aclarar' ? [r.pregunta, ...r.opciones.map((o) => o.confirmacion)] : []
      for (const tx of textos) expect(tx).not.toMatch(/(causa|se debe a|el problema es)/i)
    }
  })

  it('dos especialidades parecidas generan una pregunta, no una suposición', () => {
    const r = interpretar('se rompió la puerta y la chapa')
    expect(r.estado).toBe('ambiguo')
    if (r.estado === 'ambiguo') expect(r.opciones.map((o) => o.servicioId).sort()).toEqual(['carpinteria', 'cerrajeria'])
  })

  it('un texto que no se entiende deja elegir a mano', () => {
    const r = interpretar('asdf qwer')
    expect(r.estado).toBe('desconocido')
    expect(r.alternativas.length).toBeGreaterThan(5)
  })

  it('limpiar el aire acondicionado va a aire acondicionado, no a limpieza', () => {
    const r = interpretar('quiero limpiar mi aire acondicionado')
    expect(r.estado === 'claro' && r.servicioId).toBe('aire_acondicionado')
  })

  it('las alternativas de "Cambiar" no repiten limpieza', () => {
    const r = interpretar('xyz')
    const etiquetas = r.alternativas.map((a) => a.etiqueta)
    expect(etiquetas.filter((e) => e === 'Limpieza')).toHaveLength(1)
  })
})
