// PRUEBA DE INTEGRACIÓN REAL contra un proyecto Supabase DE PRUEBAS (GoTrue + PostgREST + RLS reales).
// ESTADO: escrita pero NO EJECUTADA todavía (no existe un proyecto de pruebas). Revisarla al primer uso.
//
// Qué aporta que la prueba en PGlite (migracion-0015.mjs) no puede dar: sesiones reales (JWT firmados por
// GoTrue), permisos reales de PostgREST (anon/authenticated), RLS a través de la API y notificaciones por
// los triggers con pg_net presente.
//
// PREPARACIÓN (en un proyecto NUEVO, nunca el de producción):
//   1. SQL Editor: schema.sql y migraciones 0001 a 0014, en orden.
//   2. node supabase/tests/integracion-real.mjs sembrar     <- crea usuarios y reservas ANTERIORES a la 0015
//   3. SQL Editor: migración 0015 (así se prueba la migración con datos viejos).
//   4. node supabase/tests/integracion-real.mjs verificar
// Variables: TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_KEY y
// TEST_CONFIRMO_ENTORNO_DE_PRUEBAS=si. Se niega a correr contra el proyecto de producción de Limpi.
import { createClient } from '@supabase/supabase-js'

const url = process.env.TEST_SUPABASE_URL
const anon = process.env.TEST_SUPABASE_ANON_KEY
const servicio = process.env.TEST_SUPABASE_SERVICE_KEY
const modo = process.argv[2]
if (!url || !anon || !servicio || !['sembrar', 'verificar'].includes(modo)) {
  console.error('Uso: node integracion-real.mjs <sembrar|verificar> con TEST_SUPABASE_URL / _ANON_KEY / _SERVICE_KEY')
  process.exit(2)
}
// LIMPIA solo se admite como piloto con datos de prueba, autorizado por el dueño el 2026-10-17 (TEST_PILOTO_LIMPIA=si).
if ((url.includes('ztlxmdeviurdhqyabhvb') && process.env.TEST_PILOTO_LIMPIA !== 'si') || process.env.TEST_CONFIRMO_ENTORNO_DE_PRUEBAS !== 'si') {
  console.error('Rechazado: hace falta TEST_CONFIRMO_ENTORNO_DE_PRUEBAS=si, y contra LIMPIA además TEST_PILOTO_LIMPIA=si.')
  process.exit(2)
}

import http from 'node:http'
import { randomUUID } from 'node:crypto'

const admin = createClient(url, servicio, { auth: { persistSession: false } })
// Contraseña aleatoria por ejecución (nunca fija en el repositorio): `verificar` la renueva para los usuarios de prueba.
const PASS = randomUUID()
const correos = { c1: 'cliente1@prueba.limpi.test', c2: 'cliente2@prueba.limpi.test', w1: 'pro1@prueba.limpi.test', w2: 'pro2@prueba.limpi.test', adm: 'admin@prueba.limpi.test' }
const manana = new Date(Date.now() + 86400_000).toISOString().slice(0, 10)

let pasos = 0, fallos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }

async function usuario(clave) {
  const { data, error } = await admin.auth.admin.createUser({ email: correos[clave], password: PASS, email_confirm: true })
  if (error && !/already/i.test(error.message)) throw error
  if (data?.user) return data.user.id
  const lista = await admin.auth.admin.listUsers({ perPage: 200 })
  return lista.data.users.find((u) => u.email === correos[clave]).id
}
async function sesion(clave) {
  const id = await usuario(clave)
  const { error: errorClave } = await admin.auth.admin.updateUserById(id, { password: PASS })
  if (errorClave) throw errorClave
  const c = createClient(url, anon, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email: correos[clave], password: PASS })
  if (error) throw error
  return { cliente: c, id: data.user.id, token: data.session.access_token }
}

if (modo === 'sembrar') {
  const ids = {}
  for (const k of Object.keys(correos)) ids[k] = await usuario(k)
  await admin.from('perfiles').upsert([
    { id: ids.c1, rol: 'cliente', nombre: 'Cliente Uno', telefono: '911111111', zona: 'Iquitos', direccion: 'Jr. Lima 1' },
    { id: ids.c2, rol: 'cliente', nombre: 'Cliente Dos', telefono: '911111112', zona: 'Iquitos', direccion: 'Jr. Lima 2' },
    { id: ids.w1, rol: 'trabajador', nombre: 'Pro Uno', telefono: '922222221', zona: 'Iquitos', direccion: 'x' },
    { id: ids.w2, rol: 'trabajador', nombre: 'Pro Dos', telefono: '922222222', zona: 'Iquitos', direccion: 'x' },
    { id: ids.adm, rol: 'admin', nombre: 'Admin', telefono: '933333333', zona: 'Iquitos', direccion: 'x' },
  ])
  await admin.from('trabajadores').upsert([
    { id: ids.w1, numero_documento: '10000001', zonas: ['Iquitos'], servicios: ['Limpieza básica del hogar', 'Electricidad'], tarifa_hora: 15, kit_propio: true, verificado: true },
    { id: ids.w2, numero_documento: '10000002', zonas: ['Iquitos'], servicios: ['Limpieza básica del hogar'], tarifa_hora: 20, kit_propio: true, verificado: true },
  ])
  await admin.from('trabajadores').update({ disponible_ahora: true, ultima_actividad: new Date().toISOString() }).in('id', [ids.w1, ids.w2])
  // Reservas con el formato de ANTES de la 0015 (sin columnas nuevas)
  const { error } = await admin.from('reservas').insert([
    { cliente_id: ids.c1, trabajador_id: ids.w2, servicio: 'Limpieza básica del hogar', fecha: '2026-01-10', hora: '09:00', horas: 3, direccion: 'Jr. Vieja', zona: 'Iquitos', tarifa_hora: 20, estado: 'completada', modo: 'directo' },
    { cliente_id: ids.c2, servicio: 'Limpieza básica del hogar', fecha: manana, hora: '07:00', horas: 2, direccion: 'Jr. Vieja 2', zona: 'Iquitos', estado: 'solicitada', modo: 'abierto', ventana_cierra_en: new Date(Date.now() + 3600_000).toISOString() },
  ])
  if (error) throw error
  console.log('Sembrado. Ahora aplica la migración 0015 y corre: node integracion-real.mjs verificar')
  process.exit(0)
}

// ---------------- verificar ----------------
const c1 = await sesion('c1'), c2 = await sesion('c2'), w1 = await sesion('w1'), w2 = await sesion('w2'), adm = await sesion('adm')
const anonimo = createClient(url, anon, { auth: { persistSession: false } })

// Servidor que hace de "Edge Function": captura lo que los triggers mandan por pg_net. Solo si se indica un host
// alcanzable desde la base (con Docker Desktop: TEST_PUSH_CAPTURE_HOST=host.docker.internal).
const capturados = []
const servidorCaptura = http.createServer((req, res) => {
  let cuerpo = ''
  req.on('data', (d) => (cuerpo += d))
  req.on('end', () => {
    try { capturados.push({ secreto: req.headers['x-push-secret'], ...JSON.parse(cuerpo) }) } catch { /* ignorar */ }
    res.end('ok')
  })
})
const hostCaptura = process.env.TEST_PUSH_CAPTURE_HOST
if (hostCaptura) {
  await new Promise((r) => servidorCaptura.listen(0, '0.0.0.0', r))
  const { port } = servidorCaptura.address()
  await admin.from('app_config').update({ push_function_url: `http://${hostCaptura}:${port}/`, push_function_secret: 'secreto-de-prueba' }).eq('id', true)
}
const esperar = async (cond, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { if (cond()) return true; await new Promise((r) => setTimeout(r, 400)) } return cond() }

console.log('— Reservas anteriores tras la 0015')
{
  const { data } = await c1.cliente.from('reservas').select('total, total_cliente, modalidad_precio, estado').eq('estado', 'completada')
  ok(data?.length >= 1 && Number(data[0].total) === 60 && Number(data[0].total_cliente) === 60 && data[0].modalidad_precio === 'horas', 'la reserva anterior conserva su total (60) y queda "por horas"')
}

console.log('— Permisos y reglas por la API real')
{
  const { data: cob } = await anonimo.from('v_cobertura_servicios').select('*')
  ok(Array.isArray(cob) && !('nombre' in (cob[0] ?? {})), 'anon puede leer la cobertura (solo conteos)')
  const r1 = await c1.cliente.rpc('fn_enviar_push', { p_user_ids: [c1.id], p_titulo: 'x', p_cuerpo: 'y', p_url: '/' })
  ok(!!r1.error, 'authenticated no puede llamar fn_enviar_push por la API')
  const r2 = await c1.cliente.from('reservas').insert({ cliente_id: c1.id, servicio: 'Electricidad', modalidad_precio: 'horas', fecha: manana, hora: '10:00', horas: 2, direccion: 'x', zona: 'Iquitos', modo: 'abierto' })
  ok(!!r2.error, 'Electricidad por horas se rechaza')
  const r3 = await c1.cliente.from('reservas').insert({ cliente_id: c1.id, servicio: 'Electricidad', modalidad_precio: 'diagnostico', fecha: manana, hora: '10:00', horas: 2, direccion: 'x', zona: 'Iquitos', modo: 'abierto' })
  ok(!!r3.error, 'Electricidad por diagnóstico se rechaza mientras las propuestas estén apagadas')
  const rg = await c1.cliente.from('reservas').insert({ cliente_id: c1.id, servicio: 'Mantenimiento y reparaciones generales', descripcion_trabajo: 'Quiero cambiar un enchufe', modalidad_precio: 'horas', fecha: manana, hora: '10:00', horas: 2, direccion: 'x', zona: 'Iquitos', modo: 'abierto' })
  ok(!!rg.error, '"Reparaciones generales" rechaza un trabajo de electricidad (no es un atajo por horas)')
  const r4 = await c1.cliente.from('app_config').update({ propuestas_activas: true }).eq('id', true).select()
  ok(!r4.data?.length, 'un cliente no puede activar las propuestas')
}

console.log('— Pedido abierto, postulación, contratación')
let reservaId
{
  const ins = await c1.cliente.from('reservas').insert({ cliente_id: c1.id, servicio: 'Limpieza básica del hogar', fecha: manana, hora: '14:00', horas: 4, direccion: 'Jr. X', zona: 'Iquitos', modo: 'abierto', programacion: 'programada', total: 1, tarifa_hora: 1, comision_pct: 0, pago_confirmado: true }).select('*').single()
  ok(!ins.error && ins.data.total === null && Number(ins.data.comision_pct) === 20 && ins.data.pago_confirmado === false, 'el servidor ignora precio, comisión y pago_confirmado enviados por el navegador')
  reservaId = ins.data?.id
  const p1 = await w1.cliente.rpc('postularme_a_reserva', { p_reserva_id: reservaId })
  const p2 = await w2.cliente.rpc('postularme_a_reserva', { p_reserva_id: reservaId })
  ok(!p1.error && !p2.error, 'dos profesionales se postulan')
  const { data: props } = await c1.cliente.from('propuestas').select('*').eq('reserva_id', reservaId)
  ok(props?.length === 2 && props.map((p) => Number(p.mano_obra)).sort().join() === '60,80', 'el cliente ve las dos propuestas con la tarifa de cada una')
  const { data: ajenas } = await c2.cliente.from('propuestas').select('id').eq('reserva_id', reservaId)
  ok((ajenas ?? []).length === 0, 'otro cliente no ve esas propuestas (RLS real)')
  const asigna = await c1.cliente.from('reservas').update({ trabajador_id: w1.id, estado: 'aceptada' }).eq('id', reservaId).select()
  ok(!!asigna.error || !asigna.data?.length, 'no se puede asignar con un UPDATE directo')
  const propia = props.find((p) => p.trabajador_id === w1.id)
  const ajena = await c2.cliente.rpc('contratar_propuesta', { p_propuesta_id: propia.id })
  ok(!!ajena.error, 'otro cliente no puede contratar la propuesta')
  const contrata = await c1.cliente.rpc('contratar_propuesta', { p_propuesta_id: propia.id })
  ok(!contrata.error, 'el cliente contrata la propuesta de W1: ' + (contrata.error?.message ?? ''))
  const { data: r } = await c1.cliente.from('reservas').select('estado, trabajador_id, total, total_cliente').eq('id', reservaId).single()
  ok(r.estado === 'aceptada' && r.trabajador_id === w1.id && Number(r.total_cliente) === 60, 'reserva asignada con total 60')
}

console.log('— Pagos')
{
  const reg = await c1.cliente.rpc('registrar_pago', { p_reserva_id: reservaId, p_metodo: 'yape', p_referencia: 'OP-1', p_evidencia_ruta: null })
  ok(!reg.error, 'el cliente registra el pago: ' + (reg.error?.message ?? ''))
  const { data: antes } = await c1.cliente.from('reservas').select('pago_confirmado').eq('id', reservaId).single()
  ok(antes.pago_confirmado === false, 'registrar no confirma')
  const auto = await c1.cliente.rpc('confirmar_pago', { p_pago_id: reg.data, p_confirmar: true, p_motivo: null })
  ok(!!auto.error, 'el cliente no puede confirmar su pago')
  const edit = await c1.cliente.from('pagos').update({ estado: 'confirmado' }).eq('id', reg.data).select()
  ok(!edit.data?.length, 'el cliente no puede editar pagos (RLS)')
  const conf = await adm.cliente.rpc('confirmar_pago', { p_pago_id: reg.data, p_confirmar: true, p_motivo: null })
  ok(!conf.error, 'el admin confirma el pago')
  const { data: desp } = await c1.cliente.from('reservas').select('pago_confirmado').eq('id', reservaId).single()
  ok(desp.pago_confirmado === true, 'pago_confirmado = true solo tras el admin')
}

console.log('— Notificaciones: del trigger al HTTP (NO es entrega de push)')
if (!hostCaptura) {
  console.log('  (omitido) Falta TEST_PUSH_CAPTURE_HOST: no se pudo verificar que los triggers llegan a pg_net. Cuenta como NO verificado.')
} else {
  const recibio = (titulo, usuario) => capturados.some((c) => c.titulo === titulo && (c.user_ids ?? []).includes(usuario))
  await esperar(() => recibio('Pago confirmado', c1.id))
  ok(recibio('Nueva postulación', c1.id), 'postulación -> el cliente recibe la solicitud de aviso')
  ok(recibio('¡Te eligieron!', w1.id), 'contratación -> el profesional recibe la solicitud de aviso')
  ok(recibio('Pago confirmado', c1.id), 'confirmar pago -> el cliente recibe la solicitud de aviso')
  ok(capturados.length > 0 && capturados.every((c) => c.secreto === 'secreto-de-prueba'), 'todas llevan el secreto compartido (x-push-secret)')
  console.log('  (!) Esto prueba trigger -> pg_net -> HTTP. NO prueba la Edge Function send-push, el servicio push del navegador ni la llegada a un celular.')
}
servidorCaptura.close()

console.log(`\n${pasos - fallos}/${pasos} verificaciones OK`)
process.exit(fallos ? 1 : 0)
