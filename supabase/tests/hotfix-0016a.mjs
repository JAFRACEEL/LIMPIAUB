// PRUEBA DE supabase/hotfix/0016a_proteger_rol_perfiles.sql en Postgres en memoria (PGlite). SIMULACIÓN: no toca ninguna base real.
// Uso:  npm i --no-save @electric-sql/pglite  &&  node supabase/tests/hotfix-0016a.mjs
import { crearBase } from './arnes.mjs'
import fs from 'node:fs'

let fallos = 0, pasos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }
const PARCHE = fs.readFileSync(new URL('../hotfix/0016a_proteger_rol_perfiles.sql', import.meta.url), 'utf8')
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`
const C1 = U(1), ADM = U(2)

const como = async (db, uid, fn, role = 'authenticated') => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid ?? ''}',false), set_config('request.jwt.claim.role','${role}',false)`)
  await db.exec(`set role ${role}`)
  try { return await fn() } finally { await db.exec('reset role') }
}
const intenta = async (fn) => { try { return { ok: true, v: await fn() } } catch (e) { return { ok: false, e: String(e.message) } } }
const rolDe = async (db, id) => (await db.query(`select rol from perfiles where id = '${id}'`)).rows[0]?.rol

const db = await crearBase({ hasta: 15 })
await db.exec(`
  insert into auth.users (id, email) values ('${C1}','c@x.pe'),('${ADM}','a@x.pe');
  insert into perfiles (id, rol, nombre, telefono, zona, direccion) values
    ('${C1}','cliente','Cliente','911111111','Iquitos','x'),('${ADM}','admin','Admin','933333333','Iquitos','x');
`)

console.log('Antes del parche (demuestra el problema)')
const antes = await intenta(() => como(db, C1, () => db.exec(`update perfiles set rol = 'admin' where id = '${C1}'`)))
ok(antes.ok && (await rolDe(db, C1)) === 'admin', 'un cliente puede ascenderse a admin con su propio UPDATE')
await db.exec(`update perfiles set rol = 'cliente' where id = '${C1}'`)

console.log('Se aplica el parche (dos veces: debe ser idempotente)')
await db.exec(PARCHE); await db.exec(PARCHE)
ok(true, 'el parche se aplica dos veces sin error')

console.log('Después del parche')
const r1 = await intenta(() => como(db, C1, () => db.exec(`update perfiles set rol = 'admin' where id = '${C1}'`)))
ok(!r1.ok && /rol no se puede cambiar/.test(r1.e) && (await rolDe(db, C1)) === 'cliente', 'cliente NO puede ascenderse a admin')
const r2 = await intenta(() => como(db, C1, () => db.exec(`update perfiles set rol = 'trabajador' where id = '${C1}'`)))
ok(!r2.ok && (await rolDe(db, C1)) === 'cliente', 'cliente NO puede cambiarse a trabajador')
const r3 = await intenta(() => como(db, ADM, () => db.exec(`update perfiles set rol = 'admin' where id = '${C1}'`)))
ok(!r3.ok && (await rolDe(db, C1)) === 'cliente', 'ni un admin cambia roles por la API (se hace en el SQL Editor)')
const r4 = await intenta(() => como(db, null, () => db.exec(`update perfiles set rol = 'admin' where id = '${C1}'`), 'anon'))
ok((await rolDe(db, C1)) === 'cliente', 'anon tampoco (no cambia nada)')
const r5 = await intenta(() => como(db, C1, () => db.exec(`update perfiles set nombre = 'Nuevo', direccion = 'Otra' where id = '${C1}'`)))
ok(r5.ok, 'editar nombre y dirección sigue funcionando')
const r6 = await intenta(() => como(db, C1, () => db.exec(`insert into perfiles (id, rol, nombre, telefono, zona) values ('${C1}','cliente','Cliente','911111111','Iquitos')
  on conflict (id) do update set rol = excluded.rol, nombre = excluded.nombre`)))
ok(r6.ok, 'el upsert del registro con el mismo rol sigue funcionando')
const r7 = await intenta(() => como(db, C1, () => db.exec(`insert into perfiles (id, rol, nombre, telefono, zona) values ('${C1}','admin','Cliente','911111111','Iquitos')
  on conflict (id) do update set rol = excluded.rol`)))
ok(!r7.ok && (await rolDe(db, C1)) === 'cliente', 'un upsert que intenta subir el rol también se rechaza')
const r8 = await intenta(() => db.exec(`update perfiles set rol = 'trabajador' where id = '${C1}'`))
ok(r8.ok && (await rolDe(db, C1)) === 'trabajador', 'el SQL Editor (postgres) sí puede cambiar el rol')
ok(!(await db.query(`select has_function_privilege('authenticated', 'public.fn_proteger_rol_perfiles()', 'execute') a`)).rows[0].a, 'la función del trigger no es ejecutable por la API')

console.log(fallos ? `\n${fallos} de ${pasos} comprobaciones FALLARON` : `\nTodo bien: ${pasos} comprobaciones`)
process.exit(fallos ? 1 : 0)
