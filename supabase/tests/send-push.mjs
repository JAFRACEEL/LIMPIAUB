// Prueba de la Edge Function send-push POR SEPARADO (sin Supabase ni Deno):
//   - se ejecuta el código real de supabase/functions/send-push/index.ts con un Deno simulado;
//   - usa la librería web-push REAL (VAPID y cifrado de verdad) contra un servicio push SIMULADO local (HTTPS con certificado
//     autofirmado; NODE_TLS_REJECT_UNAUTHORIZED=0 solo dentro de este proceso);
//   - la base de datos es una réplica en memoria de push_subscriptions.
// Uso:  npm i --no-save web-push@3.6.7   y luego   node supabase/tests/send-push.mjs
//
// QUÉ DEMUESTRA: autorización, entradas inválidas, suscripciones vencidas (404/410), errores del proveedor (4xx/5xx/429/red/
// cuelgue) y que la petición al proveedor lleva VAPID y cifrado bien formados.
// QUÉ NO DEMUESTRA: que Google/Apple/Mozilla acepten nuestras claves, el entorno real de Deno/Supabase (imports `npm:`,
// variables de entorno, límites de tiempo), ni la llegada de una notificación a un celular.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import https from 'node:https'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0' // solo para hablar con el servicio push simulado

let fallos = 0, pasos = 0
const ok = (cond, msg) => { pasos++; if (!cond) { fallos++; console.log('  ✗', msg) } else console.log('  ✓', msg) }

let webpush
try { webpush = (await import('web-push')).default } catch {
  console.error('Falta web-push. Ejecuta: npm i --no-save web-push@3.6.7')
  process.exit(2)
}

const aquí = path.dirname(fileURLToPath(import.meta.url))
const fuente = fs.readFileSync(path.join(aquí, '..', 'functions', 'send-push', 'index.ts'), 'utf8')

// ---------- Servicio push simulado (HTTPS) ----------
function openssl() {
  for (const exe of ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', '/usr/bin/openssl']) {
    try { execFileSync(exe, ['version'], { stdio: 'ignore' }); return exe } catch { /* siguiente */ }
  }
  return null
}
const exe = openssl()
if (!exe) { console.error('No encontré openssl para el certificado autofirmado del servicio simulado.'); process.exit(2) }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'send-push-'))
execFileSync(exe, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(tmp, 'k.pem'), '-out', path.join(tmp, 'c.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' })
const peticiones = []
const servidor = https.createServer({ key: fs.readFileSync(path.join(tmp, 'k.pem')), cert: fs.readFileSync(path.join(tmp, 'c.pem')) }, (req, res) => {
  const trozos = []
  req.on('data', (d) => trozos.push(d))
  req.on('end', () => {
    peticiones.push({ ruta: req.url, cabeceras: req.headers, bytes: Buffer.concat(trozos).length })
    const ruta = req.url.split('/')[1]
    const estados = { ok: 201, gone: 410, noexiste: 404, limite: 429, caido: 500, malo: 400, grande: 413, rechazado: 403, sinauth: 401 }
    if (ruta === 'cuelga') return // no responde nunca
    res.writeHead(estados[ruta] ?? 201, ruta === 'limite' ? { 'retry-after': '30' } : {})
    res.end()
  })
})
await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
const origen = `https://127.0.0.1:${servidor.address().port}`

// ---------- Datos de prueba ----------
const vapid = webpush.generateVAPIDKeys()
function suscripcionValida(ruta, id) {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  return { id, endpoint: `${origen}/${ruta}/token-secreto-${id}`, p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url'), user_id: USUARIO }
}
const USUARIO = '11111111-1111-1111-1111-111111111111'
const SECRETO = 'secreto-de-prueba-1234567890'

// ---------- Cargar la función con un Deno y una base simulados ----------
let version = 0
async function cargar(entorno = {}) {
  version += 1
  const env = { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:prueba@limpi.test', PUSH_TRIGGER_SECRET: SECRETO, PUSH_TIMEOUT_MS: '700', ...entorno }
  const db = { subs: [], lecturas: 0, borrados: [], errorLectura: null }
  globalThis.__fakeSupabase = () => ({
    from: () => ({
      select: () => ({ in: async (_col, ids) => { db.lecturas += 1; return db.errorLectura ? { data: null, error: { message: db.errorLectura } } : { data: db.subs.filter((s) => ids.includes(s.user_id)), error: null } } }),
      delete: () => ({ in: async (_col, ids) => { db.borrados.push(...ids); db.subs = db.subs.filter((s) => !ids.includes(s.id)); return { error: null } } }),
    }),
  })
  let manejador
  globalThis.Deno = { env: { get: (k) => (k in env ? env[k] : undefined) }, serve: (fn) => { manejador = fn } }
  const codigo = fuente
    .replace("import webpush from 'npm:web-push@3.6.7'", "import webpush from 'web-push'")
    .replace("import { createClient } from 'npm:@supabase/supabase-js@2'", 'const createClient = (...a) => globalThis.__fakeSupabase(...a)')
  const archivo = path.join(aquí, `.tmp-send-push-${process.pid}-${version}.ts`)
  fs.writeFileSync(archivo, codigo)
  try { await import(pathToFileURL(archivo).href) } finally { fs.rmSync(archivo, { force: true }) }
  const llamar = (cuerpo, { metodo = 'POST', secreto = SECRETO, crudo = false } = {}) =>
    manejador(new Request('http://funcion.local/', { method: metodo, headers: secreto === null ? {} : { 'x-push-secret': secreto, 'content-type': 'application/json' }, body: metodo === 'GET' ? undefined : crudo ? cuerpo : JSON.stringify(cuerpo) }))
  return { db, llamar }
}
const aviso = (extra = {}) => ({ user_ids: [USUARIO], titulo: 'Nuevo pedido directo', cuerpo: 'Tienes 15 min para aceptar', url: '/panel', ...extra })
const json = async (r) => { try { return await r.clone().json() } catch { return null } }
const errores = []
const consolaOriginal = console.error
console.error = (...a) => { errores.push(a.join(' ')) }

// ======================= AUTORIZACIÓN =======================
console.log('— Autorización')
{
  const f = await cargar()
  f.db.subs = [suscripcionValida('ok', 's1')]
  ok((await f.llamar(aviso(), { metodo: 'GET' })).status === 405, 'GET → 405')
  ok((await f.llamar(aviso(), { secreto: null })).status === 401, 'sin cabecera x-push-secret → 401')
  ok((await f.llamar(aviso(), { secreto: 'otro-secreto' })).status === 401, 'secreto equivocado → 401')
  ok((await f.llamar(aviso(), { secreto: SECRETO + 'x' })).status === 401, 'secreto con un carácter de más → 401')
  ok((await f.llamar(aviso(), { secreto: SECRETO.slice(0, -1) })).status === 401, 'secreto con un carácter de menos → 401')
  ok((await f.llamar(aviso(), { secreto: '' })).status === 401, 'secreto vacío → 401')
  ok(f.db.lecturas === 0 && peticiones.length === 0, 'las peticiones no autorizadas NO tocan la base ni llaman al proveedor')
  const sinSecretoConfigurado = await cargar({ PUSH_TRIGGER_SECRET: '' })
  ok((await sinSecretoConfigurado.llamar(aviso(), { secreto: '' })).status === 401, 'si el servidor no tiene secreto configurado, ni una cabecera vacía entra')
  const sinVapid = await cargar({ VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' })
  ok((await sinVapid.llamar(aviso())).status === 500, 'con el secreto correcto pero sin VAPID configurado → 500 (y no envía nada)')
  ok((await f.llamar(aviso())).status === 200, 'con el secreto correcto → 200')
}

// ======================= ENTRADAS INVÁLIDAS =======================
console.log('\n— Entradas inválidas')
{
  const f = await cargar()
  f.db.subs = [suscripcionValida('ok', 's1')]
  const antes = peticiones.length
  ok((await f.llamar('{no es json', { crudo: true })).status === 400, 'JSON mal formado → 400')
  for (const [nombre, cuerpo] of [['null', null], ['un número', 42], ['un texto', 'hola'], ['una lista', [1, 2]]]) {
    const r = await f.llamar(cuerpo)
    ok(r.status === 400, `JSON válido pero ${nombre} → 400 (antes era un error 500)`)
  }
  ok((await f.llamar(aviso({ titulo: 123 }))).status === 400, 'título que no es texto → 400')
  ok((await f.llamar(aviso({ cuerpo: { a: 1 } }))).status === 400, 'cuerpo que no es texto → 400')
  for (const [nombre, ids] of [['no es lista', 'abc'], ['lista vacía', []], ['ids que no son uuid', ['no-uuid', '1; drop table x', '']], ['objetos y números', [{ a: 1 }, 7, null]]]) {
    const r = await f.llamar(aviso({ user_ids: ids }))
    const c = await json(r)
    ok(r.status === 200 && c?.enviados === 0, `user_ids ${nombre} → 200 sin enviar nada`)
  }
  ok(f.db.lecturas === 0, 'ningún id inválido llega a la base de datos')
  ok(peticiones.length === antes, 'ni al proveedor')
  const sinTexto = await f.llamar(aviso({ titulo: '', cuerpo: '' }))
  ok(sinTexto.status === 200 && (await json(sinTexto)).enviados === 0, 'título o cuerpo vacíos → 200 sin enviar')
  f.db.errorLectura = 'fallo de la base'
  ok((await f.llamar(aviso())).status === 500, 'si la base falla al leer las suscripciones → 500')
}

// ======================= PROVEEDOR REAL (SIMULADO) =======================
console.log('\n— Petición al proveedor (web-push real: VAPID y cifrado)')
{
  const f = await cargar()
  f.db.subs = [suscripcionValida('ok', 's-ok')]
  peticiones.length = 0
  const r = await f.llamar(aviso({ url: 'https://sitio-malo.example/robo' }))
  const c = await json(r)
  ok(r.status === 200 && c.enviados === 1 && c.eliminados === 0 && c.fallidos === 0, `201 del proveedor → enviados 1 (${JSON.stringify(c)})`)
  const p = peticiones[0]
  ok(p.cabeceras['content-encoding'] === 'aes128gcm' && p.bytes > 0, 'el cuerpo viaja cifrado (aes128gcm) y no vacío')
  ok(/^vapid t=.+, k=.+$/.test(p.cabeceras.authorization ?? ''), 'lleva autorización VAPID (t=JWT, k=clave pública)')
  ok((p.cabeceras.authorization ?? '').includes(`k=${vapid.publicKey}`), 'la clave pública VAPID es la configurada')
  const jwt = (p.cabeceras.authorization.match(/t=([^,]+)/) ?? [])[1] ?? ''
  const carga = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString() || '{}')
  ok(carga.aud === origen && carga.sub === 'mailto:prueba@limpi.test', 'el JWT apunta al origen del servicio push y al contacto configurado')
  ok(p.cabeceras.ttl !== undefined, 'lleva TTL')
}

console.log('\n— Suscripciones vencidas y errores del proveedor')
{
  const f = await cargar()
  const casos = [['gone', 410], ['noexiste', 404]]
  for (const [ruta, estado] of casos) {
    f.db.subs = [suscripcionValida(ruta, `s-${ruta}`)]
    f.db.borrados.length = 0
    const c = await json(await f.llamar(aviso()))
    ok(c.eliminados === 1 && f.db.borrados.includes(`s-${ruta}`) && f.db.subs.length === 0, `${estado} → la suscripción vencida se borra`)
  }
  for (const [ruta, estado] of [['limite', 429], ['caido', 500], ['malo', 400], ['grande', 413], ['rechazado', 403], ['sinauth', 401]]) {
    f.db.subs = [suscripcionValida(ruta, `s-${ruta}`)]
    f.db.borrados.length = 0
    errores.length = 0
    const c = await json(await f.llamar(aviso()))
    ok(c.enviados === 0 && c.eliminados === 0 && c.fallidos === 1 && f.db.subs.length === 1, `${estado} → NO se borra la suscripción, se cuenta como fallida`)
    ok(errores.some((e) => e.includes(`"statusCode":${estado}`)) && !errores.join(' ').includes('token-secreto'), `${estado} → queda registro del fallo sin exponer la ruta secreta del endpoint`)
  }
  // Mezcla: una buena, una vencida, una con error, una caída de red, una que cuelga
  f.db.subs = [suscripcionValida('ok', 'a'), suscripcionValida('gone', 'b'), suscripcionValida('caido', 'c'), { ...suscripcionValida('ok', 'd'), endpoint: 'https://127.0.0.1:1/x' }, suscripcionValida('cuelga', 'e')]
  f.db.borrados.length = 0
  const inicio = Date.now()
  const c = await json(await f.llamar(aviso()))
  const duracion = Date.now() - inicio
  ok(c.enviados === 1 && c.eliminados === 1 && c.fallidos === 3, `mezcla: 1 enviada, 1 borrada, 3 fallidas (${JSON.stringify(c)})`)
  ok(f.db.subs.map((s) => s.id).sort().join() === 'a,c,d,e', 'solo se borra la vencida; el resto se conserva')
  ok(duracion < 3000, `un proveedor que cuelga no bloquea a los demás: responde por timeout en ${duracion} ms`)
  // Suscripción con claves inválidas: falla sin romper la función
  f.db.subs = [{ ...suscripcionValida('ok', 'z'), p256dh: 'no-es-una-clave', auth: 'x' }]
  const mala = await f.llamar(aviso())
  const cm = await json(mala)
  ok(mala.status === 200 && cm.enviados === 0 && cm.fallidos === 1 && f.db.subs.length === 1, 'claves de suscripción inválidas → fallida, no tumba la función ni se borra')
}

console.error = consolaOriginal
servidor.close()
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${pasos - fallos}/${pasos} verificaciones OK`)
process.exit(fallos ? 1 : 0)
