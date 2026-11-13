import { describe, expect, it, vi } from 'vitest'
import {
  borradorClienteDesdeMetadata,
  correoYaTieneCuenta,
  datosClienteDesdeMetadata,
  errorContacto,
  LIMITE_DIRECCION,
  LIMITE_NOMBRE,
  esErrorCorreoNoConfirmado,
  filaPerfilCliente,
  filaPerfilProfesional,
  filaTrabajador,
  metadataCliente,
  reenviarConfirmacion,
  urlConfirmado,
} from './altaCuenta'

const DATOS = { nombre: ' Ana Ríos ', telefono: '911111111', zona: 'Punchana', direccion: ' Jr. Lima 1 ' }

describe('metadata del cliente al registrarse', () => {
  it('guarda solo datos de contacto y nunca el rol', () => {
    const m = metadataCliente(DATOS)
    expect(m).toEqual({ nombre: 'Ana Ríos', telefono: '911111111', zona: 'Punchana', direccion: 'Jr. Lima 1' })
    expect('rol' in m).toBe(false)
  })

  it('al leerla IGNORA un rol puesto a mano en user_metadata', () => {
    const d = datosClienteDesdeMetadata({ ...metadataCliente(DATOS), rol: 'admin', is_admin: true })
    expect(d).toEqual({ nombre: 'Ana Ríos', telefono: '911111111', zona: 'Punchana', direccion: 'Jr. Lima 1' })
    expect(d && 'rol' in d).toBe(false)
  })

  it('la fila de perfil del cliente siempre lleva rol cliente, venga lo que venga en la metadata', () => {
    const d = datosClienteDesdeMetadata({ ...metadataCliente(DATOS), rol: 'admin' })!
    expect(filaPerfilCliente('u1', d).rol).toBe('cliente')
    const sinRol = datosClienteDesdeMetadata({ ...metadataCliente(DATOS), rol: 'trabajador' })!
    expect(filaPerfilCliente('u1', sinRol).rol).toBe('cliente')
  })

  it.each([
    ['sin metadata', null],
    ['vacía', {}],
    ['celular inválido', { ...metadataCliente(DATOS), telefono: '123' }],
    ['zona que no existe', { ...metadataCliente(DATOS), zona: 'Marte' }],
    ['sin nombre', { ...metadataCliente(DATOS), nombre: '  ' }],
    ['sin dirección', { ...metadataCliente(DATOS), direccion: '' }],
    ['nombre larguísimo', { ...metadataCliente(DATOS), nombre: 'a'.repeat(500) }],
    ['tipos equivocados', { nombre: 1, telefono: 2, zona: 3, direccion: 4 }],
  ])('no crea nada si la metadata es inválida (%s)', (_nombre, meta) => {
    expect(datosClienteDesdeMetadata(meta)).toBeNull()
  })

  it('un registro de profesional (sin metadata de cliente) no genera perfil automático', () => {
    expect(datosClienteDesdeMetadata({ email: 'p@x.pe', email_verified: false })).toBeNull()
  })
})

describe('límites de nombre y dirección (antes de crear la cuenta)', () => {
  const base = { nombre: 'Ana Ríos', telefono: '911111111', direccion: 'Jr. Lima 1', zona: 'Punchana' }

  it('un nombre de 121 caracteres se rechaza ANTES de signUp (el formulario usa esta misma regla)', () => {
    expect(LIMITE_NOMBRE).toBe(120)
    expect(errorContacto({ ...base, nombre: 'a'.repeat(121) })).toMatch(/nombre es muy largo/)
    expect(errorContacto({ ...base, nombre: 'a'.repeat(120) })).toBeNull()
  })
  it('una dirección de 201 caracteres se rechaza; 200 pasa', () => {
    expect(LIMITE_DIRECCION).toBe(200)
    expect(errorContacto({ ...base, direccion: 'a'.repeat(201) })).toMatch(/dirección es muy larga/)
    expect(errorContacto({ ...base, direccion: 'a'.repeat(200) })).toBeNull()
  })
  it('cuenta los caracteres sin los espacios de los extremos', () => {
    expect(errorContacto({ ...base, nombre: '  ' + 'a'.repeat(120) + '  ' })).toBeNull()
  })
  it('lo que acepta el formulario es lo mismo que acepta la creación del perfil (no hay callejón sin salida)', () => {
    for (const nombre of ['a'.repeat(120), 'b'.repeat(121)]) {
      const form = errorContacto({ ...base, nombre }) === null
      const perfil = datosClienteDesdeMetadata(metadataCliente({ ...base, nombre })) !== null
      expect(form).toBe(perfil)
    }
  })
  it('el profesional usa los mismos límites de nombre y dirección (sin pedir zona: elige zonas de atención más abajo)', () => {
    const sinZona = { nombre: base.nombre, telefono: base.telefono, direccion: base.direccion }
    expect(errorContacto({ ...sinZona, nombre: 'a'.repeat(121) }, { pedirZona: false })).toMatch(/muy largo/)
    expect(errorContacto({ ...sinZona, direccion: 'a'.repeat(201) }, { pedirZona: false })).toMatch(/muy larga/)
    expect(errorContacto(sinZona, { pedirZona: false })).toBeNull()
  })
  it('para corregir se rellena con lo que había en user_metadata, aunque sea inválido, y nunca con el rol', () => {
    const b = borradorClienteDesdeMetadata({ nombre: 'a'.repeat(121), telefono: '123', zona: 'Marte', direccion: 'x', rol: 'admin' })
    expect(b.nombre).toHaveLength(121)
    expect(b.telefono).toBe('123')
    expect('rol' in b).toBe(false)
    expect(borradorClienteDesdeMetadata(null)).toEqual({ nombre: '', telefono: '', zona: '', direccion: '' })
  })
})

describe('enlace del correo', () => {
  it('vuelve a la misma app (dominio de origen) en /confirmado', () => {
    expect(urlConfirmado('https://yavi.pe', null)).toBe('https://yavi.pe/confirmado')
    expect(urlConfirmado('https://pro.yavi.pe/', undefined)).toBe('https://pro.yavi.pe/confirmado')
  })
  it('conserva a dónde volver (el pedido en curso), codificado', () => {
    expect(urlConfirmado('https://yavi.pe', '/pedir')).toBe('https://yavi.pe/confirmado?volver=%2Fpedir')
  })
  it('reenviar el correo usa el mismo enlace y tipo signup', async () => {
    const resend = vi.fn().mockResolvedValue({ error: null })
    await reenviarConfirmacion({ resend }, ' ana@x.pe ', 'https://pro.yavi.pe')
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'ana@x.pe', options: { emailRedirectTo: 'https://pro.yavi.pe/confirmado' } })
  })
})

describe('correo ya registrado o sin confirmar', () => {
  it('detecta el usuario "fantasma" que Supabase devuelve para un correo ya confirmado', () => {
    expect(correoYaTieneCuenta({ identities: [] })).toBe(true)
    expect(correoYaTieneCuenta({ identities: [{}] })).toBe(false)
    expect(correoYaTieneCuenta(null)).toBe(false)
  })
  it('reconoce el error de correo sin confirmar al iniciar sesión', () => {
    expect(esErrorCorreoNoConfirmado({ message: 'Email not confirmed' })).toBe(true)
    expect(esErrorCorreoNoConfirmado({ code: 'email_not_confirmed', message: 'x' })).toBe(true)
    expect(esErrorCorreoNoConfirmado({ message: 'Invalid login credentials' })).toBe(false)
    expect(esErrorCorreoNoConfirmado(null)).toBe(false)
  })
})

describe('alta del profesional', () => {
  const form = {
    genero: 'femenino', nacionalidad: 'extranjera', tipoDocumento: 'ce', numeroDocumento: 'X123456', zonas: ['Belén', 'Punchana'],
    servicios: ['Electricidad'], tarifaHora: 30, experiencia: '', antecedentes: 'vigente', cuentaAutorizacion: 'si',
    estadoMigratorio: 'pendiente_validacion', docNumero: 'PTP-1', docVencimiento: '2030-01-01', referencia1Nombre: 'A', referencia1Celular: '911111111',
    referencia2Nombre: 'B', referencia2Celular: '922222222',
  }
  const rutas = { cv: 'u/cv.pdf', antecedentes: 'u/ant.pdf', docFrontal: 'u/f.jpg', docPosterior: null, docConstancia: 'u/c.pdf' }

  it('la fila de trabajadores lleva las rutas de los documentos subidos', () => {
    const f = filaTrabajador('u', form, rutas)
    expect(f).toMatchObject({ id: 'u', cv_ruta: 'u/cv.pdf', doc_migratorio_frontal_ruta: 'u/f.jpg', doc_migratorio_constancia_ruta: 'u/c.pdf', doc_migratorio_posterior_ruta: null })
    expect(f.cuenta_autorizacion_migratoria).toBe(true)
    expect(f.experiencia).toBeNull()
  })
  it('una peruana no lleva datos migratorios', () => {
    const f = filaTrabajador('u', { ...form, nacionalidad: 'peruana', cuentaAutorizacion: '', estadoMigratorio: 'no_aplica' }, rutas)
    expect(f.cuenta_autorizacion_migratoria).toBeNull()
    expect(f.doc_migratorio_numero).toBeNull()
  })
  it('no existe en la fila ninguna columna de verificación ni de habilitación', () => {
    const f = filaTrabajador('u', form, rutas) as Record<string, unknown>
    for (const c of ['verificado', 'habilitado_trabajar', 'rating_avg', 'verificado_por', 'disponible_ahora']) expect(c in f).toBe(false)
  })
  it('el perfil nuevo del profesional usa su primera zona de atención', () => {
    const p = filaPerfilProfesional('u', { nombre: ' María ', telefono: '911111111', direccion: ' Jr. 1 ', zonas: ['Belén', 'Punchana'] }, null)
    expect(p).toMatchObject({ id: 'u', rol: 'trabajador', nombre: 'María', zona: 'Belén', direccion: 'Jr. 1', foto_url: null })
  })
})
