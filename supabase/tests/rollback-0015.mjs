// PRUEBA DE LA REVERSA supabase/rollback/0015_rollback.sql en Postgres en memoria (PGlite).
// ESTADO: SIMULACIÓN. Pendiente de validación real en un proyecto Supabase de pruebas (no existe todavía).
// No toca ninguna base real. Todos los datos son sintéticos.
//
// Uso:  npm i --no-save @electric-sql/pglite  &&  node supabase/tests/rollback-0015.mjs
//
// Qué comprueba:
//   A. Operaciones del FRONTEND ANTIGUO (ae7a510, versión candidata del publicado) contra la base ya migrada (0015).
//   B. La reversa conserva VALORES (no solo filas) de reservas, propuestas, pagos, candidaturas y profesionales,
//      incluidas las reservas creadas DESPUÉS de migrar (personas, kit, total, comisión, propuestas aceptadas, pagos).
//   C. Los permisos de antes y después de la reversa son idénticos salvo lo esperado, y NO vuelven a los de antes
//      de la 0015 (fn_enviar_push sigue cerrada); el aislamiento entre usuarios se mantiene.
//   D. Después de la reversa el frontend antiguo sigue funcionando y la fórmula antigua de `total` no pisa importes nuevos.
//   E. La reversa es idempotente y también aplica sobre una base recién migrada sin datos nuevos.
import { crearBase } from './arnes.mjs'
import fs from 'node:fs'

let fallos = 0, pasos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }
const info = (msg) => console.log('  ·', msg)

const m15 = fs.readFileSync(new URL('../migrations/0015_experiencia_cliente.sql', import.meta.url), 'utf8')
const reversa = fs.readFileSync(process.env.ROLLBACK_SQL ?? new URL('../rollback/0015_rollback.sql', import.meta.url), 'utf8')
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`
const C1 = U(1), C2 = U(2), W1 = U(3), W2 = U(4), W3 = U(5), ADM = U(7)
const manana = new Date(Date.now() + 86400_000).toISOString().slice(0, 10)
const dia = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)
const pasado = dia(2)

const db = await crearBase({ hasta: 14 })
const q = async (sql, params) => (await db.query(sql, params)).rows
async function como(uid, fn, role = 'authenticated') {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid ?? ''}',false), set_config('request.jwt.claim.role','${role}',false)`)
  await db.exec(`set role ${role}`)
  try { return await fn() } finally { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','',false)`) }
}
async function intenta(fn) { try { return { ok: true, v: await fn() } } catch (e) { return { ok: false, e: String(e.message) } } }

await db.exec(`
  insert into auth.users (id, email) values ${[C1, C2, W1, W2, W3, ADM].map((i) => `('${i}','${i}@x.pe')`).join(',')};
  insert into perfiles (id, rol, nombre, telefono, zona, direccion) values
   ('${C1}','cliente','Cliente Uno','911111111','Iquitos','Jr. Lima 1'),
   ('${C2}','cliente','Cliente Dos','911111112','Iquitos','Jr. Lima 2'),
   ('${W1}','trabajador','Pro Uno','922222221','Iquitos','x'),
   ('${W2}','trabajador','Pro Dos','922222222','Iquitos','x'),
   ('${W3}','trabajador','Pro Tres','922222223','Iquitos','x'),
   ('${ADM}','admin','Admin','933333333','Iquitos','x');
  insert into trabajadores (id, numero_documento, zonas, servicios, tarifa_hora, kit_propio, verificado, disponible_ahora, ultima_actividad) values
   ('${W1}','10000001',array['Iquitos'],array['Limpieza básica del hogar'],25,true,true,true,now()),
   ('${W2}','10000002',array['Iquitos'],array['Limpieza básica del hogar'],30,true,true,true,now()),
   ('${W3}','10000003',array['Iquitos'],array['Limpieza básica del hogar'],20,true,true,true,now());
`)

// ---------- Datos ANTERIORES a la 0015 ----------
const L = (n) => `bbbbbbbb-0000-0000-0000-00000000000${n}`
await db.exec(`
  insert into reservas (id, cliente_id, trabajador_id, servicio, fecha, hora, horas, direccion, zona, tarifa_hora, estado, modo, con_materiales, recargo_materiales, pago_metodo) values
   ('${L(1)}','${C1}','${W1}','Limpieza básica del hogar','2026-01-10','09:00',3,'Jr. Vieja 1','Iquitos',25,'completada','directo',false,0,'yape'),
   ('${L(2)}','${C1}','${W2}','Limpieza básica del hogar','2026-02-10','09:00',4,'Jr. Vieja 1','Iquitos',30,'completada','directo',true,18,'plin');
  insert into reservas (id, cliente_id, trabajador_id, servicio, fecha, hora, horas, direccion, zona, tarifa_hora, estado, modo, ventana_cierra_en) values
   ('${L(3)}','${C2}',null,'Limpieza básica del hogar','${manana}','07:00',2,'Jr. Vieja 2','Iquitos',null,'solicitada','abierto', now() + interval '30 minutes');
  update reservas set pago_confirmado = true where id = '${L(1)}';
`)

// ---------- Instantáneas ----------
async function datos() {
  const t = {}
  t.reservas = await q(`select * from reservas order by id`)
  t.propuestas = await q(`select * from propuestas order by id`).catch(() => [])
  t.pagos = await q(`select * from pagos order by id`).catch(() => [])
  t.candidaturas = await q(`select * from candidaturas order by id`)
  t.trabajadores = await q(`select id, tarifa_hora, kit_propio, verificado, servicios, zonas from trabajadores order by id`)
  t.calificaciones = await q(`select * from calificaciones order by id`)
  return t
}
function comparar(a, b, nombre) {
  const difs = []
  for (const tabla of Object.keys(a)) {
    const fa = new Map(a[tabla].map((r) => [r.id, r])), fb = new Map(b[tabla].map((r) => [r.id, r]))
    for (const [id, ra] of fa) {
      const rb = fb.get(id)
      if (!rb) { difs.push(`${tabla}:${id.slice(-4)} desapareció`); continue }
      for (const c of Object.keys(ra)) if (JSON.stringify(ra[c]) !== JSON.stringify(rb[c])) difs.push(`${tabla}:${id.slice(-4)}.${c}: ${JSON.stringify(ra[c])} -> ${JSON.stringify(rb[c])}`)
    }
    for (const id of fb.keys()) if (!fa.has(id)) difs.push(`${tabla}:${id.slice(-4)} apareció`)
  }
  return difs
}
async function permisos() {
  const filas = await q(`
    select 'fn' as k, p.oid::regprocedure::text as n,
           has_function_privilege('anon', p.oid, 'execute') || '/' || has_function_privilege('authenticated', p.oid, 'execute') || '/' ||
           exists(select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0 and x.privilege_type = 'EXECUTE') as v
    from pg_proc p where p.pronamespace = 'public'::regnamespace
    union all
    select 'rel', c.oid::regclass::text,
           (select string_agg(pr || ':' || has_table_privilege('anon', c.oid, pr)::text || '/' || has_table_privilege('authenticated', c.oid, pr)::text, ',' order by pr)
              from unnest(array['SELECT','INSERT','UPDATE','DELETE']) pr) || ' rls=' || c.relrowsecurity::text
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v')
    union all
    select 'pol', tablename || '.' || policyname, cmd || ' ' || md5(coalesce(qual, '') || '|' || coalesce(with_check, ''))
    from pg_policies where schemaname = 'public'`)
  return new Map(filas.map((f) => [`${f.k} ${f.n.replace(/^public./, '')}`, f.v]))
}
const difPermisos = (a, b) => {
  const r = []
  for (const [k, v] of a) { if (!b.has(k)) r.push(`${k}: desapareció`); else if (b.get(k) !== v) r.push(`${k}: ${v} -> ${b.get(k)}`) }
  for (const k of b.keys()) if (!a.has(k)) r.push(`${k}: nuevo (${b.get(k)})`)
  return r
}

console.log('— Estado inicial (0001-0014) y migración 0015')
const permA = await permisos()
const claveFnPush = [...permA.keys()].find((k) => k.startsWith('fn fn_enviar_push('))
info(`antes de la 0015, fn_enviar_push (anon/authenticated/public) = ${permA.get(claveFnPush)}`)
await db.exec(m15)
ok(true, '0015 aplicada sobre datos anteriores')

// Helpers del frontend ANTIGUO (mismas operaciones que ae7a510: Reservar.tsx, MisReservas.tsx, Panel.tsx)
async function insertarAntiguo(uid, extra = {}) {
  const c = { servicio: 'Limpieza básica del hogar', subtipo_servicio: null, descripcion_trabajo: null, foto_referencia_ruta: null, detalles_servicio: null,
    fecha: pasado, hora: '15:00', horas: 3, direccion: 'Jr. Antigua 1', zona: 'Iquitos', notas: null, pago_metodo: 'yape', con_materiales: false, recargo_materiales: 0,
    modo: 'abierto', ventana_cierra_en: new Date(Date.now() + 600_000).toISOString(), ...extra }
  const cols = Object.keys(c), vals = Object.values(c)
  return como(uid, async () => (await db.query(`insert into reservas (cliente_id, ${cols.join(',')}) values ('${uid}', ${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id, total, tarifa_hora, comision_pct, pago_confirmado, estado, ventana_cierra_en`,
    vals.map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v)))).rows[0])
}
const rpc = (uid, sql, params) => como(uid, async () => (await db.query(sql, params)).rows)
const estadoAntiguo = (uid, id, desde, hacia) => como(uid, async () => (await db.query(`update reservas set estado = $1 where id = $2 and estado = $3 returning id`, [hacia, id, desde])).rows.length)
const total = async (id) => (await q(`select total, total_cliente, tarifa_hora from reservas where id = $1`, [id]))[0]

console.log('\n— A. Frontend ANTIGUO contra la base migrada (0015, antes de la reversa)')
let abiertoAntiguo, directoAntiguo
{
  const r = await intenta(() => insertarAntiguo(C1, { con_materiales: true, recargo_materiales: 1, tarifa_hora: 1, total: 1, comision_pct: 0, pago_confirmado: true }))
  ok(r.ok, 'pedido abierto con el payload antiguo (incluye precio/comisión falsos) se inserta: ' + (r.e ?? ''))
  if (r.ok) {
    abiertoAntiguo = r.v.id
    ok(Number(r.v.comision_pct) === 20 && r.v.pago_confirmado === false && r.v.estado === 'solicitada', 'el servidor ignora comisión, pago y estado enviados por el navegador')
    ok(r.v.total === null && r.v.tarifa_hora === null, 'pedido abierto sin precio todavía (total y tarifa vacíos)')
  }
  const p = await intenta(() => rpc(W1, `select postularme_a_reserva($1)`, [abiertoAntiguo]))
  ok(p.ok, 'W1 se postula con la RPC antigua: ' + (p.e ?? ''))
  const e = await intenta(() => rpc(C1, `select elegir_candidata($1, $2)`, [abiertoAntiguo, W1]))
  ok(e.ok, 'la clienta elige a W1 con la RPC antigua (elegir_candidata): ' + (e.e ?? ''))
  const t = await total(abiertoAntiguo)
  // Lo que el panel antiguo suma en Ganancias es `total`.
  ok(t.total !== null && Number(t.total) === 25 * 3 + 18, `total tras elegir = tarifa 25 × 3 h + kit 18 = 93 (real: ${t.total})`)
  ok(Number(t.tarifa_hora) === 25, 'tarifa_hora copiada de la elegida')

  const d = await intenta(() => insertarAntiguo(C1, { modo: 'directo', trabajador_id: W2, tarifa_hora: 1, ventana_cierra_en: new Date(Date.now() + 900_000).toISOString() }))
  ok(d.ok, 'pedido directo con payload antiguo (tarifa falsa) se inserta: ' + (d.e ?? ''))
  if (d.ok) {
    directoAntiguo = d.v.id
    const t2 = await total(directoAntiguo)
    ok(Number(t2.tarifa_hora) === 30 && Number(t2.total) === 90, `directo: tarifa del profesional (30) y total 90 (real: ${t2.tarifa_hora} / ${t2.total})`)
    ok((await estadoAntiguo(W2, directoAntiguo, 'solicitada', 'aceptada')) === 1, 'el profesional acepta con el UPDATE antiguo de estado')
    ok((await estadoAntiguo(W2, directoAntiguo, 'aceptada', 'en_camino')) === 1, 'aceptada -> en_camino')
    ok((await estadoAntiguo(W2, directoAntiguo, 'en_camino', 'en_curso')) === 1, 'en_camino -> en_curso')
    ok((await estadoAntiguo(W2, directoAntiguo, 'en_curso', 'completada')) === 1, 'en_curso -> completada')
    ok(Number((await total(directoAntiguo)).total) === 90, 'el total no cambia al completar (Ganancias lo suma)')
  }
  const lima10 = new Date(Date.now() - 5 * 3600_000 + 10 * 60_000).toISOString()
  const corto = await intenta(() => insertarAntiguo(C2, { fecha: lima10.slice(0, 10), hora: lima10.slice(11, 16) }))
  info('pedido programado con <30 min de margen (frontend antiguo): ' + (corto.ok ? 'se acepta' : 'SE RECHAZA -> ' + corto.e.slice(0, 90)))
}

console.log('\n— Datos NUEVOS creados después de migrar (flujo de la 0015)')
await db.exec(`update app_config set propuestas_activas = true where id = true`)
const nuevaReserva = (uid, extra) => como(uid, async () => {
  const c = { servicio: 'Limpieza básica del hogar', fecha: pasado, hora: '09:00', horas: 4, direccion: 'Jr. X', zona: 'Iquitos', modo: 'abierto', ...extra }
  const cols = Object.keys(c), vals = Object.values(c)
  return (await db.query(`insert into reservas (cliente_id, ${cols.join(',')}) values ('${uid}', ${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id`, vals)).rows[0].id
})
// N1: directo, 2 personas, con kit
const N1 = await nuevaReserva(C1, { modo: 'directo', trabajador_id: W3, personas: 2, con_materiales: true, horas: 3, fecha: dia(3) })
await estadoAntiguo(W3, N1, 'solicitada', 'aceptada')   // el profesional acepta el directo antes de poder pagar
// N2: abierto, dos profesionales proponen, el cliente contrata una
const N2 = await nuevaReserva(C2, { horas: 5, fecha: dia(4), hora: '11:00' })
await rpc(W1, `select postularme_a_reserva($1)`, [N2]); await rpc(W2, `select postularme_a_reserva($1)`, [N2])
const props = await q(`select id, trabajador_id from propuestas where reserva_id = $1`, [N2])
await rpc(C2, `select contratar_propuesta($1)`, [props.find((p) => p.trabajador_id === W2).id])
// N3: abierto aún sin contratar (propuesta ofrecida pendiente)
const N3 = await nuevaReserva(C1, { horas: 2, fecha: dia(5), hora: '13:00' })
await rpc(W3, `select postularme_a_reserva($1)`, [N3])
// Pagos: N1 pagada y confirmada, N2 solo registrada
const pg1 = (await rpc(C1, `select registrar_pago($1, 'yape', 'OP-1', null) as id`, [N1]))[0].id
await rpc(ADM, `select confirmar_pago($1, true, null)`, [pg1])
await rpc(C2, `select registrar_pago($1, 'plin', 'OP-2', null)`, [N2])
const nuevas = await q(`select id, total, total_cliente, personas, comision_pct, recargo_materiales, pago_confirmado, estado from reservas where id in ($1,$2,$3) order by id`, [N1, N2, N3])
const mapa = Object.fromEntries(nuevas.map((r) => [r.id, r]))
ok(mapa[N1].personas === 2 && Number(mapa[N1].total) === 20 * 3 * 2 + 18, `N1: 2 personas × 3 h × 20 + kit 18 = 138 (real: ${mapa[N1].total})`)
ok(mapa[N1].pago_confirmado === true, 'N1: pago confirmado por el admin')
ok(mapa[N2].estado === 'aceptada' && Number(mapa[N2].total) === 30 * 5, `N2: propuesta de W2 contratada, total 150 (real: ${mapa[N2].total})`)
ok((await q(`select count(*)::int n from propuestas where reserva_id = $1 and estado = 'aceptada'`, [N2]))[0].n === 1, 'N2: una propuesta aceptada')
ok(mapa[N3].estado === 'solicitada' && (await q(`select count(*)::int n from propuestas where reserva_id = $1 and estado = 'ofrecida'`, [N3]))[0].n === 1, 'N3: sigue solicitada con una propuesta ofrecida')

// El mecanismo interno legítimo (triggers SECURITY DEFINER, que corren como dueño de la función) debe poder
// enviar aunque ningún rol de la API pueda llamar a fn_enviar_push directamente.
await db.exec(`update app_config set push_function_url = 'http://captura.test/push', push_function_secret = 'secreto-sintetico' where id = true`)
const enviosA = Number((await q(`select count(*)::int n from net.http_log`))[0].n)
await nuevaReserva(C1, { modo: 'directo', trabajador_id: W3, horas: 2, fecha: dia(8), hora: '10:00' })
const enviosB = Number((await q(`select count(*)::int n from net.http_log`))[0].n)
const aW3 = (await q(`select count(*)::int n from net.http_log where body->'user_ids' ? $1`, [W3]))[0].n
ok(enviosB > enviosA && aW3 >= 1, `(0015) un pedido directo genera el aviso interno al profesional por el trigger (envíos: ${enviosA} -> ${enviosB})`)

const antes = await datos()
const permB = await permisos()

console.log('\n— B/C. Aplicar la reversa y comparar valores y permisos')
let aplicada = await intenta(() => db.exec(reversa))
ok(aplicada.ok, 'la reversa se aplica sin error: ' + (aplicada.e ?? ''))
const despues = await datos()
const difs = comparar(antes, despues)
ok(difs.length === 0, difs.length === 0 ? 'todas las filas de reservas, propuestas, pagos, candidaturas, profesionales y calificaciones tienen los MISMOS valores columna por columna' : 'valores cambiados por la reversa:\n      ' + difs.slice(0, 12).join('\n      '))
const permC = await permisos()
const difP = difPermisos(permB, permC)
ok(difP.length === 1 && /fn_total_compat/.test(difP[0]), `permisos antes/después idénticos salvo la función nueva (cerrada): ${JSON.stringify(difP)}`)
ok(permC.get(claveFnPush) === 'false/false/false', `fn_enviar_push: anon/authenticated/public sin permiso tras la reversa (${permC.get(claveFnPush)})`)
info(`(antes de la 0015 era ${permA.get(claveFnPush)}: la reversa NO restaura ese acceso)`)
ok(permC.get('fn postularme_a_reserva(uuid)') === 'false/true/false' && permC.get('fn elegir_candidata(uuid,uuid)') === 'false/true/false', 'postularme_a_reserva y elegir_candidata: solo authenticated')
ok(String((await q(`select propuestas_activas from app_config`))[0].propuestas_activas) === 'false', 'propuestas_activas quedó apagada')

{
  const e0 = Number((await q(`select count(*)::int n from net.http_log`))[0].n)
  const P2 = await nuevaReserva(C1, { modo: 'directo', trabajador_id: W3, horas: 2, fecha: dia(9), hora: '10:00' })
  const e1 = Number((await q(`select count(*)::int n from net.http_log`))[0].n)
  const cuerpo = (await q(`select body from net.http_log order by id desc limit 1`))[0].body
  ok(!!P2 && e1 > e0 && (cuerpo.user_ids ?? []).includes(W3), `(tras la reversa) el trigger restaurado sigue enviando el aviso aunque authenticated/anon no puedan llamar fn_enviar_push (envíos: ${e0} -> ${e1})`)
}

console.log('\n— C. Aislamiento entre usuarios y secretos después de la reversa')
{
  ok(!(await intenta(() => como(C1, () => db.query(`select fn_enviar_push(array['${C1}']::uuid[], 'x', 'y', '/')`)))).ok, 'authenticated no puede llamar fn_enviar_push')
  ok(!(await intenta(() => como(null, () => db.query(`select fn_enviar_push(array['${C1}']::uuid[], 'x', 'y', '/')`), 'anon'))).ok, 'anon no puede llamar fn_enviar_push')
  ok(!(await intenta(() => como(null, () => db.query(`select postularme_a_reserva('${N3}')`), 'anon'))).ok, 'anon no puede postularse')
  ok((await como(C1, async () => (await db.query(`select id from reservas where id = $1`, [N2])).rows)).length === 0, 'un cliente no ve la reserva de otro cliente')
  ok((await como(C1, async () => (await db.query(`select id from pagos where reserva_id = $1`, [N2])).rows)).length === 0, 'un cliente no ve los pagos de otro')
  ok((await como(C1, async () => (await db.query(`select id from propuestas where reserva_id = $1`, [N2])).rows)).length === 0, 'un cliente no ve las propuestas de otro')
  ok((await como(W1, async () => (await db.query(`select id from reservas where id = $1`, [N1])).rows)).length === 0, 'un profesional no ve reservas ajenas')
  ok((await como(null, async () => (await db.query(`select id from reservas`)).rows, 'anon')).length === 0, 'anon no ve reservas')
  ok(!(await intenta(() => como(C1, () => db.query(`update reservas set total = 1 where id = $1`, [N1])))).ok, 'un cliente no puede cambiar el total de su reserva')
  ok(!(await intenta(() => como(C1, () => db.query(`update reservas set tarifa_hora = 1 where id = $1`, [abiertoAntiguo])))).ok, 'un cliente no puede cambiar la tarifa de su reserva')
  ok((await como(C1, async () => (await db.query(`update pagos set estado = 'confirmado' where id = $1 returning id`, [pg1])).rows)).length === 0, 'un cliente no puede editar pagos')
  ok(!(await intenta(() => como(C1, () => db.query(`select confirmar_pago($1, true, null)`, [pg1])))).ok, 'un cliente no puede confirmar pagos')
  ok(!(await intenta(() => como(C1, () => db.query(`update app_config set propuestas_activas = true`)))).ok || (await q(`select propuestas_activas from app_config`))[0].propuestas_activas === false, 'un cliente no puede encender las propuestas')
}

console.log('\n— D. Después de la reversa: frontend antiguo y fórmula antigua que no pisa importes')
{
  const r = await intenta(() => insertarAntiguo(C1, { fecha: dia(6), con_materiales: true, recargo_materiales: 1, tarifa_hora: 1, total: 1, comision_pct: 0, pago_confirmado: true }))
  ok(r.ok && r.v.total === null && Number(r.v.comision_pct) === 20 && r.v.pago_confirmado === false, 'insert abierto antiguo: el servidor sigue fijando comisión/pago y sin precio falso: ' + (r.e ?? ''))
  const id = r.v.id
  await rpc(W1, `select postularme_a_reserva($1)`, [id])
  await rpc(C1, `select elegir_candidata($1, $2)`, [id, W1])
  const t = await total(id)
  ok(Number(t.total) === 25 * 3 + 18 && Number(t.total_cliente) === 93, `elegir_candidata deja total 93 (real: ${t.total} / total_cliente ${t.total_cliente})`)
  const dd = await insertarAntiguo(C1, { modo: 'directo', trabajador_id: W3, tarifa_hora: 1, horas: 2, fecha: pasado, hora: '18:00' })
  const td = await total(dd.id)
  ok(Number(td.tarifa_hora) === 20 && Number(td.total) === 40, `directo antiguo: tarifa 20 (no la falsa) y total 40 (real: ${td.tarifa_hora} / ${td.total})`)
  ok((await estadoAntiguo(W3, dd.id, 'solicitada', 'aceptada')) === 1 && (await estadoAntiguo(W3, dd.id, 'aceptada', 'en_camino')) === 1 && (await estadoAntiguo(W3, dd.id, 'en_camino', 'en_curso')) === 1 && (await estadoAntiguo(W3, dd.id, 'en_curso', 'completada')) === 1, 'ciclo de estados del panel antiguo completo')
  ok((await estadoAntiguo(C1, id, 'aceptada', 'cancelada')) === 1, 'cancelar (cliente) con el UPDATE antiguo')
  ok(Number((await total(dd.id)).total) === 40, 'el total sigue intacto al completar')

  // La fórmula antigua NO debe pisar importes nuevos
  const antesN = await q(`select id, total, total_cliente from reservas where id in ($1,$2) order by id`, [N1, N2])
  await db.exec(`update reservas set tarifa_hora = 99 where id = '${N1}'`)            // N1: 2 personas
  await db.exec(`update reservas set recargo_materiales = 77, horas = 9 where id = '${N2}'`)  // N2: propuesta aceptada
  const despN = await q(`select id, total, total_cliente from reservas where id in ($1,$2) order by id`, [N1, N2])
  ok(JSON.stringify(antesN) === JSON.stringify(despN), 'un cambio de tarifa/horas/recargo (admin) NO recalcula reservas de 2 personas ni con propuesta aceptada')
  // Una reserva del modelo antiguo sí conserva su comportamiento (columna que antes era calculada)
  await db.exec(`update reservas set horas = 5 where id = '${L(2)}'`)
  ok(Number((await total(L(2))).total) === 30 * 5 + 18, 'reserva anterior (modelo antiguo): total sigue la fórmula al cambiar horas (150+18)')
  // Un total fijado por el servidor/admin distinto de la fórmula tampoco se pisa
  await db.exec(`update reservas set total = 555 where id = '${L(1)}'`)
  await db.exec(`update reservas set recargo_materiales = 5 where id = '${L(1)}'`)
  ok(Number((await total(L(1))).total) === 555, 'un total distinto de la fórmula (fijado a mano) no se sobrescribe')
}

console.log('\n— E. Idempotencia y reversa sin datos nuevos')
{
  const e0 = await datos(), pe0 = await permisos()
  const dos = await intenta(() => db.exec(reversa))
  ok(dos.ok, 'segunda ejecución sin error: ' + (dos.e ?? ''))
  ok(comparar(e0, await datos()).length === 0 && difPermisos(pe0, await permisos()).length === 0, 'la segunda ejecución no cambia valores ni permisos')

  const limpia = await crearBase({ hasta: 14 })
  await limpia.exec(m15)
  const r1 = await intenta(() => limpia.exec(reversa))
  ok(r1.ok, 'la reversa aplica sobre una base recién migrada, sin datos nuevos: ' + (r1.e ?? ''))
  const huellaFnPush = (await limpia.query(`select has_function_privilege('authenticated', 'fn_enviar_push(uuid[],text,text,text)', 'execute') as a`)).rows[0].a
  ok(huellaFnPush === false, 'fn_enviar_push cerrada también en ese caso')
}

console.log('\n— Consulta de esquema: schema_migrations ausente no aborta el resto')
{
  const sqlTxt = fs.readFileSync(new URL('./consultas-esquema-solo-lectura.sql', import.meta.url), 'utf8')
  const bloque = sqlTxt.slice(sqlTxt.indexOf('-- 8.'), sqlTxt.indexOf('-- 9.')).replace(/^--.*$/gm, '')
  const sinTabla = await intenta(() => db.query(bloque))
  ok(sinTabla.ok && /NO EXISTE/.test(JSON.stringify(sinTabla.v.rows)), 'sin la tabla: informa "NO EXISTE" y no falla')
  await db.exec(`create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text, name text); insert into supabase_migrations.schema_migrations values ('1','a')`)
  const conTabla = await intenta(() => db.query(bloque))
  ok(conTabla.ok && /<version>1<\/version>/.test(JSON.stringify(conTabla.v.rows)), 'con la tabla: lista versión y nombre')
}

console.log(`\n${pasos - fallos}/${pasos} comprobaciones OK  [SIMULACIÓN PGlite: la reversa sigue PENDIENTE de validación real]`)
process.exit(fallos ? 1 : 0)
