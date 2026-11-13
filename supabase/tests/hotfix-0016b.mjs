// PRUEBA DE supabase/hotfix/0016b_alta_tecnico_pendiente.sql en Postgres en memoria (PGlite). SIMULACIÓN: no toca ninguna base real.
// Uso:  npm i --no-save @electric-sql/pglite  &&  node supabase/tests/hotfix-0016b.mjs
import { crearBase } from './arnes.mjs'
import fs from 'node:fs'

let fallos = 0, pasos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }
const PARCHE = fs.readFileSync(new URL('../hotfix/0016b_alta_tecnico_pendiente.sql', import.meta.url), 'utf8')
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`
const [A, B, C, D, E, ADM] = [U(1), U(2), U(3), U(4), U(5), U(6)]

const como = async (db, uid, fn, role = 'authenticated') => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid ?? ''}',false), set_config('request.jwt.claim.role','${role}',false)`)
  await db.exec(`set role ${role}`)
  try { return await fn() } finally { await db.exec('reset role') }
}
const intenta = async (fn) => { try { return { ok: true, v: await fn() } } catch (e) { return { ok: false, e: String(e.message) } } }
const fila = async (db, id) => (await db.query(`select * from trabajadores where id = '${id}'`)).rows[0]

const db = await crearBase({ hasta: 15 })
await db.exec(`
  insert into auth.users (id, email) select id, id::text || '@x.pe' from (values ('${A}'::uuid),('${B}'),('${C}'),('${D}'),('${E}'),('${ADM}')) v(id);
  insert into perfiles (id, rol, nombre, telefono, zona, direccion) values
    ('${A}','cliente','A','911111111','Iquitos','x'),('${B}','cliente','B','911111112','Iquitos','x'),('${C}','trabajador','C','911111113','Iquitos','x'),
    ('${D}','trabajador','D','911111114','Iquitos','x'),('${E}','trabajador','E','911111115','Iquitos','x'),('${ADM}','admin','Admin','933333333','Iquitos','x');
`)

console.log('Antes del parche (demuestra el problema)')
const a1 = await intenta(() => como(db, A, () => db.exec(`insert into trabajadores (id, nacionalidad, numero_documento, zonas, servicios, tarifa_hora, verificado, rating_avg, rating_n, trabajos_completados)
  values ('${A}','peruana','10000001',array['Iquitos'],array['Electricidad'],30,true,5,50,99)`)))
const fa = await fila(db, A)
ok(a1.ok && fa.verificado === true && fa.habilitado_trabajar === true, 'un usuario común se da de alta YA verificado y habilitado')
ok(Number(fa.trabajos_completados) === 99, 'y con reputación inventada (trabajos_completados = 99)')
await db.exec(`delete from trabajadores where id = '${A}'`)

console.log('Se aplica el parche (dos veces: idempotente)')
await db.exec(PARCHE); await db.exec(PARCHE)
ok(true, 'el parche se aplica dos veces sin error')
ok((await db.query(`select count(*)::int n from pg_trigger where tgname = 'trg_trabajador_alta_pendiente'`)).rows[0].n === 1, 'queda un solo trigger')

console.log('Después del parche')
const b1 = await intenta(() => como(db, A, () => db.exec(`insert into trabajadores (id, nacionalidad, numero_documento, zonas, servicios, tarifa_hora, verificado, habilitado_trabajar, verificacion_rechazada, motivo_rechazo, disponible_ahora, estado_migratorio, rating_avg, rating_n, trabajos_completados)
  values ('${A}','peruana','10000001',array['Iquitos'],array['Electricidad'],30,true,true,true,'x',true,'validado',5,50,99)`)))
const fb = await fila(db, A)
ok(b1.ok, 'el alta no revienta (la fila se crea), pero…')
ok(fb.verificado === false && fb.habilitado_trabajar === false, '…nace NO verificada y NO habilitada aunque lo pida')
ok(fb.verificacion_rechazada === false && fb.motivo_rechazo === null && fb.disponible_ahora === false, 'sin campos de verificación ni disponibilidad heredados')
ok(fb.estado_migratorio === 'no_aplica', "estado_migratorio 'validado' pedido por una peruana vuelve a 'no_aplica'")
ok(Number(fb.trabajos_completados) === 0 && Number(fb.rating_n) === 0 && Number(fb.rating_avg) === 0, 'la reputación nace en cero')

const b2 = await intenta(() => como(db, B, () => db.exec(`insert into trabajadores (id, nacionalidad, tipo_documento, numero_documento, zonas, servicios, tarifa_hora, verificado, estado_migratorio)
  values ('${B}','extranjera','carne_extranjeria','20000002',array['Iquitos'],array['Electricidad'],30,true,'validado')`)))
const fb2 = await fila(db, B)
if (!b2.ok) console.log('    error:', b2.e)
ok(b2.ok && fb2.verificado === false && fb2.estado_migratorio === 'pendiente_validacion', "una extranjera que pide 'validado' queda en 'pendiente_validacion' y sin verificar")

console.log('El alta normal sigue funcionando')
const c1 = await intenta(() => como(db, C, () => db.exec(`insert into trabajadores (id, nacionalidad, numero_documento, zonas, servicios, tarifa_hora, experiencia, kit_propio, referencia1_nombre, referencia1_celular, antecedentes)
  values ('${C}','peruana','30000003',array['Iquitos','Punchana'],array['Electricidad','Gasfitería'],45.5,'5 años',true,'Ana','911000001','vigente')`)))
const fc = await fila(db, C)
ok(c1.ok && fc.verificado === false && fc.habilitado_trabajar === false, 'alta normal: queda pendiente')
ok(fc.numero_documento === '30000003' && Number(fc.tarifa_hora) === 45.5 && fc.kit_propio === true && fc.experiencia === '5 años' && fc.antecedentes === 'vigente' && fc.referencia1_nombre === 'Ana',
  'y conserva todos sus datos declarados (documento, tarifa, kit, experiencia, antecedentes, referencias)')
ok(fc.zonas.length === 2 && fc.servicios.length === 2, 'y sus zonas y servicios')
const d1 = await intenta(() => como(db, D, () => db.exec(`insert into trabajadores (id, nacionalidad, tipo_documento, numero_documento, zonas, servicios, tarifa_hora, estado_migratorio)
  values ('${D}','extranjera','carne_extranjeria','40000004',array['Iquitos'],array['Electricidad'],30,'pendiente_validacion')`)))
if (!d1.ok) console.log('    error:', d1.e)
ok(d1.ok && (await fila(db, D)).estado_migratorio === 'pendiente_validacion', "una extranjera con 'pendiente_validacion' lo conserva (flujo del registro actual)")

console.log('La verificación por un admin sigue funcionando')
const v1 = await intenta(() => como(db, ADM, () => db.exec(`update trabajadores set verificado = true where id = '${C}'`)))
const fc2 = await fila(db, C)
ok(v1.ok && fc2.verificado === true && fc2.habilitado_trabajar === true, 'el admin verifica y la técnica queda habilitada')
const v2 = await intenta(() => como(db, A, () => db.exec(`update trabajadores set verificado = true where id = '${A}'`)))
ok(!v2.ok && /Solo un administrador/.test(v2.e) && (await fila(db, A)).verificado === false, 'un técnico no se verifica a sí mismo con UPDATE (guarda existente)')
const v3 = await intenta(() => como(db, ADM, () => db.exec(`update trabajadores set verificacion_rechazada = true, motivo_rechazo = 'documento ilegible' where id = '${D}'`)))
ok(v3.ok && (await fila(db, D)).verificacion_rechazada === true, 'el admin rechaza una verificación sin problema')

console.log('Otras identidades')
const s1 = await intenta(() => db.exec(`insert into trabajadores (id, nacionalidad, numero_documento, zonas, servicios, tarifa_hora, verificado)
  values ('${E}','peruana','50000005',array['Iquitos'],array['Electricidad'],30,true)`))
const fe = await fila(db, E)
ok(s1.ok && fe.verificado === true && fe.habilitado_trabajar === true, 'el SQL Editor (postgres) sí puede dar de alta un técnico ya verificado (cargas manuales y semillas)')
ok(!(await db.query(`select has_function_privilege('authenticated', 'public.fn_trabajador_alta_pendiente()', 'execute') a`)).rows[0].a, 'la función del trigger no es ejecutable por la API')

console.log(fallos ? `\n${fallos} de ${pasos} comprobaciones FALLARON` : `\nTodo bien: ${pasos} comprobaciones`)
process.exit(fallos ? 1 : 0)
