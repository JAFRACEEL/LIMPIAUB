// COMPATIBILIDAD DEL FRONTEND ANTIGUO Y REVERSA CONTRA UN PROYECTO SUPABASE DE PRUEBAS (API real: GoTrue + PostgREST + RLS).
// ESTADO: escrito, NO EJECUTADO. Pendiente de que exista el proyecto de pruebas `limpia-test`. Revisarlo en el primer uso.
// Datos 100 % sintéticos (cuentas @prueba.limpi.test). Se niega a correr contra producción o sin confirmación explícita.
//
// Orden de uso (todo en el proyecto de PRUEBAS; la base del proyecto debe tener ya schema.sql + 0001..0014 + `integracion-real.mjs sembrar`):
//   1. SQL Editor: migración 0015 (supabase/migrations/0015_experiencia_cliente.sql)
//   2. node --env-file=.env.test.local supabase/tests/compat-reversa-real.mjs antiguo        <- frontend antiguo vs base migrada
//   3. node --env-file=.env.test.local supabase/tests/compat-reversa-real.mjs aislamiento
//   4. node --env-file=.env.test.local supabase/tests/compat-reversa-real.mjs foto antes.local.json
//   5. SQL Editor: supabase/rollback/0015_rollback.sql
//   6. node --env-file=.env.test.local supabase/tests/compat-reversa-real.mjs foto despues.local.json
//   7. node supabase/tests/compat-reversa-real.mjs comparar antes.local.json despues.local.json   <- valores columna por columna
//   8. node --env-file=.env.test.local supabase/tests/compat-reversa-real.mjs antiguo        <- el frontend antiguo sigue funcionando
//   9. node --env-file=.env.test.local supabase/tests/compat-reversa-real.mjs aislamiento
// Los permisos de funciones/vistas/políticas antes y después se comparan con supabase/tests/consultas-esquema-solo-lectura.sql
// (huellas md5) ejecutada en el SQL Editor del proyecto de pruebas en los pasos 4 y 6.
// Los archivos *.local.json quedan fuera de Git (patrón *.local.json). Variables: TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY,
// TEST_SUPABASE_SERVICE_KEY, TEST_CONFIRMO_ENTORNO_DE_PRUEBAS=si. Las claves NUNCA van al chat ni a Git.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const modo = process.argv[2]
let pasos = 0, fallos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }

if (modo === 'comparar') {
  const [a, b] = [process.argv[3], process.argv[4]].map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
  const difs = []
  for (const tabla of Object.keys(a)) {
    const fa = new Map(a[tabla].map((r) => [r.id, r])), fb = new Map((b[tabla] ?? []).map((r) => [r.id, r]))
    for (const [id, ra] of fa) {
      const rb = fb.get(id)
      if (!rb) { difs.push(`${tabla}:${id} desapareció`); continue }
      for (const c of Object.keys(ra)) if (JSON.stringify(ra[c]) !== JSON.stringify(rb[c])) difs.push(`${tabla}:${id}.${c}: ${JSON.stringify(ra[c])} -> ${JSON.stringify(rb[c])}`)
    }
  }
  ok(difs.length === 0, difs.length ? 'valores distintos:\n      ' + difs.slice(0, 20).join('\n      ') : `mismos valores en todas las filas (${Object.entries(a).map(([t, r]) => `${t}: ${r.length}`).join(', ')})`)
  console.log(`\n${pasos - fallos}/${pasos} OK`)
  process.exit(fallos ? 1 : 0)
}

const url = process.env.TEST_SUPABASE_URL, anon = process.env.TEST_SUPABASE_ANON_KEY, servicio = process.env.TEST_SUPABASE_SERVICE_KEY
if (!url || !anon || !servicio || !['antiguo', 'aislamiento', 'foto'].includes(modo)) {
  console.error('Uso: node --env-file=.env.test.local compat-reversa-real.mjs <antiguo|aislamiento|foto <archivo>|comparar a b>'); process.exit(2)
}
if (url.includes('ztlxmdeviurdhqyabhvb') || process.env.TEST_CONFIRMO_ENTORNO_DE_PRUEBAS !== 'si') {
  console.error('Rechazado: solo corre contra un proyecto de PRUEBAS (TEST_CONFIRMO_ENTORNO_DE_PRUEBAS=si), nunca contra producción.'); process.exit(2)
}
const admin = createClient(url, servicio, { auth: { persistSession: false } })

if (modo === 'foto') {
  const salida = process.argv[3]
  if (!salida || !/\.local(\.[a-z]+)?$|\.local\.json$/.test(salida)) { console.error('El archivo de salida debe terminar en .local.json (queda fuera de Git).'); process.exit(2) }
  const foto = {}
  for (const t of ['reservas', 'propuestas', 'pagos', 'candidaturas', 'calificaciones']) {
    const { data, error } = await admin.from(t).select('*').order('id')
    if (error) { if (t === 'propuestas' || t === 'pagos') { foto[t] = []; continue } throw error }
    foto[t] = data
  }
  const { data: tr } = await admin.from('trabajadores').select('id, tarifa_hora, kit_propio, verificado, servicios, zonas').order('id')
  foto.trabajadores = tr
  fs.writeFileSync(salida, JSON.stringify(foto, null, 1))
  console.log('Foto guardada en', salida, Object.entries(foto).map(([t, r]) => `${t}:${r.length}`).join(' '))
  process.exit(0)
}

// ---- sesiones (cuentas sintéticas creadas por `integracion-real.mjs sembrar`) ----
const PASS = randomUUID()
const correo = { c1: 'cliente1@prueba.limpi.test', c2: 'cliente2@prueba.limpi.test', w1: 'pro1@prueba.limpi.test', w2: 'pro2@prueba.limpi.test' }
async function sesion(clave) {
  const lista = await admin.auth.admin.listUsers({ perPage: 200 })
  const u = lista.data.users.find((x) => x.email === correo[clave])
  if (!u) throw new Error(`Falta la cuenta ${correo[clave]}: corre antes "integracion-real.mjs sembrar"`)
  await admin.auth.admin.updateUserById(u.id, { password: PASS })
  const c = createClient(url, anon, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email: correo[clave], password: PASS })
  if (error) throw error
  return { cliente: c, id: data.user.id }
}
const [c1, c2, w1, w2] = [await sesion('c1'), await sesion('c2'), await sesion('w1'), await sesion('w2')]
const dia = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)
const tag = Date.now() % 100000   // para que dos corridas no se crucen en horario
const hora = (n) => `${String(6 + (n % 14)).padStart(2, '0')}:00`
const totalDe = async (id) => (await admin.from('reservas').select('total, total_cliente, tarifa_hora, comision_pct, pago_confirmado, estado').eq('id', id).single()).data

if (modo === 'antiguo') {
  console.log('— Frontend ANTIGUO (mismas llamadas que ae7a510: insert en reservas, RPC postularme/elegir, UPDATE de estado)')
  const d = 20 + (tag % 200)
  // Reservar.tsx: insert abierto con campos que el navegador no debería controlar
  const ins = await c1.cliente.from('reservas').insert({ cliente_id: c1.id, servicio: 'Limpieza básica del hogar', fecha: dia(d), hora: hora(tag), horas: 3, direccion: 'Jr. Sintético 1', zona: 'Iquitos',
    pago_metodo: 'yape', con_materiales: true, recargo_materiales: 1, modo: 'abierto', ventana_cierra_en: new Date(Date.now() + 600_000).toISOString(),
    tarifa_hora: 1, comision_pct: 0, pago_confirmado: true }).select('id, total, comision_pct, pago_confirmado, estado').single()
  ok(!ins.error, 'insert abierto con payload antiguo: ' + (ins.error?.message ?? ''))
  if (ins.error) process.exit(1)
  ok(Number(ins.data.comision_pct) === 20 && ins.data.pago_confirmado === false && ins.data.estado === 'solicitada', 'el servidor ignora comisión, pago y estado del navegador')
  const id = ins.data.id
  const p = await w1.cliente.rpc('postularme_a_reserva', { p_reserva_id: id })
  ok(!p.error, 'postularme_a_reserva (RPC antigua): ' + (p.error?.message ?? ''))
  const e = await c1.cliente.rpc('elegir_candidata', { p_reserva_id: id, p_trabajador_id: w1.id })
  ok(!e.error, 'elegir_candidata (RPC antigua): ' + (e.error?.message ?? ''))
  const t = await totalDe(id)
  const tarifa = Number(t.tarifa_hora)
  ok(Number(t.total) === tarifa * 3 + 18, `total = tarifa ${tarifa} × 3 h + kit 18 = ${tarifa * 3 + 18} (real: ${t.total}) — es lo que suma Ganancias en el panel antiguo`)
  const paso = async (cli, desde, hacia) => (await cli.cliente.from('reservas').update({ estado: hacia }).eq('id', id).eq('estado', desde).select('id')).data?.length === 1
  ok(await paso(w1, 'aceptada', 'en_camino'), 'aceptada -> en_camino')
  ok(await paso(w1, 'en_camino', 'en_curso'), 'en_camino -> en_curso')
  ok(await paso(w1, 'en_curso', 'completada'), 'en_curso -> completada')
  ok(Number((await totalDe(id)).total) === tarifa * 3 + 18, 'el total no cambia al completar')

  // Directo con tarifa falsa
  const dir = await c2.cliente.from('reservas').insert({ cliente_id: c2.id, servicio: 'Limpieza básica del hogar', fecha: dia(d + 1), hora: hora(tag + 1), horas: 2, direccion: 'Jr. Sintético 2', zona: 'Iquitos',
    pago_metodo: 'plin', con_materiales: false, recargo_materiales: 0, modo: 'directo', trabajador_id: w2.id, tarifa_hora: 1, ventana_cierra_en: new Date(Date.now() + 900_000).toISOString() }).select('id').single()
  ok(!dir.error, 'insert directo con payload antiguo: ' + (dir.error?.message ?? ''))
  if (!dir.error) {
    const td = await totalDe(dir.data.id)
    const { data: tw } = await admin.from('trabajadores').select('tarifa_hora').eq('id', w2.id).single()
    ok(Number(td.tarifa_hora) === Number(tw.tarifa_hora) && Number(td.total) === Number(tw.tarifa_hora) * 2, `directo: tarifa del profesional (${tw.tarifa_hora}), no la falsa, total ${td.total}`)
    const acep = await w2.cliente.from('reservas').update({ estado: 'aceptada' }).eq('id', dir.data.id).eq('estado', 'solicitada').select('id')
    ok(acep.data?.length === 1, 'el profesional acepta con el UPDATE antiguo')
    const canc = await c2.cliente.from('reservas').update({ estado: 'cancelada' }).eq('id', dir.data.id).eq('estado', 'aceptada').select('id')
    ok(canc.data?.length === 1, 'el cliente cancela con el UPDATE antiguo')
  }
  // Cambio de comportamiento conocido (informativo)
  const lima = new Date(Date.now() - 5 * 3600_000 + 10 * 60_000).toISOString()
  const corto = await c1.cliente.from('reservas').insert({ cliente_id: c1.id, servicio: 'Limpieza básica del hogar', fecha: lima.slice(0, 10), hora: lima.slice(11, 16), horas: 2, direccion: 'Jr. X', zona: 'Iquitos', modo: 'abierto' }).select('id').single()
  console.log('  · pedido programado con <30 min de margen:', corto.error ? 'SE RECHAZA (' + corto.error.message + ')' : 'se acepta')
}

if (modo === 'aislamiento') {
  console.log('— Aislamiento entre usuarios y secretos (API real)')
  const anonimo = createClient(url, anon, { auth: { persistSession: false } })
  const { data: todas } = await admin.from('reservas').select('id, cliente_id, trabajador_id')
  const deOtro = (todas ?? []).find((r) => r.cliente_id === c2.id)
  const ajenaAlProfesional = (todas ?? []).find((r) => r.trabajador_id !== w1.id && r.cliente_id !== w1.id)
  const push = (cli) => cli.rpc('fn_enviar_push', { p_user_ids: [c1.id], p_titulo: 'x', p_cuerpo: 'y', p_url: '/' })
  ok(!!(await push(c1.cliente)).error, 'authenticated no puede llamar fn_enviar_push')
  ok(!!(await push(anonimo)).error, 'anon no puede llamar fn_enviar_push')
  ok(!!(await anonimo.rpc('postularme_a_reserva', { p_reserva_id: randomUUID() })).error, 'anon no puede llamar postularme_a_reserva')
  const a = await anonimo.from('reservas').select('id')
  ok((a.data ?? []).length === 0, 'anon no ve reservas')
  if (deOtro) {
    const v = await c1.cliente.from('reservas').select('id').eq('id', deOtro.id)
    ok((v.data ?? []).length === 0, 'un cliente no ve la reserva de otro cliente')
    const pg = await c1.cliente.from('pagos').select('id').eq('reserva_id', deOtro.id)
    ok((pg.data ?? []).length === 0, 'un cliente no ve los pagos de otro')
    const pr = await c1.cliente.from('propuestas').select('id').eq('reserva_id', deOtro.id)
    ok((pr.data ?? []).length === 0, 'un cliente no ve las propuestas de otro')
  } else console.log('  · (omitido) no hay reservas de c2: crea datos con el modo "antiguo" primero')
  if (ajenaAlProfesional) {
    const v = await w1.cliente.from('reservas').select('id').eq('id', ajenaAlProfesional.id)
    ok((v.data ?? []).length === 0, 'un profesional no ve reservas ajenas')
  }
  const propia = (todas ?? []).find((r) => r.cliente_id === c1.id)
  if (propia) {
    const up = await c1.cliente.from('reservas').update({ total: 1 }).eq('id', propia.id).select('id')
    ok(!!up.error || (up.data ?? []).length === 0, 'un cliente no puede cambiar el total de su reserva')
    const up2 = await c1.cliente.from('reservas').update({ tarifa_hora: 1 }).eq('id', propia.id).select('id')
    ok(!!up2.error || (up2.data ?? []).length === 0, 'un cliente no puede cambiar la tarifa de su reserva')
  }
  const cfg = await c1.cliente.from('app_config').select('*')
  ok((cfg.data ?? []).length === 0, 'un cliente no puede leer app_config (secreto de push)')
}

console.log(`\n${pasos - fallos}/${pasos} verificaciones OK`)
process.exit(fallos ? 1 : 0)
