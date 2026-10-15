// Comprueba por la API REST (PostgREST) si un visitante anónimo puede llamar a fn_enviar_push.
// ESTADO: escrito, NO ejecutado. Úsalo primero en limpia-test.
//
// SIN EFECTOS: siempre envía p_user_ids = [] (lista vacía). Con lista vacía la función retorna de inmediato, sin leer app_config ni
// llamar a pg_net, así que no se envía ningún aviso aunque la función esté abierta. El script no admite otros parámetros.
//
// Uso:  node --env-file=.env.test.local supabase/tests/fn-enviar-push-api.mjs <abierto|cerrado>
//   abierto  = se espera que la llamada SE ACEPTE (estado previo al parche)
//   cerrado  = se espera 401/403/404 (permission denied) (estado posterior al parche)
// Variables: TEST_SUPABASE_URL y TEST_SUPABASE_ANON_KEY (la clave pública). No usa claves de servicio.
const esperado = process.argv[2]
const url = process.env.TEST_SUPABASE_URL, anon = process.env.TEST_SUPABASE_ANON_KEY
if (!['abierto', 'cerrado'].includes(esperado) || !url || !anon) {
  console.error('Uso: node --env-file=.env.test.local fn-enviar-push-api.mjs <abierto|cerrado>  (TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY)'); process.exit(2)
}
const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/fn_enviar_push`, {
  method: 'POST',
  headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_user_ids: [], p_titulo: 'prueba-sin-efecto', p_cuerpo: 'prueba-sin-efecto', p_url: '/' }),
})
const texto = (await r.text()).slice(0, 200)
const aceptada = r.status >= 200 && r.status < 300
const rechazada = [401, 403, 404].includes(r.status)
console.log(`HTTP ${r.status} ${texto}`)
if (esperado === 'abierto') { console.log(aceptada ? '✓ la llamada anónima se acepta (función abierta, como se esperaba antes del parche)' : '✗ se esperaba que se aceptara'); process.exit(aceptada ? 0 : 1) }
console.log(rechazada ? '✓ la llamada anónima se rechaza (cerrada)' : '✗ se esperaba 401/403/404'); process.exit(rechazada ? 0 : 1)
