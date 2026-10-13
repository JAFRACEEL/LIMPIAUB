// Ver arnes.mjs para el modo de uso.
// COMPROBACIONES SQL contra Postgres real en memoria (PGlite): sirven para las reglas de la base
// (triggers, funciones, RLS, permisos). NO son una prueba de integración con Supabase real
// (GoTrue, PostgREST, Realtime, Storage): para eso ver docs/experiencia-cliente.md.
import { crearBase } from './arnes.mjs'
import fs from 'node:fs'

let fallos = 0, pasos = 0
function ok(cond, msg) { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }

const db = await crearBase({ hasta: 14 })
const mig = fs.readFileSync(new URL('../migrations/0015_experiencia_cliente.sql', import.meta.url), 'utf8')

const U = (n) => `00000000-0000-0000-0000-00000000000${n}`
const C1 = U(1), C2 = U(2), W1 = U(3), W2 = U(4), W3 = U(5), W4 = U(6), ADM = U(7), W5 = U(8)
const manana = new Date(Date.now() + 86400_000).toISOString().slice(0, 10)

await db.exec(`
  insert into auth.users (id, email) values ${[C1, C2, W1, W2, W3, W4, ADM, W5].map((i) => `('${i}','${i}@x.pe')`).join(',')};
  insert into perfiles (id, rol, nombre, telefono, zona, direccion) values
   ('${C1}','cliente','Cliente Uno','911111111','Iquitos','Jr. Lima 1'),
   ('${C2}','cliente','Cliente Dos','911111112','Iquitos','Jr. Lima 2'),
   ('${W1}','trabajador','Pro Uno','922222221','Iquitos','x'),
   ('${W2}','trabajador','Pro Dos','922222222','Iquitos','x'),
   ('${W3}','trabajador','Pro Tres','922222223','Iquitos','x'),
   ('${W4}','trabajador','Pro Cuatro','922222224','Iquitos','x'),
   ('${W5}','trabajador','Pro Cinco','922222225','Iquitos','x'),
   ('${ADM}','admin','Admin','933333333','Iquitos','x');
  insert into trabajadores (id, numero_documento, zonas, servicios, tarifa_hora, kit_propio, verificado, disponible_ahora, ultima_actividad) values
   ('${W1}','10000001',array['Iquitos'],array['Limpieza básica del hogar','Electricidad','Mantenimiento y reparaciones generales'],15,true,true,true,now()),
   ('${W2}','10000002',array['Iquitos'],array['Limpieza básica del hogar','Electricidad','Mantenimiento y reparaciones generales'],20,true,true,false,now()),
   ('${W3}','10000003',array['Iquitos'],array['Limpieza básica del hogar'],25,false,true,true,now()),
   ('${W4}','10000004',array['Iquitos'],array['Limpieza básica del hogar'],30,true,true,true,now()),
   ('${W5}','10000005',array['Belén'],array['Gasfitería'],18,false,true,true,now());
`)
await db.exec(`update trabajadores set disponible_ahora=false where id='${W2}'`)

// ---------- Reservas ANTERIORES a la migración (formato 0001-0014) ----------
const L = (n) => `bbbbbbbb-0000-0000-0000-00000000000${n}`
await db.exec(`
  insert into reservas (id, cliente_id, trabajador_id, servicio, fecha, hora, horas, direccion, zona, tarifa_hora, estado, modo, con_materiales, recargo_materiales, pago_metodo) values
   ('${L(1)}','${C1}','${W3}','Limpieza básica del hogar','2026-01-10','09:00',3,'Jr. Vieja 1','Iquitos',25,'completada','directo',false,0,'yape'),
   ('${L(2)}','${C1}','${W4}','Limpieza básica del hogar','2026-02-10','09:00',4,'Jr. Vieja 1','Iquitos',30,'completada','directo',true,18,'plin');
  insert into reservas (id, cliente_id, trabajador_id, servicio, fecha, hora, horas, direccion, zona, tarifa_hora, estado, modo, ventana_cierra_en) values
   ('${L(3)}','${C2}',null,'Limpieza básica del hogar','${manana}','07:00',2,'Jr. Vieja 2','Iquitos',null,'solicitada','abierto', now() + interval '30 minutes');
  insert into candidaturas (reserva_id, trabajador_id) values ('${L(3)}','${W3}');
`)
const antes = (await db.query(`select id, total, estado from reservas where id in ('${L(1)}','${L(2)}') order by id`)).rows

try { await db.exec(mig); console.log('✓ 0015 aplica sobre 0001-0014 con reservas anteriores') } catch (e) { console.log('✗ 0015 falló:', String(e.message).slice(0, 500)); process.exit(1) }
try { await db.exec(mig); console.log('✓ 0015 es idempotente (segunda ejecución)') } catch (e) { console.log('✗ 0015 no es idempotente:', String(e.message).slice(0, 500)); process.exit(1) }

async function como(uid, fn, role = 'authenticated') {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false), set_config('request.jwt.claim.role','${role}',false)`)
  await db.exec(`set role ${role}`)
  try { return await fn() } finally { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','',false)`) }
}
async function intenta(fn) { try { return { ok: true, v: await fn() } } catch (e) { return { ok: false, e: String(e.message) } } }
const q = async (sql, params) => (await db.query(sql, params)).rows
const pushes = async () => Number((await q(`select count(*)::int as n from net.http_log`))[0].n)
const pushesA = async (id) => Number((await q(`select count(*)::int as n from net.http_log where body->'user_ids' ? $1`, [id]))[0].n)

async function nuevaReserva(uid, extra = {}) {
  const c = { servicio: 'Limpieza básica del hogar', fecha: manana, hora: '09:00', horas: 4, direccion: 'Jr. X', zona: 'Iquitos', modo: 'abierto', ...extra }
  const cols = Object.keys(c), vals = Object.values(c)
  return como(uid, async () => {
    const r = await db.query(`insert into reservas (cliente_id, ${cols.join(',')}) values ('${uid}', ${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id`, vals.map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v)))
    return r.rows[0].id
  })
}
const flag = (v) => db.exec(`update app_config set propuestas_activas = ${v}`)

console.log('\n— Reservas anteriores conservan sus valores')
{
  const despues = (await q(`select id, total, total_cliente, estado, modalidad_precio, personas, programacion from reservas where id in ('${L(1)}','${L(2)}') order by id`))
  ok(despues.length === 2 && despues.every((d, i) => Number(d.total) === Number(antes[i].total) && d.estado === antes[i].estado), `total y estado intactos (${despues.map((d) => d.total)})`)
  ok(despues.every((d) => Number(d.total_cliente) === Number(d.total)), 'total_cliente = total en las anteriores')
  ok(despues.every((d) => d.modalidad_precio === 'horas' && d.personas === 1 && d.programacion === 'programada'), 'quedan como por horas, 1 persona, programada')
  ok(Number(despues[1].total) === 30 * 4 + 18, 'el kit anterior (S/18) sigue sumado en el total')
  const [col] = await q(`select attgenerated from pg_attribute where attrelid='public.reservas'::regclass and attname='total'`)
  ok(col.attgenerated === '', '`total` ya no es columna generada')
}

console.log('\n— Reserva abierta ANTERIOR con una postulación sin propuesta: se contrata igual')
{
  const sinOferta = await q(`select count(*)::int as n from propuestas where reserva_id='${L(3)}'`)
  ok(sinOferta[0].n === 0, 'la postulación anterior no tiene propuesta')
  const r = await intenta(() => como(C2, () => db.exec(`select elegir_candidata('${L(3)}','${W3}')`)))
  ok(r.ok, 'elegir_candidata arma la oferta con las reglas de siempre y contrata: ' + (r.e ?? ''))
  const [res] = await q(`select estado, trabajador_id, tarifa_hora, total, total_cliente from reservas where id='${L(3)}'`)
  ok(res.estado === 'aceptada' && res.trabajador_id === W3 && Number(res.total) === 50, `asignada con tarifa 25 × 2 h = 50 (total ${res.total})`)
  const p = await intenta(() => como(C2, async () => (await db.query(`select registrar_pago($1,'efectivo',null,null) as id`, [L(3)])).rows[0].id))
  ok(p.ok, 'se puede registrar el pago de una reserva anterior: ' + (p.e ?? ''))
  const [pg] = await q(`select monto, estado from pagos where id=$1`, [p.v])
  ok(Number(pg.monto) === 50 && pg.estado === 'pendiente_verificacion', 'por el total (50) y pendiente de verificación')
}

console.log('\n— El servidor valida modalidades y propuestas activas (VITE_PROPUESTAS_ACTIVAS no manda)')
{
  const [v] = await q(`select propuestas_activas from app_config`)
  ok(v.propuestas_activas === false, 'las propuestas arrancan DESACTIVADAS en el servidor')
  const e1 = await intenta(() => nuevaReserva(C1, { servicio: 'Electricidad', modalidad_precio: 'horas' }))
  ok(!e1.ok && /no está disponible para este servicio/.test(e1.e), 'Electricidad por horas se rechaza (no se sustituye por horas): ' + (e1.e ?? '').slice(0, 60))
  const e2 = await intenta(() => nuevaReserva(C1, { servicio: 'Electricidad', modalidad_precio: 'diagnostico' }))
  ok(!e2.ok && /todavía no está disponible/.test(e2.e), 'Electricidad por diagnóstico se rechaza con propuestas apagadas: ' + (e2.e ?? '').slice(0, 60))
  const e3 = await intenta(() => nuevaReserva(C1, { modalidad_precio: 'cotizacion' }))
  ok(!e3.ok && /todavía no está disponible/.test(e3.e), 'limpieza por alcance se rechaza con propuestas apagadas')
  const e4 = await intenta(() => nuevaReserva(C1, { servicio: 'Servicio inventado' }))
  ok(!e4.ok, 'un servicio que no existe se rechaza')
  const e5 = await intenta(() => nuevaReserva(C1, { servicio: 'Gasfitería', modalidad_precio: 'horas' }))
  ok(!e5.ok, 'Gasfitería por horas se rechaza')
  const e6 = await intenta(() => como(C1, () => db.exec(`update app_config set propuestas_activas = true`)))
  const [v2] = await q(`select propuestas_activas from app_config`)
  ok(v2.propuestas_activas === false, 'un cliente no puede activar las propuestas')
  const e7 = await intenta(() => como(W1, () => db.exec(`update servicio_modalidades set modalidad='horas' where servicio='Electricidad'`)))
  const [m] = await q(`select count(*)::int as n from servicio_modalidades where servicio='Electricidad' and modalidad='horas'`)
  ok(m.n === 0, 'nadie desde la app puede cambiar las modalidades permitidas')
  const ahora = await intenta(() => como(C1, () => db.exec(`select fn_propuestas_activas()`)))
  ok(!ahora.ok, 'la función interna de la bandera no está expuesta')

  // Con las propuestas apagadas tampoco se puede postular ni enviar propuesta aunque la fila exista
  await flag(true)
  const idDiag0 = await nuevaReserva(C1, { servicio: 'Electricidad', modalidad_precio: 'diagnostico', hora: '12:00', horas: 2 })
  await flag(false)
  const p1 = await intenta(() => como(W1, () => db.exec(`select postularme_a_reserva('${idDiag0}')`)))
  ok(!p1.ok && /todavía no está disponible/.test(p1.e), 'apagadas: no se puede postular a una reserva no-horas: ' + (p1.e ?? '').slice(0, 50))
  const p2 = await intenta(() => como(W1, () => db.exec(`select enviar_propuesta('${idDiag0}','adicional',10,0,0,0,'x','{}','{}','{}',24)`)))
  ok(!p2.ok && /no están activadas|todavía/.test(p2.e), 'apagadas: no se puede enviar propuesta: ' + (p2.e ?? '').slice(0, 50))
  await flag(true)
  const ok1 = await intenta(() => nuevaReserva(C1, { servicio: 'Electricidad', modalidad_precio: 'fijo', hora: '13:00', horas: 2 }))
  ok(ok1.ok, 'con propuestas activas, Electricidad por precio fijo se acepta: ' + (ok1.e ?? ''))
  const e8 = await intenta(() => nuevaReserva(C1, { servicio: 'Aire acondicionado', modalidad_precio: 'horas' }))
  ok(!e8.ok, 'con propuestas activas, Aire acondicionado por horas sigue rechazado')
  const e9 = await intenta(() => nuevaReserva(C1, { servicio: 'Electricidad', modalidad_precio: 'horas', modo: 'directo', trabajador_id: W1 }))
  ok(!e9.ok, 'un pedido directo tampoco puede saltarse la modalidad')
  await flag(false)
}

console.log('\n— Cobertura pública (solo conteos)')
{
  const filas = await como(C1, () => q(`select * from v_cobertura_servicios`), 'anon')
  const ac = filas.filter((f) => f.servicio === 'Aire acondicionado')
  ok(ac.length === 0, 'Aire acondicionado no tiene profesionales: no aparece en la cobertura (se informa como sin cobertura)')
  const el = filas.find((f) => f.servicio === 'Electricidad' && f.zona === '*')
  ok(el && el.profesionales === 2, 'Electricidad: 2 profesionales (W1 y W2)')
  const bel = filas.find((f) => f.servicio === 'Gasfitería' && f.zona === 'Belén')
  ok(bel && bel.profesionales === 1, 'Gasfitería en Belén: 1')
  ok(!Object.keys(filas[0]).some((c) => ['id', 'nombre', 'telefono', 'trabajador_id'].includes(c)), 'la vista no expone datos personales')
  const aTrab = await como(C1, () => intenta(() => q(`select * from trabajadores limit 1`)), 'anon')
  ok(!aTrab.ok || aTrab.v.length === 0, 'anon sigue sin poder leer trabajadores')
}

console.log('\n— Insert: el servidor fija precio, comisión, estado y ventana')
{
  const id = await como(C1, async () => (await db.query(`insert into reservas (cliente_id, servicio, fecha, hora, horas, direccion, zona, modo, total, total_cliente, tarifa_hora, comision_pct, pago_confirmado, estado, necesidad)
    values ('${C1}','Limpieza básica del hogar','${manana}','09:00',4,'Jr. X','Iquitos','abierto',1,1,1,0,true,'aceptada','{"alcance":{"incluye":["Barrido"],"no_incluye":["Muebles pesados"]}}') returning id`)).rows[0].id)
  const [r] = await q(`select * from reservas where id=$1`, [id])
  ok(r.total === null && r.total_cliente === null && r.tarifa_hora === null, 'ignora total/tarifa que manda el navegador')
  ok(Number(r.comision_pct) === 20, 'comisión forzada a 20%')
  ok(r.pago_confirmado === false && r.estado === 'solicitada', 'pago_confirmado=false y estado=solicitada')
  const seg = (new Date(r.ventana_cierra_en).getTime() - Date.now()) / 1000
  ok(seg > 540 && seg < 660, 'ventana de 10 min fijada por el servidor')
}

console.log('\n— Insert directo (por horas) y notificación al profesional')
let idDirecto
{
  const antesPush = await pushesA(W1)
  await db.exec(`update app_config set push_function_url='http://push.local/fn', push_function_secret='s'`)
  idDirecto = await nuevaReserva(C1, { modo: 'directo', trabajador_id: W1, personas: 2, con_materiales: true, recargo_materiales: 99, horas: 3, hora: '09:00' })
  const [r] = await q(`select * from reservas where id=$1`, [idDirecto])
  ok(Number(r.tarifa_hora) === 15, 'tarifa copiada del profesional (no del navegador)')
  ok(Number(r.recargo_materiales) === 18, 'kit forzado a S/18 aunque el navegador mande otro valor')
  ok(Number(r.total) === 15 * 3 * 2 + 18, `total = tarifa×horas×personas + kit (=${r.total})`)
  const props = await q(`select * from propuestas where reserva_id=$1`, [idDirecto])
  ok(props.length === 1 && props[0].estado === 'aceptada' && props[0].snapshot_aceptado?.aceptada_por === C1, 'queda la versión aceptada con snapshot')
  ok(Number(props[0].mano_obra) === 90, 'mano de obra separada del kit (90)')
  ok((await pushesA(W1)) === antesPush + 1, 'el aviso legítimo "Nuevo pedido directo" llegó a W1 (fn_enviar_push sigue funcionando)')
  const r1 = await intenta(() => nuevaReserva(C1, { modo: 'directo', trabajador_id: W3, con_materiales: true }))
  ok(!r1.ok, 'directo con kit a un profesional sin kit se rechaza')
  const r2 = await intenta(() => nuevaReserva(C1, { modo: 'abierto', trabajador_id: W1 }))
  ok(!r2.ok, 'abierto con profesional asignado se rechaza')
}

console.log('\n— Protección de columnas económicas (UPDATE directo)')
{
  for (const [col, val] of [['total', '1'], ['total_cliente', '1'], ['tarifa_hora', '1'], ['comision_pct', '0'], ['pago_confirmado', 'true'], ['modalidad_precio', "'fijo'"], ['personas', '1'], ['trabajador_id', `'${W2}'`]]) {
    const r = await intenta(() => como(C1, () => db.exec(`update reservas set ${col}=${val} where id='${idDirecto}'`)))
    ok(!r.ok, `cliente no puede cambiar ${col}`)
  }
  const r = await intenta(() => como(W1, () => db.exec(`update reservas set total=1 where id='${idDirecto}'`)))
  ok(!r.ok, 'el profesional tampoco puede cambiar total')
  ok((await intenta(() => como(C1, () => db.exec(`update reservas set direccion='Nueva' where id='${idDirecto}'`)))).ok, 'el cliente sí puede cambiar la dirección')
  ok((await intenta(() => como(ADM, () => db.exec(`update reservas set comision_pct=15 where id='${idDirecto}'`)))).ok, 'el admin sí puede ajustar la comisión por reserva')
}

console.log('\n— Pedido abierto por horas: candidaturas, ofertas, propiedad y elección')
let idAbierto
{
  idAbierto = await nuevaReserva(C2, { hora: '14:00', horas: 4, programacion: 'programada' })
  const vistaW2 = await como(W2, () => q(`select id from v_pedidos_abiertos`))
  ok(vistaW2.some((x) => x.id === idAbierto), 'W2 (NO disponible ahora) ve el pedido PROGRAMADO')
  const cols = Object.keys((await como(W1, () => q(`select * from v_pedidos_abiertos limit 1`)))[0])
  ok(!cols.includes('direccion') && !cols.includes('cliente_id'), 'la vista no expone dirección ni cliente')

  for (const w of [W1, W2, W3]) {
    const p = await intenta(() => como(w, () => db.exec(`select postularme_a_reserva('${idAbierto}')`)))
    ok(p.ok, `${w.slice(-1)} se postula: ` + (p.e ?? ''))
  }
  const p4 = await intenta(() => como(W4, () => db.exec(`select postularme_a_reserva('${idAbierto}')`)))
  ok(!p4.ok, 'la 4.ª candidatura se rechaza (máximo 3)')
  const ofertas = await q(`select mano_obra from propuestas where reserva_id=$1 order by mano_obra`, [idAbierto])
  ok(ofertas.map((o) => Number(o.mano_obra)).join() === '60,80,100', 'ofertas con la tarifa de cada una ×4h')
  ok((await pushesA(C2)) >= 3, 'el cliente recibió los avisos de postulación (fn_enviar_push desde triggers)')

  const mias = await como(C2, () => q(`select id from propuestas where reserva_id='${idAbierto}'`))
  const ajenas = await como(C1, () => q(`select id from propuestas where reserva_id='${idAbierto}'`))
  ok(mias.length === 3 && ajenas.length === 0, 'RLS: solo el cliente de la reserva ve sus propuestas')

  const idW1 = (await q(`select id from propuestas where reserva_id=$1 and trabajador_id=$2`, [idAbierto, W1]))[0].id
  const idW2 = (await q(`select id from propuestas where reserva_id=$1 and trabajador_id=$2`, [idAbierto, W2]))[0].id

  // Propiedad y aceptación: intentos directos
  ok(!(await intenta(() => como(C2, () => db.exec(`update reservas set trabajador_id='${W1}', estado='aceptada' where id='${idAbierto}'`)))).ok, 'no se puede asignar con un UPDATE directo (saltándose la propuesta)')
  ok(!(await intenta(() => como(C1, () => db.exec(`select contratar_propuesta('${idW2}')`)))).ok, 'otro cliente no puede contratar una propuesta ajena')
  ok(!(await intenta(() => como(W2, () => db.exec(`select contratar_propuesta('${idW2}')`)))).ok, 'un profesional no puede "contratarse" a sí mismo')
  ok(!(await intenta(() => como(C1, () => db.exec(`select responder_propuesta('${idW2}', false)`)))).ok, 'otro cliente no puede rechazar una propuesta ajena')
  ok(!(await intenta(() => como(W2, () => db.exec(`select responder_propuesta('${idW2}', true)`)))).ok, 'el profesional no puede aceptar su propia propuesta')
  const insP = await intenta(() => como(C2, () => db.exec(`insert into propuestas (reserva_id, trabajador_id, modalidad, mano_obra) values ('${idAbierto}','${W1}','horas',1)`)))
  ok(!insP.ok, 'el cliente no puede insertar propuestas directamente (RLS)')
  const insW = await intenta(() => como(W1, () => db.exec(`insert into propuestas (reserva_id, trabajador_id, modalidad, mano_obra) values ('${idAbierto}','${W1}','horas',1)`)))
  ok(!insW.ok, 'el profesional tampoco')
  await como(W1, () => db.exec(`update propuestas set mano_obra = 1, estado='aceptada' where id='${idW1}'`)).catch(() => {})
  const [pp] = await q(`select mano_obra, estado from propuestas where id=$1`, [idW1])
  ok(Number(pp.mano_obra) === 60 && pp.estado === 'ofrecida', 'el profesional no puede reescribir ni auto-aceptar su propuesta (RLS)')
  await como(C2, () => db.exec(`update propuestas set mano_obra = 1, estado='aceptada' where id='${idW1}'`)).catch(() => {})
  const [pp2] = await q(`select mano_obra, estado from propuestas where id=$1`, [idW1])
  ok(Number(pp2.mano_obra) === 60 && pp2.estado === 'ofrecida', 'el cliente no puede reescribir el precio ni aceptar por UPDATE directo')

  const c = await intenta(() => como(C2, () => db.exec(`select contratar_propuesta('${idW1}')`)))
  ok(c.ok, 'el cliente contrata la propuesta de W1: ' + (c.e ?? ''))
  const [r] = await q(`select * from reservas where id=$1`, [idAbierto])
  ok(r.estado === 'aceptada' && r.trabajador_id === W1 && Number(r.total) === 60 && Number(r.total_cliente) === 60, 'reserva asignada, total = 60 (15×4)')
  const est = await q(`select estado from propuestas where reserva_id=$1`, [idAbierto])
  ok(est.filter((e) => e.estado === 'aceptada').length === 1 && est.filter((e) => e.estado === 'reemplazada').length === 2, 'una aceptada y dos reemplazadas')
  ok(!(await intenta(() => como(C2, () => db.exec(`select contratar_propuesta('${idW1}')`)))).ok, 'no se puede contratar dos veces')
  ok((await pushesA(W1)) >= 2, 'W1 recibió el aviso "¡Te eligieron!" (trigger de candidaturas)')
}

console.log('\n— Solapamiento y disponibilidad')
{
  const idB = await nuevaReserva(C1, { hora: '15:00', horas: 2 })
  const r = await intenta(() => como(W1, () => db.exec(`select postularme_a_reserva('${idB}')`)))
  ok(!r.ok && /cruza/i.test(r.e), 'W1 no puede postularse a un horario que se cruza con un trabajo suyo')
  const idA = await nuevaReserva(C1, { programacion: 'ahora', hora: '06:00', fecha: manana, horas: 2 })
  ok(!(await como(W2, () => q(`select id from v_pedidos_abiertos`))).some((x) => x.id === idA), 'W2 (no disponible ahora) NO ve el pedido "ahora"')
  ok(!(await intenta(() => como(W2, () => db.exec(`select postularme_a_reserva('${idA}')`)))).ok, 'W2 no puede postularse a un pedido "ahora"')
  ok((await como(W4, () => q(`select id from v_pedidos_abiertos`))).some((x) => x.id === idA), 'W4 (disponible ahora) sí lo ve')
}

console.log('\n— Diagnóstico → presupuesto de reparación con descuento de la visita (propuestas activas)')
let idDiag
{
  await flag(true)
  await db.exec(`insert into precios_profesional (trabajador_id, servicio, modalidad, monto, alcance) values ('${W1}','Electricidad','diagnostico',30,'Revisión del tomacorriente y propuesta de reparación')`)
  idDiag = await nuevaReserva(C1, { servicio: 'Electricidad', modalidad_precio: 'diagnostico', hora: '20:00', horas: 2, fecha: manana })
  const sinPrecio = await intenta(() => como(W2, () => db.exec(`select postularme_a_reserva('${idDiag}')`)))
  ok(!sinPrecio.ok && /precio/i.test(sinPrecio.e), 'sin precio configurado NO se inventa uno ni se usan horas: ' + (sinPrecio.e ?? '').slice(0, 60))
  ok((await como(W1, () => q(`select id from v_pedidos_abiertos where id='${idDiag}'`))).length === 0, 'la vista actual del profesional no muestra modalidades sin panel')
  ok((await intenta(() => como(W1, () => db.exec(`select postularme_a_reserva('${idDiag}')`)))).ok, 'W1 (con precio de diagnóstico) se postula')
  const [of] = await q(`select * from propuestas where reserva_id=$1`, [idDiag])
  ok(Number(of.mano_obra) === 30 && /visita de diagnóstico/.test(of.condiciones.join(' ')), 'oferta = precio de la visita (30), aclara que la reparación va aparte')
  await como(C1, () => db.exec(`select contratar_propuesta('${of.id}')`))
  let [r] = await q(`select * from reservas where id=$1`, [idDiag])
  ok(r.estado === 'aceptada' && Number(r.total_cliente) === 30 && r.tarifa_hora === null, 'contratado: importe = solo la visita (30), sin tarifa por hora')

  for (const e of ['en_camino', 'en_curso']) await como(W1, () => db.exec(`update reservas set estado='${e}' where id='${idDiag}'`))
  ok(!(await intenta(() => como(W2, () => db.exec(`select enviar_propuesta('${idDiag}','presupuesto_reparacion',100,0,0,0,'x','{}','{}','{}',48)`)))).ok, 'otro profesional no puede enviar presupuesto')
  ok(!(await intenta(() => como(C1, () => db.exec(`select enviar_propuesta('${idDiag}','adicional',10,0,0,0,'x','{}','{}','{}',48)`)))).ok, 'un cliente no puede enviar propuestas')
  ok(!(await intenta(() => como(W1, () => db.exec(`select enviar_propuesta('${idDiag}','adicional',-5,0,0,0,'x','{}','{}','{}',48)`)))).ok, 'importes negativos se rechazan')
  ok(!(await intenta(() => como(W1, () => db.exec(`select enviar_propuesta('${idDiag}','adicional',0,0,0,0,'x','{}','{}','{}',48)`)))).ok, 'una propuesta sin importe se rechaza')
  ok(!(await intenta(() => como(W1, () => db.exec(`select enviar_propuesta('${idDiag}','adicional',10,0,0,0,' ','{}','{}','{}',48)`)))).ok, 'una propuesta sin alcance se rechaza')
  const env = await intenta(() => como(W1, async () => (await db.query(`select enviar_propuesta($1,'presupuesto_reparacion',150,20,0,0,'Cambio de tomacorriente y cableado',array['Mano de obra'],array['Obra civil'],array['Garantía 30 días'],48) as id`, [idDiag])).rows[0].id))
  ok(env.ok, 'W1 envía presupuesto de reparación: ' + (env.e ?? ''))
  const [pre] = await q(`select * from propuestas where id=$1`, [env.v])
  ok(Number(pre.descuento_visita) === 30 && Number(pre.total_propuesta) === 140, 'descuento de visita calculado por el servidor (30): 150 − 30 + 20 = 140')
  ok((await q(`select total_cliente from reservas where id=$1`, [idDiag]))[0].total_cliente == 30, 'sin aceptar, el total sigue siendo la visita (30)')
  ok((await pushesA(C1)) >= 1, 'el cliente recibió el aviso "Tienes una propuesta"')
  ok(!(await intenta(() => como(W1, () => db.exec(`select responder_propuesta('${env.v}', true)`)))).ok, 'el profesional no puede aceptar su propia propuesta')
  ok((await intenta(() => como(C1, () => db.exec(`select responder_propuesta('${env.v}', true)`)))).ok, 'el cliente acepta el presupuesto')
  ;[r] = await q(`select * from reservas where id=$1`, [idDiag])
  ok(Number(r.total_cliente) === 170 && Number(r.total) === 150, `total cliente 170 (visita 30 + reparación neta 120 + materiales 20); base de comisión 150`)
  ok(!(await intenta(() => db.exec(`update propuestas set mano_obra=1 where id='${env.v}'`))).ok, 'una propuesta aceptada no se puede editar')
  ok(!(await intenta(() => como(C1, () => db.exec(`select responder_propuesta('${env.v}', true)`)))).ok, 'no se acepta dos veces (no hay doble cobro)')

  const ad = await como(W1, async () => (await db.query(`select enviar_propuesta($1,'adicional',0,0,10,0,'Movilidad extra',array['Traslado'],'{}','{}',24) as id`, [idDiag])).rows[0].id)
  ok((await intenta(() => como(C1, () => db.exec(`select responder_propuesta('${ad}', false)`)))).ok, 'el cliente rechaza un adicional')
  ok((await q(`select total_cliente from reservas where id=$1`, [idDiag]))[0].total_cliente == 170, 'un adicional rechazado no cambia el total')
  const ad2 = await como(W1, async () => (await db.query(`select enviar_propuesta($1,'adicional',0,0,10,0,'Movilidad extra',array['Traslado'],'{}','{}',24) as id`, [idDiag])).rows[0].id)
  await como(C1, () => db.exec(`select responder_propuesta('${ad2}', true)`))
  ;[r] = await q(`select * from reservas where id=$1`, [idDiag])
  ok(Number(r.total_cliente) === 180 && Number(r.total) === 150, 'adicional aceptado: total cliente 180; comisión sigue sobre 150')
  // Una propuesta vencida no se puede aceptar
  const venc = await como(W1, async () => (await db.query(`select enviar_propuesta($1,'adicional',5,0,0,0,'Otro',array['x'],'{}','{}',24) as id`, [idDiag])).rows[0].id)
  await db.exec(`update propuestas set vigente_hasta = now() - interval '1 hour' where id='${venc}'`)
  ok(!(await intenta(() => como(C1, () => db.exec(`select responder_propuesta('${venc}', true)`)))).ok, 'una propuesta vencida no se puede aceptar')

  console.log('\n— Pago manual: pendiente de verificación, confirma solo el admin')
  ok(!(await intenta(() => como(C2, () => db.exec(`select registrar_pago('${idDiag}','yape','123',null)`)))).ok, 'otro cliente no puede registrar pago')
  ok(!(await intenta(() => como(C1, () => db.exec(`select registrar_pago('${idDiag}','yape',null,null)`)))).ok, 'Yape sin número ni captura se rechaza')
  ok(!(await intenta(() => como(C1, () => db.exec(`select registrar_pago('${idDiag}','yape','1','${C2}/captura.png')`)))).ok, 'una captura de la carpeta de otra persona se rechaza')
  const pg = await intenta(() => como(C1, async () => (await db.query(`select registrar_pago($1,'yape','OP-123',null) as id`, [idDiag])).rows[0].id))
  ok(pg.ok, 'el cliente registra el pago: ' + (pg.e ?? ''))
  ok((await q(`select pago_confirmado from reservas where id=$1`, [idDiag]))[0].pago_confirmado === false, 'registrar NO confirma el pago')
  const [pago] = await q(`select * from pagos where id=$1`, [pg.v])
  ok(pago.estado === 'pendiente_verificacion' && Number(pago.monto) === 180, 'pago pendiente por el saldo (180)')
  ok(!(await intenta(() => como(C1, () => db.exec(`select registrar_pago('${idDiag}','plin','OP-2',null)`)))).ok, 'no se registra otro pago mientras hay uno pendiente por todo el saldo')
  ok(!(await intenta(() => como(C1, () => db.exec(`select confirmar_pago('${pg.v}', true, null)`)))).ok, 'el cliente no puede confirmar su propio pago')
  ok(!(await intenta(() => como(W1, () => db.exec(`select confirmar_pago('${pg.v}', true, null)`)))).ok, 'el profesional tampoco')
  await como(C1, () => db.exec(`update pagos set estado='confirmado' where id='${pg.v}'`)).catch(() => {})
  ok((await q(`select estado from pagos where id=$1`, [pg.v]))[0].estado === 'pendiente_verificacion', 'el cliente no puede editar pagos directamente (RLS)')
  ok((await como(C2, () => q(`select id from pagos where id='${pg.v}'`))).length === 0, 'otro cliente no ve este pago')
  const antesAdm = await pushesA(C1)
  ok((await intenta(() => como(ADM, () => db.exec(`select confirmar_pago('${pg.v}', true, null)`)))).ok, 'el admin confirma el pago')
  ok((await q(`select pago_confirmado from reservas where id=$1`, [idDiag]))[0].pago_confirmado === true, 'ahora sí pago_confirmado = true')
  ok((await pushesA(C1)) === antesAdm + 1, 'el cliente recibió el aviso "Pago confirmado"')
  const otro = await como(W1, async () => (await db.query(`select enviar_propuesta($1,'adicional',20,0,0,0,'Otro trabajo',array['x'],'{}','{}',24) as id`, [idDiag])).rows[0].id)
  await como(C1, () => db.exec(`select responder_propuesta('${otro}', true)`))
  const [rr] = await q(`select pago_confirmado, total_cliente from reservas where id=$1`, [idDiag])
  ok(rr.pago_confirmado === false && Number(rr.total_cliente) === 200, 'un adicional posterior reabre el saldo (200 vs 180 pagados)')
}

console.log('\n— Cotización por alcance (requiere propuesta del profesional)')
{
  const idCot = await nuevaReserva(C1, { modalidad_precio: 'cotizacion', hora: '11:00', horas: 2, fecha: manana, programacion: 'programada' })
  await como(W4, () => db.exec(`select postularme_a_reserva('${idCot}')`))
  ok((await q(`select * from propuestas where reserva_id=$1`, [idCot])).length === 0, 'no hay estimación automática en cotización')
  const el = await intenta(() => como(C1, () => db.exec(`select elegir_candidata('${idCot}','${W4}')`)))
  ok(!el.ok && /propuesta/i.test(el.e), 'no se puede elegir sin propuesta')
  ok(!(await intenta(() => como(W3, () => db.exec(`select enviar_propuesta('${idCot}','servicio',250,0,0,0,'x','{}','{}','{}',24)`)))).ok, 'quien no se postuló no puede enviar propuesta')
  const env = await intenta(() => como(W4, async () => (await db.query(`select enviar_propuesta($1,'servicio',250,0,0,0,'Limpieza de casa mediana',array['Pisos','Baños'],array['Reorganizar'],array['Garantía 7 días'],24) as id`, [idCot])).rows[0].id))
  ok(env.ok, 'el profesional postulado envía su propuesta: ' + (env.e ?? ''))
  ok((await intenta(() => como(C1, () => db.exec(`select elegir_candidata('${idCot}','${W4}')`)))).ok, 'elegir_candidata pasa por aceptar la propuesta')
  const [r] = await q(`select * from reservas where id=$1`, [idCot])
  ok(r.estado === 'aceptada' && r.trabajador_id === W4 && Number(r.total_cliente) === 250 && r.tarifa_hora === null, 'asignada con el importe de la propuesta (250)')
}
await flag(false)

console.log('\n— "Reparaciones generales" no es un atajo para contratar por horas un oficio deshabilitado')
{
  // Mismas frases que src/lib/reparacionesGenerales.test.ts (la interfaz usa una lista más amplia).
  const oficios = ['Quiero cambiar un enchufe', 'Arreglar mi tomacorriente', 'Cambiar un foco de la sala', 'Se me gotea el caño', 'Hay una fuga de agua en el baño',
    'Destapar el desagüe', 'Limpiar mi aire acondicionado', 'Cambiar la chapa de la puerta', 'Pintar la pared del cuarto', 'Cambiar una loseta rota',
    'Se rompió el vidrio de la ventana', 'Arreglar la bisagra del ropero']
  for (const frase of oficios) {
    const r = await intenta(() => nuevaReserva(C1, { servicio: 'Mantenimiento y reparaciones generales', descripcion_trabajo: frase, hora: '16:30', horas: 2 }))
    ok(!r.ok && /no cubre electricidad, gasfitería ni otros oficios/.test(r.e), `rechaza «${frase}»`)
  }
  for (const frase of ['Colgar tres cuadros en la sala', 'Instalar un perchero en el pasillo', 'Ajustar los tornillos del estante']) {
    const r = await intenta(() => nuevaReserva(C1, { servicio: 'Mantenimiento y reparaciones generales', descripcion_trabajo: frase, hora: '16:30', horas: 2 }))
    ok(r.ok, `acepta «${frase}»: ` + (r.e ?? ''))
  }
  const dir = await intenta(() => nuevaReserva(C1, { servicio: 'Mantenimiento y reparaciones generales', descripcion_trabajo: 'cambiar un enchufe', modo: 'directo', trabajador_id: W1, hora: '17:00', horas: 2 }))
  ok(!dir.ok, 'tampoco por pedido directo')
  const sin = await intenta(() => nuevaReserva(C1, { servicio: 'Mantenimiento y reparaciones generales', hora: '16:30', horas: 2 }))
  ok(sin.ok, 'sin descripción no se bloquea (la interfaz exige describir)')
}

console.log('\n— Reintentar si nadie respondió')
{
  const id = await nuevaReserva(C1, { hora: '08:00', horas: 2, fecha: manana, servicio: 'Mantenimiento y reparaciones generales' })
  ok(!(await intenta(() => como(C1, () => db.exec(`select reintentar_solicitud('${id}','ahora')`)))).ok, 'no se puede reintentar mientras corre la ventana')
  ok(!(await intenta(() => como(C2, () => db.exec(`select reintentar_solicitud('${id}','ahora')`)))).ok, 'otro cliente no puede reintentar la solicitud ajena')
  await db.exec(`update reservas set ventana_cierra_en = now() - interval '1 minute' where id='${id}'`)
  ok((await intenta(() => como(C1, () => db.exec(`select reintentar_solicitud('${id}','programada','${manana}','13:00')`)))).ok, 'reintenta con otro horario')
  const [r] = await q(`select hora, programacion, ventana_cierra_en > now() as abierta from reservas where id=$1`, [id])
  ok(String(r.hora).startsWith('13:00') && r.programacion === 'programada' && r.abierta, 'horario cambiado y ventana reabierta')
  await db.exec(`update reservas set ventana_cierra_en = now() - interval '1 minute' where id='${id}'`)
  ok(!(await intenta(() => como(C1, () => db.exec(`select reintentar_solicitud('${id}','programada','2020-01-01','09:00')`)))).ok, 'no acepta un horario en el pasado')
  ok((await intenta(() => como(C1, () => db.exec(`select reintentar_solicitud('${id}','ahora')`)))).ok, 'reintentar "lo antes posible" calcula el horario en el servidor')
}

console.log('\n— Cancelar cierra propuestas pendientes')
{
  const id = await nuevaReserva(C1, { hora: '07:00', horas: 2, fecha: manana, servicio: 'Mantenimiento y reparaciones generales' })
  await como(W1, () => db.exec(`select postularme_a_reserva('${id}')`))
  await como(C1, () => db.exec(`update reservas set estado='cancelada' where id='${id}'`))
  const e = await q(`select estado from propuestas where reserva_id=$1`, [id])
  ok(e.length > 0 && e.every((x) => x.estado === 'vencida'), 'las propuestas ofrecidas pasan a vencida')
}

console.log('\n— Permisos de funciones internas y fn_enviar_push')
for (const f of ["fn_recalcular_totales('" + idDirecto + "')", "fn_crear_oferta('" + idDirecto + "','" + W1 + "')", "fn_enviar_push(array['" + C1 + "']::uuid[],'a','b','c')", "fn_marcar_aceptada('" + C1 + "','" + C1 + "')", 'fn_propuestas_activas()', "fn_aviso('" + C1 + "','a','b','c')"]) {
  for (const rol of ['authenticated', 'anon']) {
    const r = await intenta(() => como(C1, () => db.exec(`select ${f}`), rol))
    ok(!r.ok && /permission denied/i.test(r.e), `${rol} no puede llamar ${f.split('(')[0]}`)
  }
}
{
  const n0 = await pushes()
  await db.exec(`select fn_enviar_push(array['${C1}']::uuid[],'Titulo','Cuerpo','/x')`)
  ok((await pushes()) === n0 + 1, 'el dueño de las funciones (triggers, RPC) SÍ puede enviar: el envío legítimo no se rompió')
  ok(!(await intenta(() => como(C1, () => db.exec(`select contratar_propuesta('${C1}')`), 'anon'))).ok, 'anon no puede contratar')
}

console.log(`\n${pasos - fallos}/${pasos} verificaciones OK`)
process.exit(fallos ? 1 : 0)
