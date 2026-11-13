// PRUEBA DE LA MIGRACIÓN 0016 (roles por capacidades) y de su reversa, en Postgres real en memoria (PGlite).
// SIMULACIÓN: no toca ninguna base real. Parte del estado que dejarán los parches en LIMPIA: 0001-0015 + 0016a + 0016b.
// Uso:  npm i --no-save @electric-sql/pglite  &&  node supabase/tests/migracion-0016.mjs
import { crearBase } from './arnes.mjs'
import fs from 'node:fs'
import crypto from 'node:crypto'

let fallos = 0, pasos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }
const seccion = (t) => console.log(`\n— ${t}`)
const rd = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const A16 = rd('../hotfix/0016a_proteger_rol_perfiles.sql'), B16 = rd('../hotfix/0016b_alta_tecnico_pendiente.sql')
const M16 = rd('../migrations/0016_roles_por_capacidades.sql')
const RB = rd('../rollback/0016_rollback.sql')
const BORRAR = rd('../hotfix/0016_borrar_admin_prueba.sql')

const U = (n) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`
const SOL = '5e7b822a-7d0b-49d6-af17-b9da194f4d67'      // Solansh (admin que se migra)
const DEMO = '6531e276-48a4-4da0-a9d6-e52fbe51d1a1'     // admin.demo (admin que se migra; en las pruebas también es profesional)
const PRUEBA = '2a8a649d-7ec5-4c33-8e13-9e4414bb15aa'   // admin@prueba (NO se migra)
const C1 = U(1), C2 = U(2), W1 = U(3), W2 = U(4), WN = U(5), WE = U(6), NUEVO = U(7), NUEVA_EXT = U(8)
const dia = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)

const db = await crearBase({ hasta: 15 })
await db.exec(`
  insert into auth.users (id, email) select id, id::text || '@x.pe' from (values ${[C1, C2, W1, W2, WN, WE, NUEVO, NUEVA_EXT, SOL, DEMO, PRUEBA].map((i) => `('${i}'::uuid)`).join(',')}) v(id);
  insert into perfiles (id, rol, nombre, telefono, zona, direccion) values
    ('${C1}','cliente','Cliente Uno','911111111','Iquitos','Jr. Lima 1'),('${C2}','cliente','Cliente Dos','911111112','Iquitos','Jr. Lima 2'),
    ('${W1}','trabajador','Pro Uno','922222221','Iquitos','x'),('${W2}','trabajador','Pro Dos','922222222','Iquitos','x'),
    ('${WN}','trabajador','Pro Pendiente','922222223','Iquitos','x'),('${WE}','trabajador','Pro Extranjera','922222224','Iquitos','x'),
    ('${NUEVO}','cliente','Nuevo','911111117','Iquitos','x'),('${NUEVA_EXT}','cliente','Nueva Ext','911111118','Iquitos','x'),
    ('${SOL}','admin','Solansh','933333331','Iquitos','x'),('${DEMO}','admin','Admin Demo','933333332','Iquitos','x'),('${PRUEBA}','admin','Admin Prueba','933333333','Iquitos','x');
  insert into trabajadores (id, numero_documento, zonas, servicios, tarifa_hora, kit_propio, verificado, disponible_ahora, ultima_actividad) values
    ('${W1}','10000001',array['Iquitos'],array['Limpieza básica del hogar','Electricidad'],15,true,true,true,now()),
    ('${W2}','10000002',array['Iquitos'],array['Limpieza básica del hogar','Electricidad'],20,true,true,true,now()),
    ('${DEMO}','10000009',array['Iquitos'],array['Limpieza básica del hogar'],25,true,true,true,now());
  insert into trabajadores (id, numero_documento, zonas, servicios, tarifa_hora, kit_propio, verificado) values
    ('${WN}','10000003',array['Iquitos'],array['Limpieza básica del hogar','Electricidad'],15,true,false);
  insert into trabajadores (id, nacionalidad, tipo_documento, numero_documento, zonas, servicios, tarifa_hora, kit_propio, verificado, estado_migratorio) values
    ('${WE}','extranjera','carne_extranjeria','20000004',array['Iquitos'],array['Limpieza básica del hogar'],15,true,false,'pendiente_validacion');
`)
await db.exec(A16); await db.exec(B16)   // lo que habrás pegado antes
await db.exec(`grant select on storage.objects to anon, authenticated; insert into storage.objects (bucket_id, name) values ('documentos', '${C1}/dni.png')`)

async function como(uid, fn, role = 'authenticated') {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid ?? ''}',false), set_config('request.jwt.claim.role','${role}',false)`)
  await db.exec(`set role ${role}`)
  try { return await fn() } finally { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','',false)`) }
}
const intenta = async (fn) => { try { return { ok: true, v: await fn() } } catch (e) { try { await db.exec('rollback') } catch { /* sin transacción abierta */ } return { ok: false, e: String(e.message) } } }
const q = async (sql, params) => (await db.query(sql, params)).rows
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex')
const sinCR = (s) => (s ?? '').replace(/\r/g, '')

async function nuevaReserva(uid, extra = {}) {
  const c = { servicio: 'Limpieza básica del hogar', fecha: dia(3), hora: '09:00', horas: 4, direccion: 'Jr. X', zona: 'Iquitos', modo: 'abierto', ...extra }
  const cols = Object.keys(c), vals = Object.values(c)
  return como(uid, async () => (await db.query(`insert into reservas (cliente_id, ${cols.join(',')}) values ('${uid}', ${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id`, vals)).rows[0].id)
}
const reservaSuper = async (cli, pro, estado, fecha) => (await q(`insert into reservas (cliente_id, trabajador_id, servicio, fecha, hora, horas, direccion, zona, tarifa_hora, estado, modo)
  values ('${cli}','${pro}','Limpieza básica del hogar','${fecha}','09:00',2,'Jr. X','Iquitos',15,'${estado}','directo') returning id`))[0].id
const fila = async (id) => (await q(`select * from trabajadores where id = '${id}'`))[0]

// ---------- Instantánea del estado ANTERIOR (0015 + 0016a + 0016b) ----------
const snapPol = async () => new Map((await q(`select schemaname || '.' || tablename || '.' || policyname k, cmd, roles::text r, coalesce(qual,'') qual, coalesce(with_check,'') wc from pg_policies where schemaname in ('public','storage')`)).map((r) => [r.k, r]))
const snapFun = async () => new Map((await q(`select proname k, prosrc from pg_proc where pronamespace='public'::regnamespace`)).map((r) => [r.k, sinCR(r.prosrc)]))
const polAntes = await snapPol(), funAntes = await snapFun()

seccion('ANTES de la 0016 (demuestra lo que hoy no funciona)')
{
  const r = await intenta(() => como(W1, () => db.exec(`insert into reservas (cliente_id, servicio, fecha, hora, horas, direccion, zona, modo) values ('${W1}','Limpieza básica del hogar','${dia(5)}','09:00',2,'x','Iquitos','abierto')`)))
  ok(!r.ok, 'un profesional NO puede pedir un servicio (res_insert exige rol cliente)')
  const rid = await reservaSuper(C1, W1, 'completada', dia(-20))
  await como(C1, () => db.exec(`insert into calificaciones (reserva_id, de_id, para_id, estrellas) values ('${rid}','${C1}','${W1}',5)`))
  ok(Number((await fila(W1)).rating_n) === 0, 'J: el cliente califica 5★ y rating_n del técnico NO sube (RLS deja 0 filas sin avisar)')
  const rEn = await reservaSuper(C1, W1, 'en_curso', dia(-19))
  const c = await intenta(() => como(W1, () => db.exec(`update reservas set estado = 'completada' where id = '${rEn}'`)))
  ok(c.ok && Number((await fila(W1)).trabajos_completados) === 1, 'J: al completar el propio técnico, trabajos_completados sí sube (es su fila)')
  await db.exec(`update trabajadores set rating_n = 0, rating_avg = 0, trabajos_completados = 0 where id = '${W1}'`)
  await db.exec(`delete from calificaciones; delete from reservas`)
  const e = await intenta(() => como(W1, () => db.exec(`update trabajadores set rating_avg = 5, rating_n = 99, trabajos_completados = 99 where id = '${W1}'`)))
  ok(e.ok && Number((await fila(W1)).trabajos_completados) === 99, 'I: el dueño puede inventarse su reputación con un UPDATE')
  await db.exec(`update trabajadores set rating_n = 0, rating_avg = 0, trabajos_completados = 0 where id = '${W1}'`)
  const a = await intenta(() => como(NUEVO, () => db.exec(`insert into trabajadores (id, nacionalidad, tipo_documento, numero_documento, zonas, servicios, tarifa_hora, estado_migratorio)
    values ('${NUEVO}','extranjera','carne_extranjeria','30000007',array['Iquitos'],array['Electricidad'],30,'no_aplica')`)))
  ok(a.ok && (await fila(NUEVO)).estado_migratorio === 'no_aplica', 'K: una extranjera puede declarar su estatus migratorio como quiera al darse de alta')
  await db.exec(`delete from trabajadores where id = '${NUEVO}'`)
}

seccion('Se aplica la 0016 (dos veces: idempotente)')
const a1 = await intenta(() => db.exec(M16))
ok(a1.ok, 'la 0016 se aplica sin error' + (a1.e ? ': ' + a1.e.slice(0, 300) : ''))
if (!a1.ok) process.exit(1)
const a2 = await intenta(() => db.exec(M16))
ok(a2.ok, 'la 0016 se puede aplicar otra vez sin error (idempotente)' + (a2.e ? ': ' + a2.e.slice(0, 300) : ''))

seccion('L — Admins iniciales')
{
  const ids = (await q(`select user_id from admins order by 1`)).map((r) => r.user_id)
  ok(ids.length === 2 && ids.includes(SOL) && ids.includes(DEMO), 'admins contiene exactamente a Solansh y admin.demo')
  ok(!ids.includes(PRUEBA), 'admin@prueba NO se migra')
  await intenta(() => como(PRUEBA, () => db.exec(`update trabajadores set verificado = true where id = '${WN}'`)))
  ok((await fila(WN)).verificado === false, 'con rol=admin pero sin estar en admins ya no puede verificar a nadie (RLS: ni ve la fila)')
  ok(Number((await como(PRUEBA, () => q(`select count(*)::int n from trabajadores`)))[0].n) === 0, 'ni leer los datos de los técnicos (RLS)')
  ok((await como(DEMO, () => q(`select es_admin() a, es_profesional() p, es_profesional_habilitado() h`)))[0].a === true, 'admin.demo: es_admin() = true')
  ok((await como(C1, () => q(`select es_admin() a, es_profesional() p`)))[0].a === false, 'un cliente: es_admin() = false')
}

seccion('1 — Admin + técnico + cliente a la vez; tabla admins invisible para la API')
{
  const p = (await como(DEMO, () => q(`select es_admin() a, es_profesional() p, es_profesional_habilitado() h`)))[0]
  ok(p.a && p.p && p.h, 'admin.demo es admin, profesional y profesional habilitado al mismo tiempo')
  const rid = await nuevaReserva(DEMO)
  ok(!!rid, 'y puede pedir un servicio como cliente')
  const ve = Number((await como(DEMO, () => q(`select count(*)::int n from reservas`)))[0].n)
  ok(ve >= 1, 'y como admin ve las reservas')
  const ajena = await nuevaReserva(C1)
  const w = await intenta(() => como(DEMO, () => db.exec(`select postularme_a_reserva('${ajena}')`)))
  ok(w.ok, 'y como profesional puede postularse al pedido de otro cliente' + (w.e ? ': ' + w.e : ''))
  for (const [rol, uid] of [['authenticated', C1], ['anon', null]]) {
    const s = await intenta(() => como(uid, () => db.exec(`select * from admins`), rol))
    ok(!s.ok && /permission denied/.test(s.e), `${rol} no puede leer admins`)
    const i = await intenta(() => como(uid, () => db.exec(`insert into admins (user_id) values ('${C1}')`), rol))
    ok(!i.ok, `${rol} no puede insertarse en admins`)
  }
  const u = await intenta(() => como(C1, () => db.exec(`update perfiles set rol = 'admin' where id = '${C1}'`)))
  ok(!u.ok && /rol no se puede cambiar/.test(u.e), 'ningún cliente se hace admin cambiando perfiles.rol')
  const d = await intenta(() => como(DEMO, () => db.exec(`insert into admins (user_id) values ('${C1}')`)))
  ok(!d.ok, 'ni siquiera un admin agrega admins por la API (solo el SQL Editor)')
  await db.exec(`insert into admins (user_id) values ('${C1}') on conflict do nothing`)
  ok((await como(C1, () => q(`select es_admin() a`)))[0].a === true, 'el SQL Editor sí puede nombrar un admin')
  await db.exec(`delete from admins where user_id = '${C1}'`)
  ok((await como(C1, () => q(`select es_admin() a`)))[0].a === false, 'y quitarlo')
}

seccion('4 — Nadie se contrata a sí mismo')
{
  const aOtro = await intenta(() => nuevaReserva(W1, { modo: 'directo', trabajador_id: W2, ventana_cierra_en: new Date(Date.now() + 15 * 60000).toISOString() }))
  ok(aOtro.ok, 'un técnico pide a otro técnico: PASA' + (aOtro.e ? ': ' + aOtro.e.slice(0, 200) : ''))
  const aSi = await intenta(() => nuevaReserva(W1, { modo: 'directo', trabajador_id: W1, fecha: dia(6), ventana_cierra_en: new Date(Date.now() + 15 * 60000).toISOString() }))
  ok(!aSi.ok && /reservas_no_autocontratacion/.test(aSi.e), 'un técnico se pide a sí mismo: FALLA (constraint)')
  const puro = await intenta(() => nuevaReserva(C1, { fecha: dia(7) }))
  ok(puro.ok, 'un cliente puro pide: PASA')
  const idPropio = await nuevaReserva(W1, { fecha: dia(8) })
  const p = await intenta(() => como(W1, () => db.exec(`select postularme_a_reserva('${idPropio}')`)))
  ok(!p.ok && /tu propio pedido/.test(p.e), 'un técnico no puede postularse a su propio pedido abierto')
  const u = await intenta(() => como(W1, () => db.exec(`update reservas set trabajador_id = '${W1}' where id = '${idPropio}'`)))
  ok(!u.ok, 'ni asignarse a sí mismo con un UPDATE')
  const c = await q(`select count(*)::int n from candidaturas where reserva_id = '${idPropio}'`)
  ok(c[0].n === 0, 'sin candidatura propia')
}

seccion('C — Solo un técnico verificado (habilitado) puede postularse, proponer o fijar precios')
{
  const abierta = await nuevaReserva(C2, { fecha: dia(10) })
  const n1 = await intenta(() => como(WN, () => db.exec(`select postularme_a_reserva('${abierta}')`)))
  ok(!n1.ok && /habilitado/.test(n1.e), 'técnico no verificado: no puede postularse')
  const n2 = await intenta(() => como(WN, () => db.exec(`select enviar_propuesta('${abierta}','servicio',50,0,0,0,'x','{}','{}','{}',24)`)))
  ok(!n2.ok && /habilitado/.test(n2.e), 'técnico no verificado: no puede enviar propuestas')
  const n3 = await intenta(() => como(WN, () => db.exec(`insert into precios_profesional (trabajador_id, servicio, modalidad, monto, alcance) values ('${WN}','Electricidad','fijo',40,'x')`)))
  ok(!n3.ok && /row-level security/.test(n3.e), 'técnico no verificado: no puede fijar precios (RLS)')
  const n4 = await intenta(() => como(C1, () => db.exec(`select postularme_a_reserva('${abierta}')`)))
  ok(!n4.ok && /Solo un profesional/.test(n4.e), 'un cliente puro tampoco puede postularse')
  const v1 = await intenta(() => como(W1, () => db.exec(`select postularme_a_reserva('${abierta}')`)))
  ok(v1.ok, 'técnico verificado: SÍ puede postularse' + (v1.e ? ': ' + v1.e : ''))
  const v3 = await intenta(() => como(W1, () => db.exec(`insert into precios_profesional (trabajador_id, servicio, modalidad, monto, alcance) values ('${W1}','Electricidad','fijo',40,'Cambio de tomacorriente')`)))
  ok(v3.ok, 'técnico verificado: SÍ puede fijar precios' + (v3.e ? ': ' + v3.e : ''))
}

seccion('D / K — Alta del técnico por la API')
{
  const alta = (id, cols, vals) => intenta(() => como(id, () => db.exec(`insert into trabajadores (id, ${cols}) values ('${id}', ${vals})`)))
  const r = await alta(NUEVO, 'nacionalidad, numero_documento, zonas, servicios, tarifa_hora, verificado, habilitado_trabajar, verificacion_rechazada, motivo_rechazo, verificado_por, verificado_en, estado_migratorio, rating_avg, rating_n, trabajos_completados',
    `'peruana','30000007',array['Iquitos'],array['Electricidad'],30,true,true,true,'x','${SOL}',now(),'validado',5,50,99`)
  const f = await fila(NUEVO)
  ok(r.ok && f.verificado === false && f.habilitado_trabajar === false, 'D: insertarse como verificado/habilitado falla: nace pendiente')
  ok(f.verificacion_rechazada === false && f.motivo_rechazo === null && f.verificado_por === null && f.verificado_en === null, 'D: sin campos de verificación heredados (ni auditoría falsa)')
  ok(f.estado_migratorio === 'no_aplica', "K: peruana que manda 'validado' queda en 'no_aplica'")
  ok(Number(f.rating_n) === 0 && Number(f.trabajos_completados) === 0 && Number(f.rating_avg) === 0, 'reputación en cero')
  const e1 = await alta(NUEVA_EXT, 'nacionalidad, tipo_documento, numero_documento, zonas, servicios, tarifa_hora, estado_migratorio', `'extranjera','carne_extranjeria','30000008',array['Iquitos'],array['Electricidad'],30,'no_aplica'`)
  ok(e1.ok && (await fila(NUEVA_EXT)).estado_migratorio === 'pendiente_validacion', "K: extranjera que manda 'no_aplica' queda en 'pendiente_validacion'")
  await db.exec(`delete from trabajadores where id in ('${NUEVO}','${NUEVA_EXT}')`)
  const e2 = await alta(NUEVA_EXT, 'nacionalidad, tipo_documento, numero_documento, zonas, servicios, tarifa_hora, estado_migratorio', `'extranjera','carne_extranjeria','30000008',array['Iquitos'],array['Electricidad'],30,'validado'`)
  ok(e2.ok && (await fila(NUEVA_EXT)).estado_migratorio === 'pendiente_validacion', "K: extranjera que manda 'validado' queda en 'pendiente_validacion'")
  await db.exec(`delete from trabajadores where id = '${NUEVA_EXT}'`)
  const n = await alta(NUEVO, 'nacionalidad, numero_documento, zonas, servicios, tarifa_hora, experiencia, kit_propio, referencia1_nombre, antecedentes', `'peruana','30000007',array['Iquitos','Punchana'],array['Electricidad','Gasfitería'],45.5,'5 años',true,'Ana','vigente'`)
  const g = await fila(NUEVO)
  ok(n.ok && g.numero_documento === '30000007' && Number(g.tarifa_hora) === 45.5 && g.kit_propio === true && g.experiencia === '5 años' && g.referencia1_nombre === 'Ana' && g.antecedentes === 'vigente' && g.zonas.length === 2,
    'el alta normal conserva todos los datos declarados')
  const o = await intenta(() => como(C1, () => db.exec(`insert into trabajadores (id, numero_documento, zonas, servicios, tarifa_hora) values ('${C2}','30000099',array['Iquitos'],array['Electricidad'],30)`)))
  ok(!o.ok && /row-level security/.test(o.e), 'D: nadie puede darse de alta con el id de otra persona')
  await db.exec(`delete from trabajadores where id = '${NUEVO}'`)
}

seccion('K — Un admin no puede dejar habilitada a una extranjera sin estatus migratorio validado')
{
  const noAdmin = await intenta(() => como(WE, () => db.exec(`update trabajadores set estado_migratorio = 'validado' where id = '${WE}'`)))
  ok(!noAdmin.ok && /Solo un administrador/.test(noAdmin.e), 'la propia extranjera no puede validarse')
  const naC = await intenta(() => como(WE, () => db.exec(`update trabajadores set nacionalidad = 'peruana' where id = '${WE}'`)))
  ok(!naC.ok, 'ni declararse peruana después')
  await como(DEMO, () => db.exec(`update trabajadores set verificado = true where id = '${WE}'`))
  let f = await fila(WE)
  ok(f.verificado === true && f.habilitado_trabajar === false, 'el admin la verifica pero con estatus pendiente sigue SIN habilitar')
  await como(DEMO, () => db.exec(`update trabajadores set habilitado_trabajar = true where id = '${WE}'`))
  ok((await fila(WE)).habilitado_trabajar === false, 'y no se puede forzar habilitado_trabajar a mano: se recalcula')
  await como(DEMO, () => db.exec(`update trabajadores set estado_migratorio = 'validado' where id = '${WE}'`))
  f = await fila(WE)
  ok(f.habilitado_trabajar === true, 'con el estatus validado por el admin, queda habilitada')
}

seccion('H — Auditoría de la verificación')
{
  let f = await fila(WE)
  ok(f.verificado_por === DEMO && f.verificado_en !== null, 'quedó registrado QUÉ admin tomó la decisión y CUÁNDO')
  await como(DEMO, () => db.exec(`update trabajadores set verificado = true where id = '${WN}'`))
  f = await fila(WN)
  ok(f.verificado === true && f.verificado_por === DEMO && f.habilitado_trabajar === true, 'verificar a otro técnico lo registra también')
  const antes = (await fila(WN)).verificado_en
  const fake = await intenta(() => como(WN, () => db.exec(`update trabajadores set verificado_por = '${SOL}', verificado_en = '2020-01-01' where id = '${WN}'`)))
  f = await fila(WN)
  ok(fake.ok && f.verificado_por === DEMO && String(f.verificado_en) === String(antes), 'el técnico NO puede editar verificado_por / verificado_en (se ignoran)')
  await como(WN, () => db.exec(`update trabajadores set descripcion = 'hola' where id = '${WN}'`))
  f = await fila(WN)
  ok(f.verificado_por === DEMO && String(f.verificado_en) === String(antes), 'una edición ajena a la verificación no altera la auditoría')
  await como(DEMO, () => db.exec(`update trabajadores set verificacion_rechazada = true, motivo_rechazo = 'documento ilegible' where id = '${WN}'`))
  f = await fila(WN)
  ok(f.verificacion_rechazada === true && f.verificado_por === DEMO && new Date(f.verificado_en) >= new Date(antes), 'un rechazo también deja rastro')
  const spe = await intenta(() => como(WN, () => db.exec(`update trabajadores set verificado = false where id = '${WN}'`)))
  ok(!spe.ok && /Solo un administrador/.test(spe.e), 'y un técnico sigue sin poder cambiar su propia verificación')
  const spe2 = await intenta(() => como(WE, () => db.exec(`update trabajadores set verificacion_rechazada = true where id = '${WE}'`)))
  ok(!spe2.ok && /Solo un administrador/.test(spe2.e), 'ni su propio rechazo')
  // Rama defensiva (decisión fuera de la API): hoy fn_trabajador_guardas la bloquea también en el SQL Editor, así que se prueba con ese guard apagado
  await db.exec(`alter table trabajadores disable trigger trg_trabajador_guardas`)
  await db.exec(`update trabajadores set verificado_por = null, verificado_en = null where id = '${W2}'`)
  await db.exec(`update trabajadores set verificado = false where id = '${W2}'`)
  f = await fila(W2)
  ok(f.verificado_por === null && f.verificado_en !== null, 'una decisión fuera de la API deja la hora y verificado_por vacío (rama defensiva)')
  await db.exec(`update trabajadores set verificado = true where id = '${W2}'`)
  await db.exec(`alter table trabajadores enable trigger trg_trabajador_guardas`)
}

seccion('I / J — Reputación: solo la escriben los triggers')
{
  const e = await intenta(() => como(W1, () => db.exec(`update trabajadores set rating_avg = 5, rating_n = 99, trabajos_completados = 99 where id = '${W1}'`)))
  const f = await fila(W1)
  ok(e.ok && Number(f.rating_n) === 0 && Number(f.trabajos_completados) === 0 && Number(f.rating_avg) === 0, 'I: el UPDATE del dueño no cambia su reputación')
  const u = await intenta(() => como(W1, () => db.exec(`insert into trabajadores (id, numero_documento, zonas, servicios, tarifa_hora, rating_avg, rating_n, trabajos_completados)
    values ('${W1}','10000001',array['Iquitos'],array['Electricidad'],15,5,99,99) on conflict (id) do update set rating_avg = excluded.rating_avg, rating_n = excluded.rating_n, trabajos_completados = excluded.trabajos_completados`)))
  const g = await fila(W1)
  ok(u.ok && Number(g.rating_n) === 0 && Number(g.trabajos_completados) === 0, 'I: ni con un upsert')
  await db.exec(`update trabajadores set rating_n = 7 where id = '${W2}'`)
  ok(Number((await fila(W2)).rating_n) === 7, 'el SQL Editor sí puede corregirla a mano (cuentas demo)')
  await db.exec(`update trabajadores set rating_n = 0 where id = '${W2}'`)

  const rid = await reservaSuper(C1, W1, 'completada', dia(-30))
  await como(C1, () => db.exec(`insert into calificaciones (reserva_id, de_id, para_id, estrellas) values ('${rid}','${C1}','${W1}',5)`))
  let h = await fila(W1)
  ok(Number(h.rating_n) === 1 && Number(h.rating_avg) === 5, 'J: el cliente califica 5★ y SÍ sube rating_n / rating_avg del técnico')
  const rid2 = await reservaSuper(C2, W1, 'completada', dia(-29))
  await como(C2, () => db.exec(`insert into calificaciones (reserva_id, de_id, para_id, estrellas) values ('${rid2}','${C2}','${W1}',3)`))
  h = await fila(W1)
  ok(Number(h.rating_n) === 2 && Number(h.rating_avg) === 4, 'J: el promedio se recalcula (5 y 3 = 4)')
  const rEn = await reservaSuper(C1, W1, 'en_curso', dia(-28))
  await como(W1, () => db.exec(`update reservas set estado = 'completada' where id = '${rEn}'`))
  ok(Number((await fila(W1)).trabajos_completados) === 1, 'J: al completarse la reserva sube trabajos_completados (y la protección no lo revierte)')
  // reputación separada: lo recibido COMO CLIENTE no cuenta para la reputación como profesional
  const rid3 = await reservaSuper(DEMO, W1, 'completada', dia(-27))
  await como(W1, () => db.exec(`insert into calificaciones (reserva_id, de_id, para_id, estrellas) values ('${rid3}','${W1}','${DEMO}',1)`))
  ok(Number((await fila(DEMO)).rating_n) === 0, 'la técnica admin.demo, calificada con 1★ como CLIENTE, no ve bajar su reputación de profesional')
  const rid4 = await reservaSuper(C1, DEMO, 'completada', dia(-26))
  await como(C1, () => db.exec(`insert into calificaciones (reserva_id, de_id, para_id, estrellas) values ('${rid4}','${C1}','${DEMO}',4)`))
  ok(Number((await fila(DEMO)).rating_n) === 1 && Number((await fila(DEMO)).rating_avg) === 4, 'y sí cuenta lo recibido como profesional')
}

seccion('E — Funciones: search_path fijo y sin acceso de la API a lo interno')
{
  const sinPath = await q(`select proname from pg_proc p where pronamespace='public'::regnamespace and prosecdef and not exists (select 1 from unnest(coalesce(proconfig,'{}')) c where c like 'search_path=%')`)
  ok(sinPath.length === 0, 'toda función SECURITY DEFINER tiene search_path fijo' + (sinPath.length ? ': ' + sinPath.map((x) => x.proname).join(',') : ''))
  const api = await q(`select proname from pg_proc p where pronamespace='public'::regnamespace and prorettype='pg_catalog.trigger'::regtype and (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute'))`)
  ok(api.length === 0, 'ninguna función de trigger es ejecutable por la API')
  const t = await intenta(() => como(C1, () => db.exec(`select fn_proteger_reserva()`)))
  ok(!t.ok && /permission denied/.test(t.e), 'y llamarla directamente da permission denied')
  const o = await intenta(() => como(C1, () => db.exec(`select fn_oficio_en_texto('hola')`)))
  ok(!o.ok && /permission denied/.test(o.e), 'fn_oficio_en_texto tampoco')
  const m = await intenta(() => como(C1, () => db.exec(`select mi_rol()`)))
  ok(!m.ok && /permission denied/.test(m.e), 'mi_rol() ya no es ejecutable por la API')
  const k = await intenta(() => como(null, () => db.exec(`select emitir_prestamo_kit('${W1}', 100, 'x')`), 'anon'))
  ok(!k.ok && /permission denied/.test(k.e), 'emitir_prestamo_kit no es ejecutable por anon')
  const rpc = await intenta(() => como(null, () => db.exec(`select trabajador_disponible_en('${W1}', '${dia(40)}', '09:00', 2)`), 'anon'))
  ok(rpc.ok, 'la RPC pública trabajador_disponible_en sigue funcionando para anon' + (rpc.e ? ': ' + rpc.e : ''))
  const soDueno = await intenta(() => como(C1, () => q(`select count(*)::int n from storage.objects`)))
  const soOtro = await intenta(() => como(C2, () => q(`select count(*)::int n from storage.objects`)))
  const soAdmin = await intenta(() => como(DEMO, () => q(`select count(*)::int n from storage.objects`)))
  ok(soDueno.ok && soDueno.v[0].n === 1, 'Storage: el dueño ve su documento' + (soDueno.e ? ': ' + soDueno.e : ''))
  ok(soOtro.ok && soOtro.v[0].n === 0, 'Storage: otro cliente NO lo ve (las políticas se evalúan sin permission denied)' + (soOtro.e ? ': ' + soOtro.e : ''))
  ok(soAdmin.ok && soAdmin.v[0].n === 1, 'Storage: un admin (es_admin) sí lo ve' + (soAdmin.e ? ': ' + soAdmin.e : ''))
  const ra = await intenta(() => como(DEMO, () => db.exec(`select count(*) from app_config`)))
  ok(ra.ok, 'un admin lee app_config')
  const rc = await intenta(() => como(C1, () => db.exec(`select count(*) from app_config`)))
  ok(rc.ok && Number((await como(C1, () => q(`select count(*)::int n from app_config`)))[0].n) === 0, 'un cliente no ve app_config')
}

seccion('B — Nada se pierde: solo cambian las comprobaciones de rol')
{
  const polDesp = await snapPol()
  const norm = (s) => s.replace(/\s+/g, ' ').trim()
  const tx = (s) => norm(s).split("(mi_rol() = 'admin'::rol)").join('es_admin()')
  const esperadas = new Set(['public.precios_profesional.precios_insert', 'public.reservas.res_insert', 'public.perfiles.perfiles_update'])
  const faltan = [...polAntes.keys()].filter((k) => !polDesp.has(k)), sobran = [...polDesp.keys()].filter((k) => !polAntes.has(k))
  ok(faltan.length === 0 && sobran.length === 0, `mismo conjunto de políticas (${polDesp.size})` + (faltan.length || sobran.length ? ` faltan=${faltan} sobran=${sobran}` : ''))
  const malas = []
  for (const [k, a] of polAntes) {
    const d = polDesp.get(k); if (!d || esperadas.has(k)) continue
    if (a.cmd !== d.cmd || a.r !== d.r || tx(a.qual) !== norm(d.qual) || tx(a.wc) !== norm(d.wc)) malas.push(k)
  }
  ok(malas.length === 0, 'cada política es la de antes con mi_rol()=\'admin\' → es_admin()' + (malas.length ? ': ' + malas.join(', ') : ''))
  const pi = polDesp.get('public.precios_profesional.precios_insert'), ri = polDesp.get('public.reservas.res_insert'), pu = polDesp.get('public.perfiles.perfiles_update')
  ok(norm(pi.wc) === '((auth.uid() = trabajador_id) AND es_profesional_habilitado())', 'precios_insert exige profesional habilitado')
  ok(norm(ri.wc) === '(auth.uid() = cliente_id)', 'res_insert ya no exige rol cliente')
  ok(norm(pu.wc) === '((auth.uid() = id) OR es_admin())' && norm(pu.qual) === '((auth.uid() = id) OR es_admin())', 'perfiles_update gana WITH CHECK')

  const funDesp = await snapFun()
  const cambian = ['confirmar_pago', 'emitir_prestamo_kit', 'enviar_propuesta', 'fn_preparar_reserva_nueva', 'fn_proteger_detalles_servicio', 'fn_proteger_economia', 'fn_proteger_reserva',
    'fn_push_trabajadores_insert', 'fn_push_trabajadores_update', 'fn_trabajador_guardas', 'postularme_a_reserva', 'puede_ver_foto_referencia', 'fn_recalc_rating', 'fn_reserva_completada', 'fn_trabajador_alta_pendiente']
  const nuevas = ['es_admin', 'es_profesional', 'es_profesional_habilitado', 'fn_trabajador_verificacion_y_reputacion']
  const igual = [...funAntes.keys()].filter((k) => !cambian.includes(k)), distintas = igual.filter((k) => funAntes.get(k) !== funDesp.get(k))
  ok(distintas.length === 0, `las otras ${igual.length} funciones quedan con el MISMO cuerpo` + (distintas.length ? ': ' + distintas.join(',') : ''))
  ok(nuevas.every((n) => funDesp.has(n) && !funAntes.has(n)), 'las funciones nuevas son solo: ' + nuevas.join(', '))
  const lineas = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean)
  const resumen = []
  for (const n of cambian.filter((c) => !['fn_recalc_rating', 'fn_reserva_completada', 'fn_trabajador_alta_pendiente'].includes(c))) {
    const a = lineas(funAntes.get(n)), d = lineas(funDesp.get(n)), cuenta = new Map()
    for (const l of a) cuenta.set(l, (cuenta.get(l) ?? 0) + 1)
    const nuevasL = d.filter((l) => { const c = cuenta.get(l) ?? 0; if (c > 0) { cuenta.set(l, c - 1); return false } return true })
    resumen.push(`${n}: ${nuevasL.length}`)
    ok(nuevasL.length <= 4, `${n} cambia ${nuevasL.length} línea(s) (solo la comprobación del rol${n === 'postularme_a_reserva' ? ' + el bloqueo de autopostulación' : ''})`)
  }
}

seccion('Regresión — la suite de la 0015 sobre la base ya migrada')
{
  let src = rd('./migracion-0015.mjs')
  const gancho = "console.log('✓ 0015 es idempotente (segunda ejecución)')"
  if (!src.includes(gancho)) { ok(false, 'no se encontró el gancho para la regresión'); }
  else {
    src = src.replace("} catch (e) { console.log('✗ 0015 no es idempotente:'", "} catch (e) { console.log('✗ 0015 no es idempotente:'")
    // tras la segunda ejecución de la 0015: parches + 0016, y los admins del escenario pasan a la tabla admins (equivale a nombrarlos en el SQL Editor)
    src = src.replace(/(console\.log\('✓ 0015 es idempotente \(segunda ejecución\)'\))/, "$1; await db.exec(fs.readFileSync(new URL('../hotfix/0016a_proteger_rol_perfiles.sql', import.meta.url), 'utf8')); await db.exec(fs.readFileSync(new URL('../hotfix/0016b_alta_tecnico_pendiente.sql', import.meta.url), 'utf8')); await db.exec(fs.readFileSync(new URL('../migrations/0016_roles_por_capacidades.sql', import.meta.url), 'utf8')); await db.exec(\"insert into admins select id from perfiles where rol = 'admin'\"); console.log('✓ 0016 aplicada sobre ese escenario')")
    const tmp = new URL('./.tmp-regresion-0015.mjs', import.meta.url)
    fs.writeFileSync(tmp, src)
    const { spawnSync } = await import('node:child_process')
    const r = spawnSync(process.execPath, [tmp.pathname.replace(/^\/([A-Za-z]:)/, '$1')], { encoding: 'utf8', maxBuffer: 50_000_000 })
    fs.unlinkSync(tmp)
    const out = (r.stdout ?? '') + (r.stderr ?? '')
    const buenas = (out.match(/^\s+✓/gm) ?? []).length, malas = out.split('\n').filter((l) => /^\s+✗/.test(l))
    ok(/0016 aplicada sobre ese escenario/.test(out), 'la 0016 se aplica sobre el escenario de la 0015')
    ok(malas.length === 0 && buenas > 100, `${buenas} comprobaciones de la 0015 pasan con la 0016 aplicada, ${malas.length} fallan`)
    for (const l of malas) console.log('      ', l.trim())
    if (/Error|Cannot|at file:/.test(out) && malas.length === 0 && buenas < 100) console.log(out.split('\n').slice(-12).join('\n'))
  }
}

seccion('Eliminación de admin@prueba — comprobación previa')
{
  const dbBorrar = async (f) => intenta(() => db.exec(f))
  const otroCorreo = await dbBorrar(BORRAR)
  ok(!otroCorreo.ok && /no corresponde a admin@prueba/.test(otroCorreo.e), 'si el id no tiene el correo admin@prueba.limpi.test, se NIEGA (protege contra un id equivocado)')
  await db.exec(`update auth.users set email = 'admin@prueba.limpi.test' where id = '${PRUEBA}'`)
  // Con una dependencia: se niega y NO borra nada
  await db.exec(`insert into reservas (cliente_id, servicio, fecha, hora, horas, direccion, zona, modo) values ('${PRUEBA}','Limpieza básica del hogar','${dia(20)}','09:00',2,'x','Iquitos','abierto')`)
  const r1 = await dbBorrar(BORRAR)
  ok(!r1.ok && /no se borra|dependen/i.test(r1.e), 'con una reserva a su nombre, el script se NIEGA a borrar')
  ok((await q(`select count(*)::int n from perfiles where id = '${PRUEBA}'`))[0].n === 1 && (await q(`select count(*)::int n from auth.users where id = '${PRUEBA}'`))[0].n === 1, 'y no borra nada')
  await db.exec(`delete from reservas where cliente_id = '${PRUEBA}'`)
  const r2 = await dbBorrar(BORRAR)
  ok(r2.ok, 'sin dependencias, la borra' + (r2.e ? ': ' + r2.e.slice(0, 250) : ''))
  ok((await q(`select count(*)::int n from perfiles where id = '${PRUEBA}'`))[0].n === 0 && (await q(`select count(*)::int n from auth.users where id = '${PRUEBA}'`))[0].n === 0, 'de perfiles y de auth.users')
  const r3 = await dbBorrar(BORRAR)
  ok(r3.ok, 'y volver a ejecutarlo no falla (ya no existe)')
  ok((await q(`select count(*)::int n from admins where user_id in ('${SOL}','${DEMO}')`))[0].n === 2, 'los admins migrados siguen intactos')
}

seccion('F — Reversa')
{
  const polPost = await snapPol()
  const rb = await intenta(() => db.exec(RB))
  ok(rb.ok, 'el script de reversa se ejecuta sin error' + (rb.e ? ': ' + rb.e.slice(0, 300) : ''))
  const polRb = await snapPol(), funRb = await snapFun()
  const dpol = [...polAntes.keys()].filter((k) => { const a = polAntes.get(k), b = polRb.get(k); return !b || a.cmd !== b.cmd || a.r !== b.r || a.qual.replace(/\s+/g, ' ') !== b.qual.replace(/\s+/g, ' ') || a.wc.replace(/\s+/g, ' ') !== b.wc.replace(/\s+/g, ' ') })
  ok(dpol.length === 0 && polRb.size === polAntes.size, 'todas las políticas vuelven a ser exactamente las de antes' + (dpol.length ? ': ' + dpol.join(', ') : ''))
  const dfun = [...funAntes.keys()].filter((k) => funAntes.get(k) !== funRb.get(k))
  ok(dfun.length === 0, 'todas las funciones previas vuelven a tener exactamente su cuerpo de antes' + (dfun.length ? ': ' + dfun.join(', ') : ''))
  ok(!funRb.has('es_admin') && !funRb.has('es_profesional') && !funRb.has('fn_trabajador_verificacion_y_reputacion'), 'desaparecen es_admin, es_profesional* y el trigger de auditoría/reputación')
  ok((await q(`select to_regclass('public.admins') t`))[0].t === null, 'desaparece la tabla admins')
  const ch = await q(`select count(*)::int n from pg_constraint where conname = 'reservas_no_autocontratacion'`)
  ok(ch[0].n === 0, 'desaparece el CHECK de autocontratación')
  ok((await q(`select rol from perfiles where id = '${SOL}'`))[0].rol === 'admin' && (await q(`select rol from perfiles where id = '${DEMO}'`))[0].rol === 'admin', 'los admins migrados recuperan rol=admin (siguen pudiendo administrar)')
  const v = await intenta(() => como(DEMO, () => db.exec(`update trabajadores set verificado = true where id = '${WE}'`)))
  ok(v.ok, 'y con la reversa un admin vuelve a poder verificar (por mi_rol)')
  const jf = await intenta(() => como(C1, () => db.exec(`select mi_rol()`)))
  ok(jf.ok, 'mi_rol() vuelve a ser ejecutable por la API')
  ok(Number((await q(`select count(*)::int n from pg_attribute where attrelid='public.trabajadores'::regclass and attname in ('verificado_por','verificado_en') and not attisdropped`))[0].n) === 2, 'las columnas de auditoría se conservan (datos; se pueden borrar a mano)')
  const m2 = await intenta(() => db.exec(M16))
  ok(m2.ok, 'tras la reversa se puede volver a aplicar la 0016' + (m2.e ? ': ' + m2.e.slice(0, 250) : ''))
}

console.log(fallos ? `\n${fallos} de ${pasos} comprobaciones FALLARON` : `\nTodo bien: ${pasos} comprobaciones`)
process.exit(fallos ? 1 : 0)
