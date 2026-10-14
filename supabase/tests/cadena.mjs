// Verifica que la cadena de migraciones se aplica en el ORDEN PREPARADO para la CLI de Supabase
// (.supabase-test/supabase/migrations, generado por entorno-local.ps1 -SoloPreparar): schema.sql primero,
// luego 0001..0014 con datos antiguos ya sembrados, y la 0015 encima. Comprueba que:
//   - cada archivo se aplica sin error y la cadena completa se puede repetir (idempotente);
//   - no quedan estructuras duplicadas (triggers, políticas, índices, restricciones, funciones sobrecargadas);
//   - las reservas ANTERIORES no cambian ninguna de sus columnas originales.
// Comprobación SQL en PGlite: no sustituye a una base Supabase real (ver docs/pruebas-integracion.md).
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { leerSql, nuevoMotor } from './arnes.mjs'

let fallos = 0, pasos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }

const prep = fileURLToPath(new URL('../../.supabase-test/supabase/migrations/', import.meta.url))
if (!fs.existsSync(prep)) {
  console.error('Falta .supabase-test/. Ejecuta primero: pwsh supabase/tests/entorno-local.ps1 -SoloPreparar')
  process.exit(2)
}
const archivos = fs.readdirSync(prep).filter((f) => f.endsWith('.sql')).sort()
const m15 = fileURLToPath(new URL('../migrations/0015_experiencia_cliente.sql', import.meta.url))

const db = await nuevoMotor()
async function aplicar(ruta, etiqueta) {
  try { await db.exec(leerSql(ruta)); return true } catch (e) { console.log('  ✗ FALLÓ', etiqueta, '-', String(e.message).slice(0, 300)); fallos++; pasos++; return false }
}

console.log('— Orden preparado para la CLI')
ok(archivos[0].includes('schema'), `el primero es el esquema base (${archivos[0]})`)
ok(archivos.length === 15, `hay 15 archivos antes de la 0015 (schema + 0001..0014): ${archivos.length}`)
const versiones = archivos.map((f) => f.slice(0, 14))
ok(versiones.every((v, i) => i === 0 || v > versiones[i - 1]), 'las versiones (marcas de tiempo) son estrictamente crecientes: la CLI las aplica en este orden')
ok(!fs.existsSync(`${prep}/20260101000015_0015_experiencia_cliente.sql`), 'la 0015 NO está en el directorio inicial (se agrega después, sobre datos viejos)')

console.log('\n— Aplicar schema + 0001..0014')
let todoBien = true
for (const f of archivos) todoBien = (await aplicar(`${prep}/${f}`, f)) && todoBien
ok(todoBien, 'los 15 archivos se aplican sin error')

// ---- Datos ANTERIORES a la 0015, de todos los estados ----
const U = (n) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`
const C1 = U(1), W1 = U(3), W2 = U(4), ADM = U(7)
const manana = new Date(Date.now() + 86400_000).toISOString().slice(0, 10)
await db.exec(`
  insert into auth.users (id, email) values ('${C1}','c@x.pe'),('${W1}','w1@x.pe'),('${W2}','w2@x.pe'),('${ADM}','a@x.pe');
  insert into perfiles (id, rol, nombre, telefono, zona, direccion) values
   ('${C1}','cliente','Cliente','911111111','Iquitos','Jr. Lima 1'),
   ('${W1}','trabajador','Pro Uno','922222221','Iquitos','x'),
   ('${W2}','trabajador','Pro Dos','922222222','Iquitos','x'),
   ('${ADM}','admin','Admin','933333333','Iquitos','x');
  insert into trabajadores (id, numero_documento, zonas, servicios, tarifa_hora, kit_propio, verificado, disponible_ahora, ultima_actividad) values
   ('${W1}','10000001',array['Iquitos'],array['Limpieza básica del hogar'],25,true,true,true,now()),
   ('${W2}','10000002',array['Iquitos'],array['Limpieza básica del hogar'],30,true,true,true,now());
  insert into reservas (id, cliente_id, trabajador_id, servicio, fecha, hora, horas, direccion, zona, tarifa_hora, estado, modo, con_materiales, recargo_materiales, pago_metodo, ventana_cierra_en) values
   ('cccccccc-0000-0000-0000-000000000001','${C1}','${W1}','Limpieza básica del hogar','2026-01-10','09:00',3,'Jr. A','Iquitos',25,'completada','directo',false,0,'yape',null),
   ('cccccccc-0000-0000-0000-000000000002','${C1}','${W2}','Limpieza básica del hogar','2026-02-10','09:00',4,'Jr. B','Iquitos',30,'completada','directo',true,18,'plin',null),
   ('cccccccc-0000-0000-0000-000000000003','${C1}','${W1}','Limpieza básica del hogar','${manana}','09:00',2,'Jr. C','Iquitos',25,'aceptada','directo',false,0,null,null),
   ('cccccccc-0000-0000-0000-000000000004','${C1}','${W2}','Limpieza básica del hogar','2026-03-01','09:00',2,'Jr. D','Iquitos',30,'cancelada','directo',false,0,null,null),
   ('cccccccc-0000-0000-0000-000000000005','${C1}','${W1}','Limpieza básica del hogar','2026-03-05','09:00',2,'Jr. E','Iquitos',25,'rechazada','directo',false,0,null,null),
   ('cccccccc-0000-0000-0000-000000000006','${C1}',null,'Limpieza básica del hogar','${manana}','12:00',2,'Jr. F','Iquitos',null,'solicitada','abierto',false,0,null, now() + interval '20 minutes'),
   ('cccccccc-0000-0000-0000-000000000007','${C1}','${W2}','Limpieza básica del hogar','${manana}','16:00',2,'Jr. G','Iquitos',30,'solicitada','directo',false,0,null, now() + interval '20 minutes');
  insert into candidaturas (reserva_id, trabajador_id) values ('cccccccc-0000-0000-0000-000000000006','${W1}');
  insert into calificaciones (reserva_id, de_id, para_id, estrellas, comentario) values ('cccccccc-0000-0000-0000-000000000001','${C1}','${W1}',5,'Muy bien');
  -- Una reserva anterior que un admin ya marcó como pagada (sin filas en pagos, que no existían).
  update reservas set pago_confirmado = true where id = 'cccccccc-0000-0000-0000-000000000001';
`)
const COLUMNAS_ANTIGUAS = 'id, cliente_id, trabajador_id, servicio, fecha, hora, horas, direccion, zona, tarifa_hora, total, comision_pct, estado, pago_metodo, pago_confirmado, modo, con_materiales, recargo_materiales, ventana_cierra_en, creado_en, inicio_real, fin_real, zona_ampliada, elegir_por_mi'
const foto = async () => JSON.stringify((await db.query(`select ${COLUMNAS_ANTIGUAS} from reservas order by id`)).rows)
const conteo = async () => JSON.stringify((await db.query(`select (select count(*) from candidaturas)::int c, (select count(*) from calificaciones)::int k, (select count(*) from perfiles)::int p, (select count(*) from trabajadores)::int t`)).rows)
const antes = await foto(), conteoAntes = await conteo()
const totalesAntes = (await db.query(`select id, total from reservas order by id`)).rows.map((r) => `${r.id.slice(-1)}:${r.total}`).join(' ')

console.log('\n— Aplicar la 0015 sobre esos datos')
ok(await aplicar(m15, '0015'), 'la 0015 se aplica sin error')
ok((await foto()) === antes, 'ninguna columna original de las 7 reservas anteriores cambió (todas comparadas)')
ok((await conteo()) === conteoAntes, 'candidaturas, calificaciones, perfiles y profesionales intactos')
const despues = (await db.query(`select id, total, total_cliente, modalidad_precio, personas, programacion, necesidad from reservas order by id`)).rows
ok(despues.map((r) => `${r.id.slice(-1)}:${r.total}`).join(' ') === totalesAntes, `los totales siguen igual (${totalesAntes})`)
ok(despues.every((r) => r.total === null ? r.total_cliente === null : Number(r.total_cliente) === Number(r.total)), 'total_cliente = total en todas (null donde aún no había precio)')
ok(despues.every((r) => r.modalidad_precio === 'horas' && r.personas === 1 && r.programacion === 'programada' && r.necesidad === null), 'valores por defecto de las columnas nuevas')
ok((await db.query(`select count(*)::int n from propuestas`)).rows[0].n === 0 && (await db.query(`select count(*)::int n from pagos`)).rows[0].n === 0, 'no se inventaron propuestas ni pagos para reservas anteriores')

console.log('\n— Reservas anteriores siguen funcionando con sus reglas de siempre')
async function como(uid, fn, role = 'authenticated') {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false), set_config('request.jwt.claim.role','${role}',false)`)
  await db.exec(`set role ${role}`)
  try { return await fn() } finally { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','',false)`) }
}
const intenta = async (fn) => { try { return { ok: true, v: await fn() } } catch (e) { return { ok: false, e: String(e.message) } } }
{
  const id3 = 'cccccccc-0000-0000-0000-000000000003'
  for (const estado of ['en_camino', 'en_curso', 'completada']) {
    const r = await intenta(() => como(W1, () => db.exec(`update reservas set estado='${estado}' where id='${id3}'`)))
    ok(r.ok, `el profesional avanza una reserva anterior a ${estado}: ` + (r.e ?? ''))
  }
  const [r3] = (await db.query(`select estado, total, total_cliente, fin_real is not null as fin from reservas where id='${id3}'`)).rows
  ok(r3.estado === 'completada' && Number(r3.total) === 50 && r3.fin, 'completada con su total de siempre (50) y fin_real fijado por el servidor')
  const id7 = 'cccccccc-0000-0000-0000-000000000007'
  ok((await intenta(() => como(W2, () => db.exec(`update reservas set estado='aceptada' where id='${id7}'`)))).ok, 'un pedido directo anterior pendiente se puede aceptar')
  const id6 = 'cccccccc-0000-0000-0000-000000000006'
  ok((await intenta(() => como(C1, () => db.exec(`update reservas set estado='cancelada' where id='${id6}'`)))).ok, 'una solicitud abierta anterior se puede cancelar')
  const pago = await intenta(() => como(C1, async () => (await db.query(`select registrar_pago('cccccccc-0000-0000-0000-000000000002','plin','OP-9',null) as id`)).rows[0].id))
  ok(pago.ok, 'se puede registrar el pago de una reserva anterior completada: ' + (pago.e ?? ''))
  const [pg] = (await db.query(`select monto from pagos where id=$1`, [pago.v])).rows
  ok(Number(pg.monto) === 138, 'por su total anterior: 30 × 4 + kit 18 = 138')
  // Pagada antes de existir la tabla de pagos: no se puede volver a cobrar ni se pierde el dato
  const yaPagada = await intenta(() => como(C1, () => db.exec(`select registrar_pago('cccccccc-0000-0000-0000-000000000001','yape','OP-1',null)`)))
  ok(!yaPagada.ok && /ya figura como pagado/.test(yaPagada.e), 'una reserva anterior ya pagada no se puede cobrar de nuevo')
  await db.exec(`select fn_recalcular_totales('cccccccc-0000-0000-0000-000000000001')`)
  const [pp] = (await db.query(`select pago_confirmado from reservas where id='cccccccc-0000-0000-0000-000000000001'`)).rows
  ok(pp.pago_confirmado === true, 'recalcular no la devuelve a "sin pagar"')
}

console.log('\n— Cada archivo se puede aplicar dos veces seguidas (idempotencia, sin duplicar nada)')
// Los archivos son pasos SECUENCIALES: volver a aplicar uno viejo después de los siguientes no es un caso válido
// (por ejemplo schema.sql recrea una vista que migraciones posteriores ampliaron). Lo que sí debe cumplirse es que
// cada archivo, aplicado dos veces seguidas, no falle ni agregue estructuras (se re-ejecutan desde el SQL Editor).
const estructuras = async (motor) => JSON.stringify((await motor.query(`select (select count(*) from pg_trigger where not tgisinternal)::int tr, (select count(*) from pg_policies)::int po, (select count(*) from pg_indexes where schemaname='public')::int ix, (select count(*) from pg_constraint where connamespace='public'::regnamespace)::int co, (select count(*) from pg_proc where pronamespace='public'::regnamespace)::int fn, (select count(*) from pg_class where relnamespace='public'::regnamespace)::int rel`)).rows[0])
{
  const db2 = await nuevoMotor()
  const lista = [...archivos.map((f) => [`${prep}/${f}`, f]), [m15, '0015_experiencia_cliente.sql']]
  let todosIdempotentes = true
  for (const [ruta, nombre] of lista) {
    try { await db2.exec(leerSql(ruta)) } catch (e) { console.log('  ✗ FALLÓ', nombre, '(1.ª)', String(e.message).slice(0, 200)); todosIdempotentes = false; break }
    const antes2 = await estructuras(db2)
    try { await db2.exec(leerSql(ruta)) } catch (e) { console.log('  ✗ NO IDEMPOTENTE', nombre, '-', String(e.message).slice(0, 200)); todosIdempotentes = false; continue }
    const despues2 = await estructuras(db2)
    if (antes2 !== despues2) { console.log('  ✗ DUPLICA ESTRUCTURAS', nombre, antes2, despues2); todosIdempotentes = false }
  }
  ok(todosIdempotentes, `los ${lista.length} archivos (schema + 0001..0014 + 0015) se pueden aplicar dos veces seguidas sin error ni duplicados`)
}

console.log('\n— Estructuras duplicadas')
const dups = async (sql) => (await db.query(sql)).rows
{
  const f = await dups(`select proname, count(*)::int n from pg_proc where pronamespace='public'::regnamespace group by proname having count(*) > 1`)
  ok(f.length === 0, 'ninguna función pública está sobrecargada por accidente' + (f.length ? ': ' + JSON.stringify(f) : ''))
  const t = await dups(`select tgrelid::regclass::text tabla, tgfoid::regproc::text funcion, tgtype, count(*)::int n from pg_trigger where not tgisinternal group by 1,2,3 having count(*) > 1`)
  ok(t.length === 0, 'ningún trigger repetido (misma tabla, función y evento)' + (t.length ? ': ' + JSON.stringify(t) : ''))
  const p = await dups(`select tablename, cmd, qual, with_check, count(*)::int n from pg_policies group by 1,2,3,4 having count(*) > 1`)
  ok(p.length === 0, 'ninguna política repetida' + (p.length ? ': ' + JSON.stringify(p.map((x) => [x.tablename, x.cmd])) : ''))
  const i = await dups(`select indrelid::regclass::text tabla, indkey::text cols, coalesce(pg_get_expr(indpred, indrelid),'') pred, count(*)::int n from pg_index where indrelid in (select oid from pg_class where relnamespace='public'::regnamespace) group by 1,2,3, indisunique having count(*) > 1`)
  ok(i.length === 0, 'ningún índice repetido' + (i.length ? ': ' + JSON.stringify(i) : ''))
  const c = await dups(`select conrelid::regclass::text tabla, pg_get_constraintdef(oid) def, count(*)::int n from pg_constraint where connamespace='public'::regnamespace and contype in ('c','u') group by 1,2 having count(*) > 1`)
  ok(c.length === 0, 'ninguna restricción repetida' + (c.length ? ': ' + JSON.stringify(c) : ''))
  const v = await dups(`select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='v'`)
  ok(v[0].n >= 8, `vistas presentes (${v[0].n})`)
  const h = await dups(`select a.attname from pg_attribute a where attrelid='public.reservas'::regclass and attnum>0 and not attisdropped group by 1 having count(*) > 1`)
  ok(h.length === 0, 'ninguna columna repetida en reservas')
}

console.log(`\n${pasos - fallos}/${pasos} verificaciones OK`)
process.exit(fallos ? 1 : 0)
