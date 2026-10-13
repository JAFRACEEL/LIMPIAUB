import { describe, expect, it } from 'vitest'
import { borradorVacio, type PedidoBorrador } from './borrador'
import { MODALIDADES_POR_SERVICIO, servicioPorId } from './catalogoServicios'
import { oficiosFueraDeGenerales } from './interpretar'
import { problemaDeOficio, validarNecesidad } from './pasosPedido'
import { modalidadesDelPedido } from './solicitud'

// Frases de oficios que NO se pueden pedir como "Reparaciones generales" (misma lista que la prueba SQL).
export const FRASES_DE_OFICIO: [string, string][] = [
  ['Quiero cambiar un enchufe', 'electricidad'],
  ['Arreglar mi tomacorriente', 'electricidad'],
  ['Cambiar un foco de la sala', 'electricidad'],
  ['Se me gotea el caño', 'gasfiteria'],
  ['Hay una fuga de agua en el baño', 'gasfiteria'],
  ['Destapar el desagüe', 'gasfiteria'],
  ['Limpiar mi aire acondicionado', 'aire_acondicionado'],
  ['Cambiar la chapa de la puerta', 'cerrajeria'],
  ['Pintar la pared del cuarto', 'pintura'],
  ['Cambiar una loseta rota', 'albanileria'],
  ['Se rompió el vidrio de la ventana', 'vidrieria_aluminio'],
  ['Arreglar la bisagra del ropero', 'carpinteria'],
]

export const FRASES_DE_GENERALES = ['Colgar tres cuadros en la sala', 'Instalar un perchero en el pasillo', 'Ajustar los tornillos del estante']

const general = (texto: string): PedidoBorrador => ({
  ...borradorVacio(),
  servicioId: 'mantenimiento_general',
  texto,
  modalidad: 'horas',
  horas: 2,
})

describe('"Reparaciones generales" no es un atajo para contratar por horas un oficio deshabilitado', () => {
  it.each(FRASES_DE_OFICIO)('rechaza «%s» (%s)', (frase, oficio) => {
    expect(oficiosFueraDeGenerales(frase)).toContain(oficio)
    expect(problemaDeOficio(general(frase))).toContain('«Reparaciones generales» no cubre')
    expect(validarNecesidad(general(frase), 0)).toContain('no cubre electricidad, gasfitería ni otros oficios')
  })

  it.each(FRASES_DE_GENERALES)('acepta «%s» (arreglo sin oficio)', (frase) => {
    expect(oficiosFueraDeGenerales(frase)).toEqual([])
    expect(problemaDeOficio(general(frase))).toBeNull()
    expect(validarNecesidad(general(frase), 0)).toBeNull()
  })

  it('el mismo texto en su propio servicio no se cuela por horas: electricidad no tiene horas', () => {
    const electricidad = { ...general('Quiero cambiar un enchufe'), servicioId: 'electricidad', respuestas: { riesgo_electrico: 'No' } }
    expect(modalidadesDelPedido(electricidad)).toEqual([])
    expect(validarNecesidad(electricidad, 0)).toContain('todavía no está disponible')
  })

  it('ningún servicio cuya forma de cobro no admite horas se puede reconstruir como "general"', () => {
    for (const [id, modalidades] of Object.entries(MODALIDADES_POR_SERVICIO)) {
      if (id === 'mantenimiento_general' || modalidades.includes('horas')) continue
      const ejemplos = FRASES_DE_OFICIO.filter(([, o]) => o === id)
      // Cada oficio sin horas tiene al menos una frase de prueba (o no tiene palabras propias aún).
      for (const [frase] of ejemplos) expect(problemaDeOficio(general(frase)), `${id}: ${frase}`).not.toBeNull()
    }
  })

  it('la ficha delimita su alcance y lo dice', () => {
    const ficha = servicioPorId('mantenimiento_general')
    const texto = (ficha?.detalle?.noIncluye ?? []).join(' ')
    for (const oficio of ['Electricidad', 'Gasfitería', 'Aire acondicionado', 'Cerrajería', 'Carpintería']) expect(texto).toContain(oficio)
    expect(MODALIDADES_POR_SERVICIO.mantenimiento_general).toEqual(['horas', 'fijo'])
  })
})
