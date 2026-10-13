import { describe, expect, it } from 'vitest'
import migracionSql from '../../supabase/migrations/0015_experiencia_cliente.sql?raw'
import { CATALOGO_SERVICIOS, MODALIDADES_POR_SERVICIO, servicioPorId } from './catalogoServicios'

// Extrae de la migración los pares (servicio, modalidad) que se siembran en servicio_modalidades.
function paresDeLaMigracion(): Set<string> {
  const sql = migracionSql
  const bloque = sql.slice(sql.indexOf('insert into servicio_modalidades'), sql.indexOf('on conflict do nothing'))
  const pares = new Set<string>()
  for (const m of bloque.matchAll(/\('([^']+)','([^']+)'\)/g)) pares.add(`${m[1]}|${m[2]}`)
  return pares
}

describe('catálogo y servidor coinciden en las modalidades permitidas', () => {
  it('cada servicio del catálogo tiene las mismas modalidades en MODALIDADES_POR_SERVICIO y en la migración', () => {
    const migracion = paresDeLaMigracion()
    const catalogo = new Set<string>()
    for (const [id, modalidades] of Object.entries(MODALIDADES_POR_SERVICIO)) {
      const nombre = servicioPorId(id)?.nombre
      expect(nombre, `servicio ${id} existe`).toBeTruthy()
      for (const m of modalidades) catalogo.add(`${nombre}|${m}`)
    }
    expect([...catalogo].sort()).toEqual([...migracion].sort())
  })
  it('todos los servicios del catálogo tienen al menos una modalidad', () => {
    for (const s of CATALOGO_SERVICIOS) expect(MODALIDADES_POR_SERVICIO[s.id]?.length, s.id).toBeGreaterThan(0)
  })
  it('los oficios con diagnóstico o precio fijo no admiten "horas" como sustituto', () => {
    for (const id of ['electricidad', 'gasfiteria', 'aire_acondicionado', 'cerrajeria']) {
      expect(MODALIDADES_POR_SERVICIO[id]).not.toContain('horas')
    }
  })
})
