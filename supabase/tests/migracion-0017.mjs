// PRUEBA DE LA MIGRACIÓN 0017 (avisos push por app + cierre de funciones ejecutables por la API) y de su reversa,
// en Postgres real en memoria (PGlite). SIMULACIÓN: no toca ninguna base real. Parte del estado que dejará la 0016 en LIMPIA.
// Uso:  npm i --no-save @electric-sql/pglite  &&  node supabase/tests/migracion-0017.mjs
import { crearBase } from './arnes.mjs'
import fs from 'node:fs'
import crypto from 'node:crypto'

let fallos = 0, pasos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }
const seccion = (t) => console.log(`\n— ${t}`)
const rd = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const A16 = rd('../hotfix/0016a_proteger_rol_perfiles.sql'), B16 = rd('../hotfix/0016b_alta_tecnico_pendiente.sql')
const M16 = rd('../migrations/0016_roles_por_capacidades.sql')
const M17 = rd('../migrations/0017_push_por_app.sql')
const RB17 = rd('../rollback/0017_rollback.sql')

const U = (n) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`
const SOL = '5e7b822a-7d0b-49d6-af17-b9da194f4d67'
const C1 = U(1), C2 = U(2), W1 = U(3), W2 = U(4), NUEVO = U(7)
const dia = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)

const db = await crearBase({ hasta: 15 })
await db.exec(`
  insert into auth.users (id, email) select id, id::text || '@x.pe' from (values ${[C1, C2, W1, W2, NUEVO, SOL].map((i) => `('${i}'::uuid)`).join(',')}) v(id);
  insert into perfiles (id, rol, nombre, telefono, zona, direccion) values
    ('${C1}','cliente','Cliente Uno','911111111','Iquitos','Jr. Lima 1'),('${C2}','cliente','Cliente Dos','911111112','Iquitos','Jr. Lima 2'),
    ('${W1}','trabajador','Pro Uno','922222221','Iquitos','x'),('${W2}','trabajador','Pro Dos','922222222','Iquitos','x'),
    ('${NUEVO}','cliente','Nuevo','911111117','Iquitos','x'),('${SOL}','admin','Solansh','933333331','Iquitos','x');
  insert into trabajadores (id, numero_documento, zonas, servicios, tarifa_hora, kit_propio, verificado, disponible_ahora, ultima_actividad) values
    ('${W1}','10000001',array['Iquitos'],array['Limpieza básica del hogar'],15,true,true,true,now()),
    ('${W2}','10000002',array['Iquitos'],array['Limpieza básica del hogar'],20,true,true,true,now());
`)
await db.exec(A16); await db.exec(B16); await db.exec(M16)   // el estado que dejará la 0016 pegada en LIMPIA
await db.exec(`update app_config set push_function_url='http://push.local/fn', push_function_secret='s'`)
// Suscripciones que YA existen antes de la 0017 (de los usuarios, sin app)
await db.exec(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('${C1}','https://e/1','k','a'),('${W1}','https://e/2','k','a'),('${C1}','https://e/3','k','a')`)

async function como(uid, fn, role = 'authenticated') {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid ?? ''}',false), set_config('request.jwt.claim.role','${role}',false)`)
  await db.exec(`set role ${role}`)
  try { return await fn() } finally { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','',false)`) }
}
const intenta = async (fn) => { try { return { ok: true, v: await fn() } } catch (e) { try { await db.exec('rollback') } catch { /* nada */ } return { ok: false, e: String(e.message) } } }
const q = async (sql, params) => (await db.query(sql, params)).rows
const sinCR = (s) => (s ?? '').replace(/\r/g, '')
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex')
const avisos = async (desde = 0) => q(`select id, body from net.http_log where id > ${desde} order by id`)
const ultimoId = async () => Number((await q(`select coalesce(max(id),0) m from net.http_log`))[0].m)
const nuevaReserva = async (uid, extra = {}) => {
  const c = { servicio: 'Limpieza básica del hogar', fecha: dia(3), hora: '09:00', horas: 4, direccion: 'Jr. X', zona: 'Iquitos', modo: 'abierto', ...extra }
  const cols = Object.keys(c), vals = Object.values(c)
  return como(uid, async () => (await db.query(`insert into reservas (cliente_id, ${cols.join(',')}) values ('${uid}', ${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id`, vals)).rows[0].id)
}
const CALLERS = ['confirmar_pago', 'enviar_propuesta', 'fn_notificar_pedido_abierto', 'fn_push_candidaturas_insert', 'fn_push_candidaturas_update', 'fn_push_reservas_insert',
  'fn_push_reservas_update', 'fn_push_trabajadores_insert', 'fn_push_trabajadores_update', 'responder_propuesta']
const snapFun = async () => new Map((await q(`select proname k, prosrc from pg_proc where pronamespace='public'::regnamespace`)).map((r) => [r.k, sinCR(r.prosrc)]))
const funAntes = await snapFun()
const EJECUTABLES = `select p.proname n from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and (has_function_privilege('anon', p.oid,'execute') or has_function_privilege('authenticated', p.oid,'execute')) order by 1`
const permitidasApp = ['confirmar_pago', 'contratar_propuesta', 'elegir_candidata', 'emitir_prestamo_kit', 'enviar_propuesta', 'es_admin', 'es_profesional', 'es_profesional_habilitado', 'postularme_a_reserva',
  'puede_ver_foto_referencia', 'registrar_pago', 'reintentar_solicitud', 'responder_propuesta', 'trabajador_disponible_en']

seccion('ANTES de la 0017 (demuestra el problema)')
{
  const base = await ultimoId()
  await nuevaReserva(C1, { modo: 'directo', trabajador_id: W1 })
  const a = (await avisos(base))[0]
  ok(a && a.body.app === undefined, 'el aviso "Nuevo pedido directo" sale SIN app: la Edge Function lo manda a todas las suscripciones de la persona')
}

seccion('Aplicación (dos veces: debe ser idempotente)')
await db.exec(M17); await db.exec(M17)
ok(true, 'la 0017 se aplica dos veces sin error')

seccion('Columna app y CHECK')
{
  ok((await q(`select count(*)::int n from push_subscriptions where app is null`))[0].n === 3, 'las 3 suscripciones que ya existían quedan en NULL (no se migran a ningún valor)')
  ok((await intenta(() => como(C1, () => db.exec(`insert into push_subscriptions (user_id, endpoint, p256dh, auth, app) values ('${C1}','https://e/c','k','a','cliente')`)))).ok, 'la app Cliente guarda su suscripción con app = cliente')
  ok((await intenta(() => como(W1, () => db.exec(`insert into push_subscriptions (user_id, endpoint, p256dh, auth, app) values ('${W1}','https://e/p','k','a','profesional')`)))).ok, 'la app Profesional guarda la suya con app = profesional')
  const mala = await intenta(() => como(C1, () => db.exec(`insert into push_subscriptions (user_id, endpoint, p256dh, auth, app) values ('${C1}','https://e/x','k','a','otra')`)))
  ok(!mala.ok && /check/i.test(mala.e), 'un valor de app inválido se rechaza con el CHECK')
  ok((await intenta(() => como(C1, () => db.exec(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('${C1}','https://e/nula','k','a')`)))).ok, 'app es nulable (el CHECK permite NULL)')
  const up = await intenta(() => como(C1, () => db.exec(`update push_subscriptions set app = 'cliente' where endpoint = 'https://e/1'`)))
  ok(up.ok, 'una suscripción vieja puede reclamarse al reactivar las notificaciones (update de app por su dueño)')
  await db.exec(`update push_subscriptions set app = null where endpoint = 'https://e/1'`)
  const ajeno = await intenta(() => como(C2, () => db.exec(`update push_subscriptions set app = 'profesional' where endpoint = 'https://e/2'`)))
  ok((await q(`select app from push_subscriptions where endpoint = 'https://e/2'`))[0].app === null, 'otra persona no puede cambiar la app de una suscripción ajena')
  const cfg = await intenta(() => db.exec(`update app_config set url_app_cliente = 'http://yavi.test'`))
  ok(!cfg.ok, 'app_config.url_app_*: solo https (http se rechaza)')
  ok(!(await intenta(() => db.exec(`update app_config set url_app_profesional = 'https://pro.yavi.test/'`))).ok, '…y sin barra final')
}

seccion('Cada aviso llega a su app (según el disparador)')
const esperados = []   // [título, app]
{
  await db.exec(`update app_config set url_app_cliente = 'https://yavi.test', url_app_profesional = 'https://pro.yavi.test', url_app_admin = 'https://admin.yavi.test'`)
  const por = async (titulo, app, fn) => {
    const base = await ultimoId(); await fn()
    const r = (await avisos(base)).filter((a) => a.body.titulo === titulo)
    ok(r.length >= 1 && r.every((a) => a.body.app === app), `«${titulo}» -> ${app}${r[0] ? ` (${r[0].body.url})` : ' (no salió ningún aviso)'}`)
    esperados.push([titulo, app]); return r
  }
  // Pedido directo: nuevo -> profesional; aceptado, empezó, finalizado -> cliente
  let dir
  await por('Nuevo pedido directo', 'profesional', async () => { dir = await nuevaReserva(C1, { modo: 'directo', trabajador_id: W1 }) })
  await por('Pedido directo aceptado', 'cliente', () => como(W1, () => db.exec(`update reservas set estado = 'aceptada' where id = '${dir}'`)))
  await por('Cambió la dirección', 'profesional', () => como(C1, () => db.exec(`update reservas set direccion = 'Otra calle' where id = '${dir}'`)))
  await como(W1, () => db.exec(`update reservas set estado = 'en_camino' where id = '${dir}'`))
  await por('Tu servicio empezó', 'cliente', () => como(W1, () => db.exec(`update reservas set estado = 'en_curso' where id = '${dir}'`)))
  await por('Servicio finalizado', 'cliente', () => como(W1, () => db.exec(`update reservas set estado = 'completada' where id = '${dir}'`)))
  const dir2 = await nuevaReserva(C1, { modo: 'directo', trabajador_id: W1, fecha: dia(6) })
  await por('Pedido directo rechazado', 'cliente', () => como(W1, () => db.exec(`update reservas set estado = 'rechazada' where id = '${dir2}'`)))
  const dir3 = await nuevaReserva(C1, { modo: 'directo', trabajador_id: W1, fecha: dia(7) })
  await como(W1, () => db.exec(`update reservas set estado = 'aceptada' where id = '${dir3}'`))
  await por('La clienta canceló', 'profesional', () => como(C1, () => db.exec(`update reservas set estado = 'cancelada' where id = '${dir3}'`)))
  // Pedido abierto: pedido cercano -> profesional; postulación -> cliente; elegida -> profesional
  let ab
  await por('Pedido cerca de ti', 'profesional', async () => { ab = await nuevaReserva(C2, { fecha: dia(9) }) })
  await por('Nueva postulación', 'cliente', () => como(W2, () => db.exec(`select postularme_a_reserva('${ab}')`)))
  await por('¡Te eligieron!', 'profesional', () => como(C2, () => db.exec(`select elegir_candidata('${ab}','${W2}')`)))
  // Alta de profesional -> admin
  const a1 = await por('Nueva trabajadora pendiente', 'admin', () => como(NUEVO, () => db.exec(`insert into trabajadores (id, numero_documento, zonas, servicios, tarifa_hora) values ('${NUEVO}','12345678',array['Iquitos'],array['Limpieza básica del hogar'],15)`)))
  ok(a1[0]?.body.user_ids.includes(SOL), 'el aviso de verificación va a los admins de la tabla admins')
}

seccion('Enlaces con el dominio de cada app')
{
  const todos = await q(`select body from net.http_log where body ? 'app'`)
  const porApp = (app) => todos.filter((t) => t.body.app === app)
  ok(porApp('cliente').length > 0 && porApp('cliente').every((t) => t.body.url.startsWith('https://yavi.test/')), 'avisos del cliente: enlace con https://yavi.test')
  ok(porApp('profesional').length > 0 && porApp('profesional').every((t) => t.body.url.startsWith('https://pro.yavi.test/')), 'avisos del profesional: enlace con https://pro.yavi.test')
  ok(porApp('admin').length > 0 && porApp('admin').every((t) => t.body.url.startsWith('https://admin.yavi.test/')), 'avisos del admin: enlace con https://admin.yavi.test')
  await db.exec(`update app_config set url_app_cliente = null`)
  const base = await ultimoId()
  await db.exec(`select fn_enviar_push(array['${C1}']::uuid[], 'T', 'C', '/reservas', 'cliente')`)
  ok((await avisos(base))[0]?.body.url === '/reservas', 'sin dominio configurado, el aviso lleva la ruta relativa (como hasta ahora)')
}

seccion('Sin app destino válida no se envía nada')
{
  const base = await ultimoId()
  await db.exec(`select fn_enviar_push(array['${C1}']::uuid[], 'T', 'C', '/reservas', null)`)
  await db.exec(`select fn_enviar_push(array['${C1}']::uuid[], 'T', 'C', '/reservas', 'todas')`)
  await db.exec(`select fn_enviar_push(array['${C1}']::uuid[], 'T', 'C', '/reservas', '')`)
  ok((await avisos(base)).length === 0, 'app nula, desconocida o vacía: no sale ningún aviso (nunca "a todas las apps")')
}

seccion('Cierre de funciones ejecutables por la API')
{
  const ej = (await q(EJECUTABLES)).map((r) => r.n)
  ok(JSON.stringify(ej) === JSON.stringify([...permitidasApp].sort()), `la API solo ejecuta las ${permitidasApp.length} funciones que usa la app o las políticas`)
  for (const f of ["fn_enviar_push(array['" + C1 + "']::uuid[],'a','b','/c','cliente')", "fn_aviso('" + C1 + "','a','b','/c','cliente')"]) {
    ok(!(await intenta(() => como(C1, () => db.exec(`select ${f}`)))).ok, `un usuario autenticado NO puede llamar ${f.split('(')[0]}`)
    ok(!(await intenta(() => como(null, () => db.exec(`select ${f}`), 'anon'))).ok, `anon tampoco puede llamar ${f.split('(')[0]}`)
  }
  ok(!(await q(`select has_function_privilege('authenticated', 'public.fn_oficio_en_texto(text)', 'execute') a`))[0].a, 'fn_oficio_en_texto sigue cerrada')
  const dep = await q(`select count(*)::int n from pg_depend d join pg_proc p on p.oid = d.refobjid where d.refclassid = 'pg_proc'::regclass and p.pronamespace = 'public'::regnamespace
    and d.classid in ('pg_policy'::regclass, 'pg_attrdef'::regclass, 'pg_constraint'::regclass) and not has_function_privilege('authenticated', p.oid, 'execute')`)
  ok(dep[0].n === 0, 'ninguna política, valor por defecto ni CHECK depende de una función cerrada')
}

seccion('La app sigue funcionando para cliente y profesional (flujo completo con la API)')
{
  const id = await nuevaReserva(C1, { fecha: dia(12) })
  ok(!!id, 'el cliente crea un pedido abierto')
  ok((await intenta(() => como(W1, () => db.exec(`select postularme_a_reserva('${id}')`)))).ok, 'el profesional se postula (RPC permitida)')
  ok((await intenta(() => como(C1, () => db.exec(`select trabajador_disponible_en('${W1}','${dia(13)}','09:00',2)`)))).ok, 'trabajador_disponible_en sigue disponible para la app')
}

seccion('Regresión — la suite de la 0015 sobre la base con 0016 y 0017')
let avisosRegresion = []
{
  let src = rd('./migracion-0015.mjs')
  const gancho = "console.log('✓ 0015 es idempotente (segunda ejecución)')"
  if (!src.includes(gancho)) ok(false, 'no se encontró el gancho para la regresión')
  else {
    const lee = (f) => `fs.readFileSync(new URL('${f}', import.meta.url), 'utf8')`
    src = src.replace(gancho, `${gancho}; await db.exec(${lee('../hotfix/0016a_proteger_rol_perfiles.sql')}); await db.exec(${lee('../hotfix/0016b_alta_tecnico_pendiente.sql')}); await db.exec(${lee('../migrations/0016_roles_por_capacidades.sql')}); await db.exec("insert into admins select id from perfiles where rol = 'admin'"); await db.exec(${lee('../migrations/0017_push_por_app.sql')}); console.log('✓ 0016 y 0017 aplicadas sobre ese escenario')`)
    // las llamadas directas de esa suite usan la firma anterior (4 argumentos): pasan a la nueva (5)
    src = src.split(`'a','b','c')"`).join(`'a','b','c','cliente')"`)
    src = src.replace("'Titulo','Cuerpo','/x')`", "'Titulo','Cuerpo','/x','cliente')`")
    src = src.replace('console.log(`\\n${pasos - fallos}/${pasos} verificaciones OK`)', "console.log('AVISOS:' + JSON.stringify((await db.query(`select body->>'titulo' t, body->>'app' a, count(*)::int n from net.http_log group by 1,2 order by 1`)).rows)); console.log(`\\n${pasos - fallos}/${pasos} verificaciones OK`)")
    const tmp = new URL('./.tmp-regresion-0015b.mjs', import.meta.url)
    fs.writeFileSync(tmp, src)
    const { spawnSync } = await import('node:child_process')
    const r = spawnSync(process.execPath, [tmp.pathname.replace(/^\/([A-Za-z]:)/, '$1')], { encoding: 'utf8', maxBuffer: 50_000_000 })
    fs.unlinkSync(tmp)
    const out = (r.stdout ?? '') + (r.stderr ?? '')
    const buenas = (out.match(/^\s+✓/gm) ?? []).length, malas = out.split('\n').filter((l) => /^\s+✗/.test(l))
    ok(/0016 y 0017 aplicadas sobre ese escenario/.test(out), 'la 0016 y la 0017 se aplican sobre el escenario de la 0015')
    ok(malas.length === 0 && buenas > 100, `${buenas} comprobaciones de la 0015 pasan con la 0017 aplicada, ${malas.length} fallan`)
    for (const l of malas) console.log('      ', l.trim())
    if (malas.length === 0 && buenas < 100) console.log(out.split('\n').slice(-12).join('\n'))
    const linea = out.split('\n').find((l) => l.startsWith('AVISOS:'))
    avisosRegresion = linea ? JSON.parse(linea.slice(7)) : []
  }
}
{
  const MAPA = { 'Nuevo pedido directo': 'profesional', 'Pedido directo aceptado': 'cliente', 'Pedido directo rechazado': 'cliente', 'La clienta canceló': 'profesional', 'Tu servicio empezó': 'cliente', 'Servicio finalizado': 'cliente',
    'Cambió la dirección': 'profesional', 'Pedido cerca de ti': 'profesional', 'Nueva postulación': 'cliente', '¡Te eligieron!': 'profesional', 'Tienes una propuesta': 'cliente', 'Aceptaron tu propuesta': 'profesional',
    'Rechazaron tu propuesta': 'profesional', 'Pago confirmado': 'cliente', 'No pudimos confirmar tu pago': 'cliente', 'Nueva trabajadora pendiente': 'admin', 'Verificación migratoria pendiente': 'admin' }
  ok(avisosRegresion.length > 8, `la regresión generó avisos de ${avisosRegresion.length} tipos distintos`)
  const mal = avisosRegresion.filter((x) => x.t in MAPA && x.a !== MAPA[x.t])
  ok(mal.length === 0, 'en la regresión, todo aviso conocido llegó a la app que le corresponde' + (mal.length ? ': ' + JSON.stringify(mal) : ''))
  const sinApp = avisosRegresion.filter((x) => !x.a)
  ok(sinApp.length === 0, 'ningún aviso salió sin app destino' + (sinApp.length ? ': ' + JSON.stringify(sinApp) : ''))
  for (const t of ['Tienes una propuesta', 'Aceptaron tu propuesta', 'Pago confirmado']) ok(avisosRegresion.some((x) => x.t === t), `la regresión pasó por «${t}» (propuestas y pagos)`)
}

seccion('Reversa')
{
  await db.exec(RB17); await db.exec(RB17)
  ok(true, 'la reversa se aplica dos veces sin error')
  const sig = await q(`select proname, pronargs from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_enviar_push','fn_aviso')`)
  ok(sig.length === 2 && sig.every((s) => s.pronargs === 4), 'vuelven las firmas de 4 argumentos')
  const f = await snapFun()
  const dif = CALLERS.filter((n) => md5(f.get(n)) !== md5(funAntes.get(n)))
  ok(dif.length === 0, 'las 10 funciones que avisan quedan idénticas al estado anterior' + (dif.length ? ': ' + dif.join(', ') : ''))
  ok(md5(f.get('fn_enviar_push')) === md5(funAntes.get('fn_enviar_push')) && md5(f.get('fn_aviso')) === md5(funAntes.get('fn_aviso')), 'fn_enviar_push y fn_aviso quedan idénticas al estado anterior')
  ok((await q(`select count(*)::int n from push_subscriptions where app is not null`))[0].n >= 2, 'conserva la columna app y sus datos')
  const ej = (await q(`select p.proname n from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('fn_enviar_push','fn_aviso') and (has_function_privilege('anon', p.oid,'execute') or has_function_privilege('authenticated', p.oid,'execute'))`))
  ok(ej.length === 0, 'fn_enviar_push y fn_aviso siguen cerradas a la API tras la reversa')
  const base = await ultimoId()
  await nuevaReserva(C1, { modo: 'directo', trabajador_id: W1, fecha: dia(15) })
  ok((await avisos(base))[0]?.body.app === undefined, 'tras la reversa los avisos vuelven a salir sin app (Edge Function anterior)')
  await db.exec(M17)
  ok(true, 'y la 0017 se puede volver a aplicar después de la reversa')
}

console.log(fallos ? `\n${fallos} de ${pasos} comprobaciones FALLARON` : `\nTodo bien: ${pasos} comprobaciones`)
process.exit(fallos ? 1 : 0)
