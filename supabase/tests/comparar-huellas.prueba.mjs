// Prueba local (PGlite) de consultas-huellas-funciones.sql y del clasificador. No toca ningún proyecto.
// Verifica sobre todo que la normalización de espacios NO se confunde con equivalencia.
import { nuevoMotor } from './arnes.mjs'
import { clasificar } from './comparar-huellas.mjs'
import fs from 'node:fs'

let fallos = 0, pasos = 0
const ok = (c, m) => { pasos++; if (!c) { fallos++; console.log('  ✗', m) } else console.log('  ✓', m) }
const dir = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')
const SQL = fs.readFileSync(new URL('./consultas-huellas-funciones.sql', import.meta.url), 'utf8').replace(/^--.*$/gm, '').trim().replace(/;\s*$/, '')
const archivos = ['schema.sql', ...fs.readdirSync(dir + 'migrations').filter((n) => /^\d{4}_/.test(n) && Number(n.slice(0, 4)) <= 14).sort().map((n) => 'migrations/' + n)]
async function huellas(transformar) {
  const db = await nuevoMotor()
  for (const a of archivos) await db.exec(transformar(fs.readFileSync(dir + a, 'utf8')).replace(/create extension if not exists [^;]*;/gi, ''))
  return db
}
const consulta = async (db) => (await db.query(SQL)).rows

const base = await huellas((t) => t)                                      // tal cual (algunos cuerpos con CRLF)
const lf = await huellas((t) => t.replace(/\r\n/g, '\n'))                 // mismo texto con saltos LF
const R = await consulta(base), L = await consulta(lf)
const c1 = clasificar(R, L)
const con_cr = R.filter((r) => r.cuerpo_con_cr).map((r) => r.proname)
ok(c1.filter((x) => x.categoria === 'SOLO_FIN_DE_LINEA').map((x) => x.funcion.split('(')[0]).sort().join() === con_cr.sort().join(), `las funciones con CR salen como SOLO_FIN_DE_LINEA (${con_cr.join(', ') || 'ninguna'})`)
ok(c1.every((x) => ['IGUAL', 'SOLO_FIN_DE_LINEA'].includes(x.categoria)), 'el resto sale IGUAL (mismo texto)')

// Un cambio de espacios DENTRO de un literal: debe verse como SOLO_ESPACIOS (no demostrado), nunca como IGUAL
const mod = await huellas((t) => t.replace(/\r\n/g, '\n').replace("'Esta reserva ya no está disponible'", "'Esta  reserva ya no está disponible'"))
const M = await consulta(mod)
const c2 = clasificar(L, M)
const tocadas = c2.filter((x) => x.categoria !== 'IGUAL')
ok(tocadas.length >= 1 && tocadas.every((x) => x.categoria === 'SOLO_ESPACIOS'), `un espacio extra dentro de un literal se clasifica SOLO_ESPACIOS, no IGUAL (${tocadas.map((x) => x.funcion.split('(')[0]).join(', ')})`)

// Un cambio real del literal: DISTINTA
const real = await huellas((t) => t.replace(/\r\n/g, '\n').replace("'Esta reserva ya no está disponible'", "'Esta reserva no existe'"))
const c3 = clasificar(L, await consulta(real)).filter((x) => x.categoria !== 'IGUAL')
ok(c3.length >= 1 && c3.every((x) => x.categoria === 'DISTINTA'), 'un cambio real de texto se clasifica DISTINTA')

// Un cambio de atributo (SECURITY DEFINER -> INVOKER) con cuerpo idéntico: CABECERA_DISTINTA
await lf.exec(`alter function mi_rol() security invoker`)
const c4 = clasificar(L, await consulta(lf)).filter((x) => x.categoria !== 'IGUAL')
ok(c4.length === 1 && c4[0].categoria === 'CABECERA_DISTINTA' && /atributos/.test(c4[0].detalle), 'cuerpo idéntico con otra seguridad: CABECERA_DISTINTA (cambian los atributos)')
console.log(`\n${pasos - fallos}/${pasos} OK  [prueba local del clasificador; no usa datos de producción]`)
process.exit(fallos ? 1 : 0)
