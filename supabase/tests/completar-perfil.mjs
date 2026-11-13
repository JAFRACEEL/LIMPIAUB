// PRUEBA (PGlite, simulación): "completar perfil de profesional" con una cuenta que ya existe (cliente).
// Comprueba contra la base con la 0016 aplicada que: nombre, celular y dirección editados PERSISTEN, que perfiles.rol NO se toca
// y que la zona no cambia salvo que se envíe. Las actualizaciones son las que arma src/lib/perfilProfesional.ts.
// Uso:  npm i --no-save @electric-sql/pglite  &&  node supabase/tests/completar-perfil.mjs
import { crearBase } from './arnes.mjs'
import fs from 'node:fs'

let fallos = 0, pasos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }
const rd = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const C = '00000000-0000-0000-0000-000000000001'
const como = async (db, uid, fn, role = 'authenticated') => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false), set_config('request.jwt.claim.role','${role}',false)`)
  await db.exec(`set role ${role}`)
  try { return await fn() } finally { await db.exec('reset role') }
}
const intenta = async (fn) => { try { return { ok: true, v: await fn() } } catch (e) { return { ok: false, e: String(e.message) } } }
const fila = async (db) => (await db.query(`select rol, nombre, telefono, direccion, zona from perfiles where id = '${C}'`)).rows[0]

const db = await crearBase({ hasta: 15 })
await db.exec(`
  insert into auth.users (id, email) values ('${C}','c@x.pe');
  insert into perfiles (id, rol, nombre, telefono, zona, direccion) values ('${C}','cliente','Ana Ríos','911111111','Punchana','Jr. Lima 1');
`)
await db.exec(rd('../hotfix/0016a_proteger_rol_perfiles.sql')); await db.exec(rd('../hotfix/0016b_alta_tecnico_pendiente.sql'))
await db.exec(rd('../migrations/0016_roles_por_capacidades.sql'))

console.log('Un cliente completa su perfil de profesional editando sus datos de contacto')
const upd = await intenta(() => como(db, C, () => db.exec(
  `update perfiles set nombre = 'Ana María Ríos', telefono = '922222222', direccion = 'Jr. Lima 99' where id = '${C}'`)))
ok(upd.ok, 'el UPDATE de nombre, celular y dirección (sin rol ni zona) se acepta')
const ins = await intenta(() => como(db, C, () => db.exec(
  `insert into trabajadores (id, genero, nacionalidad, tipo_documento, numero_documento, zonas, servicios, tarifa_hora)
   values ('${C}','femenino','peruana','dni','12345678',array['Punchana'],array['Limpieza básica del hogar'],15)`)))
ok(ins.ok, 'luego crea su fila de profesional')
const f = await fila(db)
ok(f.nombre === 'Ana María Ríos', 'el nombre persiste')
ok(f.telefono === '922222222', 'el celular persiste')
ok(f.direccion === 'Jr. Lima 99', 'la dirección persiste')
ok(f.rol === 'cliente', 'perfiles.rol NO se tocó (sigue siendo cliente)')
ok(f.zona === 'Punchana', 'la zona no cambió porque no se envió')
const t = (await db.query(`select verificado, habilitado_trabajar from trabajadores where id = '${C}'`)).rows[0]
ok(t && t.verificado === false && t.habilitado_trabajar === false, 'queda pendiente de verificación (no habilitada)')

console.log('Defensa: si se enviara el rol, la base lo rechaza')
const malo = await intenta(() => como(db, C, () => db.exec(`update perfiles set nombre = 'X', rol = 'trabajador' where id = '${C}'`)))
ok(!malo.ok && (await fila(db)).rol === 'cliente' && (await fila(db)).nombre === 'Ana María Ríos', 'un UPDATE que incluye rol se rechaza y no cambia nada')

console.log(fallos ? `\n${fallos} de ${pasos} comprobaciones FALLARON` : `\nTodo bien: ${pasos} comprobaciones`)
process.exit(fallos ? 1 : 0)
