// Flujo REAL por la API (GoTrue + PostgREST + RLS) con las cuentas DEMO sintéticas del piloto (LIMPIA, con la 0015 aplicada).
// Usa solo la clave pública de .env y las contraseñas de cuentas-demo.local.json (ignorado por Git). No imprime claves.
// Uso: node supabase/tests/flujo-demo-real.mjs   (deja una reserva completada de prueba por ejecución)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const { cuentas } = JSON.parse(fs.readFileSync('cuentas-demo.local.json', 'utf8'))
let pasos = 0, fallos = 0
const ok = (c, m) => { pasos++; if (!c) fallos++; console.log(c ? '  ✓' : '  ✗', m) }
const login = async (email) => {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: cuentas[email] })
  if (error) throw error
  return { c, id: data.user.id }
}
const cli = await login('clienta.demo@prueba.limpi.test'), rosa = await login('rosa.demo@prueba.limpi.test'), carmen = await login('carmen.demo@prueba.limpi.test')
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const dia = new Date(Date.now() + 9 * 86400_000).toISOString().slice(0, 10)

const cob = await anon.from('v_cobertura_servicios').select('*')
ok(!cob.error && cob.data.length > 0 && !('nombre' in cob.data[0]), 'anon lee la cobertura (solo conteos)')

const mal = await cli.c.from('reservas').insert({ cliente_id: cli.id, servicio: 'Electricidad', modalidad_precio: 'horas', fecha: dia, hora: '10:00', horas: 2, direccion: 'x', zona: 'Iquitos', modo: 'abierto' })
ok(!!mal.error, 'Electricidad por horas se rechaza: ' + (mal.error?.message ?? ''))
const dg = await cli.c.from('reservas').insert({ cliente_id: cli.id, servicio: 'Electricidad', modalidad_precio: 'diagnostico', fecha: dia, hora: '10:00', horas: 2, direccion: 'x', zona: 'Iquitos', modo: 'abierto' })
ok(!!dg.error, 'Electricidad por diagnóstico se rechaza mientras las propuestas estén apagadas')

const ins = await cli.c.from('reservas').insert({ cliente_id: cli.id, servicio: 'Limpieza básica del hogar', fecha: dia, hora: '14:00', horas: 4, direccion: 'Calle Ficticia 123', zona: 'Iquitos', modo: 'abierto', programacion: 'programada', con_materiales: true, total: 1, tarifa_hora: 1, comision_pct: 0, pago_confirmado: true }).select('*').single()
ok(!ins.error && Number(ins.data.comision_pct) === 20 && ins.data.pago_confirmado === false && ins.data.total === null && Number(ins.data.recargo_materiales) === 18, 'pedido abierto: el servidor ignora precio, comisión y pago del navegador; kit = 18' + (ins.error ? ' ' + ins.error.message : ''))
const id = ins.data?.id
const pr = await rosa.c.rpc('postularme_a_reserva', { p_reserva_id: id }); const pc = await carmen.c.rpc('postularme_a_reserva', { p_reserva_id: id })
ok(!pr.error && !pc.error, 'dos profesionales se postulan: ' + (pr.error?.message ?? '') + (pc.error?.message ?? ''))
const { data: props } = await cli.c.from('propuestas').select('*').eq('reserva_id', id)
ok(props?.length === 2 && props.map((p) => Number(p.mano_obra)).sort((a, b) => a - b).join() === '60,72', 'la clienta ve 2 propuestas con precio de cada una (S/60 y S/72)')
const otra = await rosa.c.from('propuestas').select('id').eq('reserva_id', id)
ok((otra.data ?? []).every((p) => props.find((x) => x.id === p.id)?.trabajador_id === rosa.id), 'una profesional solo ve su propia propuesta')
const asig = await cli.c.from('reservas').update({ trabajador_id: rosa.id, estado: 'aceptada' }).eq('id', id).select()
ok(!!asig.error || !asig.data?.length, 'no se puede asignar con un UPDATE directo')
const propRosa = props.find((p) => p.trabajador_id === rosa.id)
const ajena = await rosa.c.rpc('contratar_propuesta', { p_propuesta_id: propRosa.id })
ok(!!ajena.error, 'una profesional no puede contratarse a sí misma')
const con = await cli.c.rpc('contratar_propuesta', { p_propuesta_id: propRosa.id })
ok(!con.error, 'la clienta contrata la propuesta de Rosa: ' + (con.error?.message ?? ''))
const { data: r } = await cli.c.from('reservas').select('estado, trabajador_id, total, total_cliente, tarifa_hora').eq('id', id).single()
ok(r.estado === 'aceptada' && r.trabajador_id === rosa.id && Number(r.total) === 78 && Number(r.total_cliente) === 78, `reserva aceptada; total = 15 × 4 + kit 18 = 78 (real: ${r.total})`)
const pg = await cli.c.rpc('registrar_pago', { p_reserva_id: id, p_metodo: 'yape', p_referencia: 'OP-DEMO-1' })
ok(!pg.error, 'la clienta registra el pago (queda pendiente de verificación): ' + (pg.error?.message ?? ''))
const conf = await cli.c.rpc('confirmar_pago', { p_pago_id: pg.data, p_confirmar: true, p_motivo: null })
ok(!!conf.error, 'la clienta NO puede confirmar su propio pago')
const { data: rr } = await cli.c.from('reservas').select('pago_confirmado').eq('id', id).single()
ok(rr.pago_confirmado === false, 'pago_confirmado sigue en false')
const paso = async (u, d, h) => (await u.c.from('reservas').update({ estado: h }).eq('id', id).eq('estado', d).select('id')).data?.length === 1
ok(await paso(rosa, 'aceptada', 'en_camino') && await paso(rosa, 'en_camino', 'en_curso') && await paso(rosa, 'en_curso', 'completada'), 'ciclo de la profesional: en camino → en curso → completada')
const hist = await cli.c.from('reservas').select('id').neq('cliente_id', cli.id)
ok((hist.data ?? []).length === 0, 'la clienta no ve reservas de otros clientes')
console.log(`\n${pasos - fallos}/${pasos} verificaciones OK`)
process.exit(fallos ? 1 : 0)

