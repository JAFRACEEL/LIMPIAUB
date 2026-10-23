// Crea técnicos de oficios FICTICIOS en LIMPIA (piloto con datos de prueba), verificados y "Disponible ahora".
// Necesita TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_KEY y las dos confirmaciones en .env.test.local.
// Las contraseñas se generan al azar y se guardan SOLO en cuentas-demo.local.json (ignorado por Git).
// Uso: node supabase/tests/crear-tecnicos-demo.mjs   (se puede repetir: renueva la contraseña y la disponibilidad)
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.test.local', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const { TEST_SUPABASE_URL: url, TEST_SUPABASE_SERVICE_KEY: servicio } = env
if (!url || !servicio) {
  console.error('Falta TEST_SUPABASE_URL o TEST_SUPABASE_SERVICE_KEY en .env.test.local')
  process.exit(2)
}
if (env.TEST_CONFIRMO_ENTORNO_DE_PRUEBAS !== 'si' || env.TEST_PILOTO_LIMPIA !== 'si') {
  console.error('Rechazado: hacen falta TEST_CONFIRMO_ENTORNO_DE_PRUEBAS=si y TEST_PILOTO_LIMPIA=si.')
  process.exit(2)
}

const OFICIOS = ['Albañilería', 'Gasfitería', 'Electricidad', 'Pintura', 'Carpintería', 'Cerrajería', 'Vidriería y aluminio', 'Aire acondicionado', 'Mantenimiento y reparaciones generales']
const TECNICOS = [
  { correo: 'albanil.demo', nombre: 'Julio Albañil (demo)', servicios: ['Albañilería'], tarifa: 25 },
  { correo: 'gasfitero.demo', nombre: 'Marco Gasfitero (demo)', servicios: ['Gasfitería'], tarifa: 30 },
  { correo: 'electricista.demo', nombre: 'Luis Electricista (demo)', servicios: ['Electricidad'], tarifa: 35 },
  { correo: 'pintor.demo', nombre: 'Pedro Pintor (demo)', servicios: ['Pintura'], tarifa: 25 },
  { correo: 'carpintero.demo', nombre: 'Carlos Carpintero (demo)', servicios: ['Carpintería'], tarifa: 30 },
  { correo: 'cerrajero.demo', nombre: 'Raúl Cerrajero (demo)', servicios: ['Cerrajería'], tarifa: 30 },
  { correo: 'vidriero.demo', nombre: 'Víctor Vidriero (demo)', servicios: ['Vidriería y aluminio'], tarifa: 30 },
  { correo: 'aire.demo', nombre: 'Aldo Aire Acondicionado (demo)', servicios: ['Aire acondicionado'], tarifa: 40 },
  { correo: 'todero.demo', nombre: 'Tomás Todero (demo)', servicios: OFICIOS, tarifa: 28 },
]

const admin = createClient(url, servicio, { auth: { persistSession: false } })
const archivo = 'cuentas-demo.local.json'
const guardado = JSON.parse(fs.readFileSync(archivo, 'utf8'))
const ahora = new Date().toISOString()

for (const [i, t] of TECNICOS.entries()) {
  const email = `${t.correo}@prueba.limpi.test`
  const pass = randomBytes(9).toString('base64url')
  let id
  const { data, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error && !/already|registered/i.test(error.message)) throw error
  if (data?.user) id = data.user.id
  else {
    const lista = await admin.auth.admin.listUsers({ perPage: 200 })
    id = lista.data.users.find((u) => u.email === email).id
    const r = await admin.auth.admin.updateUserById(id, { password: pass })
    if (r.error) throw r.error
  }
  const celular = `95550${String(100 + i)}`.slice(0, 9)
  const p = await admin.from('perfiles').upsert({ id, rol: 'trabajador', nombre: t.nombre, telefono: celular, zona: 'Iquitos', direccion: 'Calle Ficticia 100' })
  if (p.error) throw p.error
  const w = await admin.from('trabajadores').upsert({
    id, numero_documento: `2000000${i + 1}`, zonas: ['Iquitos'], servicios: t.servicios, tarifa_hora: t.tarifa,
    kit_propio: true, verificado: true, disponible_ahora: true, ultima_actividad: ahora,
  })
  if (w.error) throw w.error
  guardado.cuentas[email] = pass
  console.log('  ✓', email, '→', t.servicios.join(', '))
}
fs.writeFileSync(archivo, JSON.stringify(guardado, null, 1))
console.log(`\n${TECNICOS.length} técnicos listos. Contraseñas en ${archivo}.`)
