import { describe, expect, it } from 'vitest'
import { cambiosPerfilAlCompletar } from './perfilProfesional'

const actual = { nombre: 'Ana Ríos', telefono: '911111111', direccion: 'Jr. Lima 1', zona: 'Punchana' }

describe('cambiosPerfilAlCompletar', () => {
  it('guarda nombre, celular y dirección editados', () => {
    const c = cambiosPerfilAlCompletar(actual, { nombre: 'Ana María Ríos', telefono: '922222222', direccion: 'Jr. Lima 2' }, null)
    expect(c).toEqual({ nombre: 'Ana María Ríos', telefono: '922222222', direccion: 'Jr. Lima 2' })
  })
  it('no envía lo que no cambió', () => {
    expect(cambiosPerfilAlCompletar(actual, { ...actual, direccion: actual.direccion }, null)).toEqual({})
  })
  it('nunca incluye el rol', () => {
    const c = cambiosPerfilAlCompletar(actual, { nombre: 'Otro', telefono: '933333333', direccion: 'x', zona: 'Belén' }, 'https://f/foto.jpg')
    expect(c).not.toHaveProperty('rol')
  })
  it('la zona solo va si cambió', () => {
    expect(cambiosPerfilAlCompletar(actual, { ...actual, zona: 'Punchana' }, null)).not.toHaveProperty('zona')
    expect(cambiosPerfilAlCompletar(actual, { ...actual, zona: 'Belén' }, null)).toHaveProperty('zona', 'Belén')
    expect(cambiosPerfilAlCompletar(actual, { ...actual }, null)).not.toHaveProperty('zona')
  })
  it('agrega la foto si se subió', () => {
    expect(cambiosPerfilAlCompletar(actual, actual, 'https://f/foto.jpg')).toEqual({ foto_url: 'https://f/foto.jpg' })
  })
  it('no borra la dirección si el campo queda vacío', () => {
    expect(cambiosPerfilAlCompletar(actual, { ...actual, direccion: '  ' }, null)).toEqual({})
  })
})
