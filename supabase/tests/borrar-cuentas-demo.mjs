// Prueba de supabase/produccion-interna/02_borrar_cuentas_demo.sql contra la base de las migraciones (PGlite en memoria).
// Requiere:  npm i --no-save @electric-sql/pglite      Correr:  node supabase/tests/borrar-cuentas-demo.mjs
import { crearBase } from './arnes.mjs'
import fs from 'node:fs'

let fallos = 0, pasos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }
const rd = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const SQL = rd('../produccion-interna/02_borrar_cuentas_demo.sql')
const U = (n) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`
const dia = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)

// Demo: cliente, dos profesionales y un admin. Reales: cliente, profesional y admin.
const DC = U(1), DW = U(2), DW2 = U(3), DA = U(4), RC = U(11), RW = U(12), RA = U(13), CORREO = U(5)
const CORREOS = {
  [DC]: 'clienta.demo@prueba.limpi.test', [DW]: 'rosa.demo@prueba.limpi.test', [DW2]: 'pro1@prueba.limpi.test', [DA]: 'admin.demo@prueba.limpi.test',
  [CORREO]: 'frd.grupo@frdinnovacion.com', [RC]: 'cliente.real@gmail.com', [RW]: 'pro.real@gmail.com', [RA]: 'admin.real@gmail.com',
}

async function preparar() {
  const db = await crearBase({ hasta: 15 })
  await db.exec(`
    insert into auth.users (id, email) values ${Object.entries(CORREOS).map(([id, e]) => `('${id}','${e}')`).join(',')};
    insert into perfiles (id, rol, nombre, telefono, zona, direccion) values
      ('${DC}','cliente','Clienta Demo','911111111','Iquitos','x'),('${DW}','trabajador','Rosa Demo','922222221','Iquitos','x'),
      ('${DW2}','trabajador','Pro Uno','922222222','Iquitos','x'),('${DA}','admin','Admin Demo','933333331','Iquitos','x'),
      ('${CORREO}','cliente','Prueba correo','900000000','Punchana','x'),
      ('${RC}','cliente','Cliente Real','911111119','Iquitos','x'),('${RW}','trabajador','Pro Real','922222229','Iquitos','x'),('${RA}','admin','Admin Real','933333339','Iquitos','x');
    insert into trabajadores (id, numero_documento, zonas, servicios, tarifa_hora, kit_propio, verificado, disponible_ahora, ultima_actividad) values
      ('${DW}','10000001',array['Iquitos'],array['Limpieza básica del hogar'],15,true,true,true,now()),
      ('${DW2}','10000002',array['Iquitos'],array['Limpieza básica del hogar'],15,true,true,true,now()),
      ('${RW}','10000009',array['Iquitos'],array['Limpieza básica del hogar'],15,true,true,true,now());
  `)
  for (const f of ['../hotfix/0016a_proteger_rol_perfiles.sql', '../hotfix/0016b_alta_tecnico_pendiente.sql', '../migrations/0016_roles_por_capacidades.sql', '../migrations/0017_push_por_app.sql']) await db.exec(rd(f))
  // La 0016 solo pasa a `admins` las cuentas que nombra: aquí se agregan las dos de la prueba.
  await db.exec(`insert into admins (user_id) values ('${DA}'),('${RA}') on conflict do nothing`)
  await db.exec(`update trabajadores set verificado = true, verificado_por = '${DA}' where id in ('${DW}','${DW2}','${RW}')`)
  await db.exec(`insert into push_subscriptions (user_id, endpoint, p256dh, auth, app) values ('${DC}','https://e/1','k','a',null),('${RC}','https://e/2','k','a','cliente')`)
  const reserva = async (cliente, extra = {}) => {
    const c = { cliente_id: cliente, servicio: 'Limpieza básica del hogar', fecha: dia(3), hora: '09:00', horas: 4, direccion: 'Jr. X', zona: 'Iquitos', modo: 'abierto', ...extra }
    const cols = Object.keys(c)
    return (await db.query(`insert into reservas (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(c))).rows[0].id
  }
  return { db, reserva }
}
const n = async (db, sql) => Number((await db.query(sql)).rows[0].n)
const intenta = async (db, sql) => { try { await db.exec(sql); return null } catch (e) { try { await db.exec('rollback') } catch { /* nada */ } return String(e.message) } }

console.log('\n— Caso normal: pedidos solo entre cuentas demo')
{
  const { db, reserva } = await preparar()
  const r1 = await reserva(DC)                                             // abierto, sin profesional
  const r2 = await reserva(DC, { fecha: dia(5), trabajador_id: DW, modo: 'directo' })
  await db.exec(`insert into candidaturas (reserva_id, trabajador_id) values ('${r1}','${DW}'),('${r1}','${DW2}')`)
  const rReal = await reserva(RC, { fecha: dia(6), trabajador_id: RW, modo: 'directo' })   // pedido entre cuentas reales
  const admins = await n(db, 'select count(*) n from admins')
  ok(admins === 2, 'antes: dos cuentas de administración (demo y real)')

  const err = await intenta(db, SQL)
  ok(err === null, 'el bloque corre sin error' + (err ? ': ' + err : ''))
  ok((await n(db, `select count(*) n from auth.users where email like '%@prueba.limpi.test' or email = 'frd.grupo@frdinnovacion.com'`)) === 0, 'no queda ninguna cuenta demo ni la de prueba de correo')
  ok((await n(db, `select count(*) n from perfiles where id in ('${DC}','${DW}','${DW2}','${DA}','${CORREO}')`)) === 0, 'sus perfiles se fueron')
  ok((await n(db, `select count(*) n from reservas where id in ('${r1}','${r2}')`)) === 0, 'sus pedidos se fueron')
  ok((await n(db, 'select count(*) n from candidaturas')) === 0, 'sus postulaciones se fueron')
  ok((await n(db, `select count(*) n from push_subscriptions where user_id = '${DC}'`)) === 0, 'sus suscripciones push se fueron')
  ok((await n(db, 'select count(*) n from auth.users')) === 3, 'las tres cuentas reales siguen')
  ok((await n(db, `select count(*) n from reservas where id = '${rReal}'`)) === 1, 'el pedido entre cuentas reales sigue')
  ok((await n(db, `select count(*) n from trabajadores where id = '${RW}' and verificado and verificado_por is null`)) === 1, 'el profesional real sigue verificado (solo se vacía quién lo verificó)')
  ok((await n(db, `select count(*) n from push_subscriptions where user_id = '${RC}'`)) === 1, 'la suscripción del cliente real sigue')
  ok((await n(db, 'select count(*) n from admins')) === 1 && (await n(db, `select count(*) n from admins where user_id = '${RA}'`)) === 1, 'queda solo la cuenta de administración real')
  const otra = await intenta(db, SQL)
  ok(otra === null, 'pegarlo otra vez no falla (no hay nada que borrar)')
}

console.log('\n— Se niega si un pedido mezcla una cuenta demo con una real')
{
  const { db, reserva } = await preparar()
  await reserva(RC, { trabajador_id: DW, modo: 'directo' })   // cliente REAL con profesional demo
  const antes = await n(db, 'select count(*) n from auth.users')
  const err = await intenta(db, SQL)
  ok(!!err && /cuenta demo y una cuenta real/.test(err), 'se niega con un mensaje claro')
  ok((await n(db, 'select count(*) n from auth.users')) === antes, 'no borró ninguna cuenta')
}

console.log('\n— Se niega si un profesional demo se postuló al pedido de un cliente real')
{
  const { db, reserva } = await preparar()
  const r = await reserva(RC)
  await db.exec(`insert into candidaturas (reserva_id, trabajador_id) values ('${r}','${DW}')`)
  const antes = await n(db, 'select count(*) n from auth.users')
  const err = await intenta(db, SQL)
  ok(!!err && /clientes reales/.test(err), 'se niega con un mensaje claro')
  ok((await n(db, 'select count(*) n from auth.users')) === antes && (await n(db, 'select count(*) n from candidaturas')) === 1, 'no borró nada')
}

console.log(fallos === 0 ? `\nTodo bien: ${pasos} comprobaciones` : `\n${fallos} de ${pasos} comprobaciones FALLARON`)
process.exit(fallos === 0 ? 0 : 1)
