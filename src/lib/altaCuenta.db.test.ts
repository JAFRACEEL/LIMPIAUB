// Alta de cuenta contra la base REAL de las migraciones (PGlite en memoria, con la 0016 aplicada) usando las MISMAS filas que arma la app.
// Necesita PGlite, que no es dependencia del proyecto:  npm i --no-save @electric-sql/pglite   (si no está, estas pruebas se omiten).
// "Sin sesión" = rol anon: es lo que ve la base cuando el correo no está confirmado, porque Supabase no entrega JWT hasta confirmar.
import { beforeAll, describe, expect, it } from 'vitest'
import {
  datosClienteDesdeMetadata,
  errorContacto,
  filaPerfilCliente,
  filaPerfilProfesional,
  filaTrabajador,
  metadataCliente,
  type FormProfesional,
  type RutasArchivos,
} from './altaCuenta'
import { cambiosPerfilAlCompletar } from './perfilProfesional'
import sql0016a from '../../supabase/hotfix/0016a_proteger_rol_perfiles.sql?raw'
import sql0016b from '../../supabase/hotfix/0016b_alta_tecnico_pendiente.sql?raw'
import sql0016 from '../../supabase/migrations/0016_roles_por_capacidades.sql?raw'

/* eslint-disable @typescript-eslint/no-explicit-any */
let crearBase: ((o: { hasta: number }) => Promise<any>) | undefined
try {
  const url = new URL('../../supabase/tests/arnes.mjs', import.meta.url).href
  crearBase = (await import(/* @vite-ignore */ url)).crearBase
} catch {
  crearBase = undefined
}

const U = (n: number) => `00000000-0000-0000-0000-00000000000${n}`
const CLIENTE = U(1), PRO = U(2), ABANDONO = U(3), SIN_CONFIRMAR = U(4), OTRO = U(5), SIN_PERFIL = U(6)

let db: any
async function como<T>(uid: string | null, fn: () => Promise<T>, role = 'authenticated'): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid ?? ''}',false), set_config('request.jwt.claim.role','${role}',false)`)
  await db.exec(`set role ${role}`)
  try { return await fn() } finally { await db.exec('reset role') }
}
async function insertar(tabla: string, fila: Record<string, unknown>) {
  const cols = Object.keys(fila)
  await db.query(`insert into ${tabla} (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(fila))
}
const subirArchivo = (bucket: string, ruta: string) => insertar('storage.objects', { bucket_id: bucket, name: ruta })
const cuenta = async (sql: string) => Number((await db.query(sql)).rows[0].n)
const rechaza = async (fn: () => Promise<unknown>) => { try { await fn(); return false } catch { return true } }

const FORM: FormProfesional = {
  genero: 'femenino', nacionalidad: 'extranjera', tipoDocumento: 'carne_extranjeria', numeroDocumento: 'X1234567', zonas: ['Belén', 'Punchana'],
  servicios: ['Electricidad'], tarifaHora: 30, experiencia: 'Cinco años', antecedentes: 'vigente', cuentaAutorizacion: 'si',
  estadoMigratorio: 'pendiente_validacion', docNumero: 'PTP-77', docVencimiento: '2031-05-01', referencia1Nombre: 'Ana', referencia1Celular: '911111111',
  referencia2Nombre: 'Rosa', referencia2Celular: '922222222',
}
const rutasDe = (u: string): RutasArchivos => ({
  cv: `${u}/cv-1.pdf`, antecedentes: `${u}/antecedentes-1.pdf`, docFrontal: `${u}/doc-frontal-1.jpg`, docPosterior: null, docConstancia: `${u}/doc-constancia-1.pdf`,
})

describe.skipIf(!crearBase)('alta con confirmación de correo (base real de las migraciones)', () => {
  beforeAll(async () => {
    db = await crearBase!({ hasta: 15 })
    await db.exec(`insert into auth.users (id, email) values ${[CLIENTE, PRO, ABANDONO, SIN_CONFIRMAR, OTRO, SIN_PERFIL].map((u) => `('${u}','${u}@x.pe')`).join(',')}`)
    // En Supabase, anon y authenticated tienen permisos sobre storage.objects y manda RLS; el arnés no los trae.
    await db.exec('grant select, insert, update on storage.objects to anon, authenticated')
    await db.exec(sql0016a); await db.exec(sql0016b)
    await db.exec(sql0016)
  }, 180_000)

  it('correo sin confirmar: no hay sesión y la base no deja escribir perfil, profesional ni archivos', async () => {
    // signUp solo creó el usuario de acceso: nada más.
    expect(await cuenta(`select count(*) n from perfiles where id = '${SIN_CONFIRMAR}'`)).toBe(0)
    expect(await cuenta(`select count(*) n from trabajadores where id = '${SIN_CONFIRMAR}'`)).toBe(0)
    expect(await cuenta(`select count(*) n from storage.objects where name like '${SIN_CONFIRMAR}/%'`)).toBe(0)
    // Intentos sin sesión (anon), también diciendo ser esa persona.
    const d = datosClienteDesdeMetadata(metadataCliente({ nombre: 'Ana', telefono: '911111111', zona: 'Punchana', direccion: 'Jr. 1' }))!
    expect(await rechaza(() => como(null, () => insertar('perfiles', filaPerfilCliente(SIN_CONFIRMAR, d)), 'anon'))).toBe(true)
    expect(await rechaza(() => como(null, () => insertar('trabajadores', filaTrabajador(SIN_CONFIRMAR, FORM, rutasDe(SIN_CONFIRMAR))), 'anon'))).toBe(true)
    expect(await rechaza(() => como(null, () => subirArchivo('documentos', `${SIN_CONFIRMAR}/cv.pdf`), 'anon'))).toBe(true)
    expect(await cuenta(`select (select count(*) from perfiles) + (select count(*) from trabajadores) n`)).toBe(0)
  })

  it('alta de cliente completa: primer ingreso crea el perfil con rol cliente aunque la metadata diga otra cosa', async () => {
    const meta = { ...metadataCliente({ nombre: ' Ana Ríos ', telefono: '911111111', zona: 'Punchana', direccion: 'Jr. Lima 1' }), rol: 'admin' }
    const datos = datosClienteDesdeMetadata(meta)!
    await como(CLIENTE, () => insertar('perfiles', filaPerfilCliente(CLIENTE, datos)))
    const f = (await db.query(`select rol, nombre, telefono, zona, direccion from perfiles where id = '${CLIENTE}'`)).rows[0]
    expect(f).toEqual({ rol: 'cliente', nombre: 'Ana Ríos', telefono: '911111111', zona: 'Punchana', direccion: 'Jr. Lima 1' })
    expect(await como(CLIENTE, async () => (await db.query('select es_admin() a, es_profesional() p')).rows[0])).toEqual({ a: false, p: false })
    // Dos cargas a la vez (inicio + evento de sesión): la segunda choca y no duplica nada.
    expect(await rechaza(() => como(CLIENTE, () => insertar('perfiles', filaPerfilCliente(CLIENTE, datos))))).toBe(true)
    expect(await cuenta(`select count(*) n from perfiles where id = '${CLIENTE}'`)).toBe(1)
    // Y la API no deja crear un perfil admin ni convertirlo después.
    expect(await rechaza(() => como(OTRO, () => insertar('perfiles', { ...filaPerfilCliente(OTRO, datos), rol: 'admin' })))).toBe(true)
    expect(await rechaza(() => como(CLIENTE, () => db.exec(`update perfiles set rol = 'admin' where id = '${CLIENTE}'`)))).toBe(true)
  })

  it('alta de profesional completa, con documentos: perfil + archivos + fila de trabajadores, pendiente de verificación', async () => {
    const rutas = rutasDe(PRO)
    await como(PRO, async () => {
      await subirArchivo('fotos', `${PRO}/foto-1.jpg`)
      for (const r of [rutas.cv, rutas.antecedentes, rutas.docFrontal, rutas.docConstancia]) await subirArchivo('documentos', r!)
      await insertar('perfiles', filaPerfilProfesional(PRO, { nombre: ' María Pérez ', telefono: '933333333', direccion: 'Jr. Lima 2', zonas: FORM.zonas }, 'https://x/foto-1.jpg'))
      await insertar('trabajadores', filaTrabajador(PRO, FORM, rutas))
    })
    const p = (await db.query(`select rol, nombre, zona, foto_url from perfiles where id = '${PRO}'`)).rows[0]
    expect(p).toEqual({ rol: 'trabajador', nombre: 'María Pérez', zona: 'Belén', foto_url: 'https://x/foto-1.jpg' })
    const t = (await db.query(`select verificado, habilitado_trabajar, estado_migratorio, cv_ruta, doc_migratorio_frontal_ruta, doc_migratorio_constancia_ruta, zonas, servicios from trabajadores where id = '${PRO}'`)).rows[0]
    expect(t).toMatchObject({ verificado: false, habilitado_trabajar: false, estado_migratorio: 'pendiente_validacion', cv_ruta: rutas.cv, doc_migratorio_frontal_ruta: rutas.docFrontal, doc_migratorio_constancia_ruta: rutas.docConstancia })
    expect(t.zonas).toEqual(['Belén', 'Punchana'])
    expect(await cuenta(`select count(*) n from storage.objects where name like '${PRO}/%'`)).toBe(5)
    expect(await como(PRO, async () => (await db.query('select es_profesional() p, es_admin() a')).rows[0])).toEqual({ p: true, a: false })
  })

  it('el profesional no puede verificarse a sí mismo, ni crear la fila de otra persona, ni subir a la carpeta de otra', async () => {
    expect(await rechaza(() => como(OTRO, () => insertar('trabajadores', filaTrabajador(PRO, FORM, rutasDe(PRO)))))).toBe(true)
    expect(await rechaza(() => como(OTRO, () => subirArchivo('documentos', `${PRO}/robado.pdf`)))).toBe(true)
    // Aunque la fila trajera verificado/habilitado en true, el alta lo fuerza a pendiente.
    await como(OTRO, async () => {
      await insertar('perfiles', { id: OTRO, rol: 'trabajador', nombre: 'Otra', telefono: '944444444', zona: 'Belén', direccion: 'x' })
      await insertar('trabajadores', { ...filaTrabajador(OTRO, FORM, rutasDe(OTRO)), verificado: true, habilitado_trabajar: true })
    })
    const t = (await db.query(`select verificado, habilitado_trabajar from trabajadores where id = '${OTRO}'`)).rows[0]
    expect(t).toEqual({ verificado: false, habilitado_trabajar: false })
  })

  it('abandono a mitad y reanudación al volver a entrar: no se duplica nada, el rol no cambia y se completa', async () => {
    const rutas = rutasDe(ABANDONO)
    // Primera sesión: se guardó el perfil base y se subió un documento, pero la persona cerró la app antes de terminar.
    await como(ABANDONO, async () => {
      await subirArchivo('documentos', rutas.cv!)
      await insertar('perfiles', filaPerfilProfesional(ABANDONO, { nombre: 'Rosa Vela', telefono: '955555555', direccion: 'Jr. 5', zonas: ['Belén'] }, null))
    })
    // Segunda sesión (vuelve a entrar): la app ve perfil sin fila de trabajadores => "Completar perfil".
    const estado = await como(ABANDONO, async () => ({
      perfil: (await db.query(`select nombre, telefono, direccion, zona from perfiles where id = '${ABANDONO}'`)).rows[0],
      esProfesional: (await db.query('select es_profesional() p')).rows[0].p,
    }))
    expect(estado.esProfesional).toBe(false)
    expect(estado.perfil.nombre).toBe('Rosa Vela') // la pantalla se rellena con lo que ya se guardó

    // Primer reintento falla (tarifa fuera de rango): se muestra el error y NO queda una fila a medias.
    const malo = { ...filaTrabajador(ABANDONO, FORM, rutas), tarifa_hora: 500 }
    expect(await rechaza(() => como(ABANDONO, () => insertar('trabajadores', malo)))).toBe(true)
    expect(await cuenta(`select count(*) n from trabajadores where id = '${ABANDONO}'`)).toBe(0)

    // Reintento correcto: actualiza solo lo que cambió (sin rol) y crea la fila de trabajadores.
    const cambios = cambiosPerfilAlCompletar(estado.perfil, { nombre: 'Rosa Vela Díaz', telefono: '955555555', direccion: 'Jr. 5' }, null)
    expect(cambios).toEqual({ nombre: 'Rosa Vela Díaz' })
    await como(ABANDONO, async () => {
      await db.query('update perfiles set nombre = $1 where id = $2', [cambios.nombre, ABANDONO])
      await insertar('trabajadores', filaTrabajador(ABANDONO, FORM, rutas))
    })
    expect(await cuenta(`select count(*) n from perfiles where id = '${ABANDONO}'`)).toBe(1)
    expect(await cuenta(`select count(*) n from trabajadores where id = '${ABANDONO}'`)).toBe(1)
    expect((await db.query(`select rol, nombre from perfiles where id = '${ABANDONO}'`)).rows[0]).toEqual({ rol: 'trabajador', nombre: 'Rosa Vela Díaz' })
    expect(await como(ABANDONO, async () => (await db.query('select es_profesional() p')).rows[0].p)).toBe(true)
    // Si el envío se repitiera por error (doble toque), la base rechaza la segunda fila en vez de duplicar.
    expect(await rechaza(() => como(ABANDONO, () => insertar('trabajadores', filaTrabajador(ABANDONO, FORM, rutas))))).toBe(true)
  })

  it('cuenta confirmada SIN perfil (metadata inválida): no se crea sola, pero puede corregir y terminar, siempre como cliente', async () => {
    // Quien se registró con un nombre de 121 caracteres (p. ej. una versión anterior del formulario): al confirmar, la metadata no pasa.
    const meta = { nombre: 'a'.repeat(121), telefono: '911111111', zona: 'Punchana', direccion: 'Jr. Lima 1', rol: 'admin' }
    expect(datosClienteDesdeMetadata(meta)).toBeNull()
    expect(await cuenta(`select count(*) n from perfiles where id = '${SIN_PERFIL}'`)).toBe(0)
    // El formulario "Completa tus datos" rechaza el dato malo y deja corregirlo...
    expect(errorContacto({ nombre: meta.nombre, telefono: meta.telefono, direccion: meta.direccion, zona: meta.zona })).toMatch(/muy largo/)
    const corregido = { nombre: 'Ana Ríos', telefono: '911111111', zona: 'Punchana', direccion: 'Jr. Lima 1' }
    expect(errorContacto(corregido)).toBeNull()
    // ...y con la sesión de esa persona crea SU fila, con rol cliente (nunca el de la metadata).
    await como(SIN_PERFIL, () => insertar('perfiles', filaPerfilCliente(SIN_PERFIL, corregido)))
    expect((await db.query(`select rol, nombre from perfiles where id = '${SIN_PERFIL}'`)).rows[0]).toEqual({ rol: 'cliente', nombre: 'Ana Ríos' })
    // Reintentar (otra pestaña): choca con la fila existente, no la duplica.
    expect(await rechaza(() => como(SIN_PERFIL, () => insertar('perfiles', filaPerfilCliente(SIN_PERFIL, corregido))))).toBe(true)
    expect(await cuenta(`select count(*) n from perfiles where id = '${SIN_PERFIL}'`)).toBe(1)
  })
})
