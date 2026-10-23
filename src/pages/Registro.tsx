import { Logo } from '../components/Logo'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { volverSeguro } from '../lib/rutas'
import {
  ZONAS,
  MAX_ZONAS_TRABAJADOR,
  SERVICIOS,
  ANTECEDENTES,
  GENEROS,
  NACIONALIDADES,
  TIPOS_DOCUMENTO_EXTRANJERA,
} from '../lib/constantes'
import {
  esNumeroDocumentoValido,
  esCelularValido,
  esTarifaValida,
  sonZonasValidas,
  esFechaFuturaValida,
} from '../lib/validadores'
import type { RegistroPendiente } from '../lib/registroPendiente'
import type { Rol, Nacionalidad, Genero, TipoDocumento, EstadoMigratorio } from '../types'

async function subirArchivo(
  bucket: string,
  userId: string,
  file: File,
  prefijo: string,
): Promise<string | null> {
  const extension = file.name.split('.').pop() ?? 'jpg'
  const ruta = `${userId}/${prefijo}-${Date.now()}.${extension}`
  const { error } = await supabase.storage.from(bucket).upload(ruta, file, { upsert: true })
  return error ? null : ruta
}

export function Registro() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const volver = volverSeguro(params.get('volver'))
  const [rol, setRol] = useState<Rol>('cliente')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [celular, setCelular] = useState('')
  const [direccion, setDireccion] = useState('')
  const [zona, setZona] = useState('')

  const [genero, setGenero] = useState('')
  const [nacionalidad, setNacionalidad] = useState<Nacionalidad>('peruana')
  const [tipoDocumento, setTipoDocumento] = useState('dni')
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [cuentaAutorizacion, setCuentaAutorizacion] = useState('')
  const [docNumero, setDocNumero] = useState('')
  const [docVencimiento, setDocVencimiento] = useState('')
  const [docFrontal, setDocFrontal] = useState<File | null>(null)
  const [docPosterior, setDocPosterior] = useState<File | null>(null)
  const [docConstancia, setDocConstancia] = useState<File | null>(null)

  const [zonas, setZonas] = useState<string[]>([])
  const [servicios, setServicios] = useState<string[]>([])
  const [tarifaHora, setTarifaHora] = useState('')
  const [experiencia, setExperiencia] = useState('')
  const [cv, setCv] = useState<File | null>(null)
  const [antecedentes, setAntecedentes] = useState('')
  const [antecedentesDoc, setAntecedentesDoc] = useState<File | null>(null)
  const [referencia1Nombre, setReferencia1Nombre] = useState('')
  const [referencia1Celular, setReferencia1Celular] = useState('')
  const [referencia2Nombre, setReferencia2Nombre] = useState('')
  const [referencia2Celular, setReferencia2Celular] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [aceptaVerificacion, setAceptaVerificacion] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function alternarServicio(s: string) {
    setServicios((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  function alternarZona(z: string) {
    setZonas((prev) => {
      if (prev.includes(z)) return prev.filter((x) => x !== z)
      if (prev.length >= MAX_ZONAS_TRABAJADOR) return prev
      return [...prev, z]
    })
  }

  function cambiarNacionalidad(valor: Nacionalidad) {
    setNacionalidad(valor)
    if (valor === 'peruana') {
      setTipoDocumento('dni')
      setCuentaAutorizacion('')
      setDocNumero('')
      setDocVencimiento('')
      setDocFrontal(null)
      setDocPosterior(null)
      setDocConstancia(null)
    } else {
      setTipoDocumento('')
    }
  }

  function validar(): string | null {
    if (!nombre.trim()) return rol === 'trabajador' ? 'Escribe tus nombres y apellidos.' : 'Escribe tu nombre completo.'
    if (!esCelularValido(celular)) return 'El celular debe tener 9 dígitos y empezar con 9.'
    if (!direccion.trim()) return 'Escribe tu dirección.'
    if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.'

    if (rol === 'cliente' && !zona) return 'Elige tu zona.'

    if (rol === 'trabajador') {
      if (!genero) return 'Elige tu género.'
      if (!tipoDocumento) return 'Elige tu tipo de documento.'
      if (!esNumeroDocumentoValido(tipoDocumento, numeroDocumento)) {
        return tipoDocumento === 'dni'
          ? 'El DNI debe tener 8 dígitos.'
          : 'Escribe un número de documento válido.'
      }

      if (nacionalidad === 'extranjera') {
        if (!cuentaAutorizacion) {
          return '¿Cuenta con una calidad migratoria o autorización vigente que le permita trabajar en el Perú? Elige Sí o No.'
        }
        if (cuentaAutorizacion === 'si') {
          if (!docNumero.trim()) return 'Escribe el número del documento que acredita tu autorización.'
          if (!esFechaFuturaValida(docVencimiento)) {
            return 'La fecha de vencimiento del documento debe ser una fecha futura.'
          }
          if (!docFrontal) return 'Adjunta la foto frontal de tu documento.'
          if (!docConstancia) {
            return 'Adjunta el documento o constancia que acredite tu autorización para trabajar.'
          }
        }
      }

      if (!sonZonasValidas(zonas, MAX_ZONAS_TRABAJADOR)) {
        return `Elige entre 1 y ${MAX_ZONAS_TRABAJADOR} zonas de atención.`
      }
      if (servicios.length === 0) return 'Elige al menos un servicio que ofreces.'
      const tarifa = Number(tarifaHora)
      if (!esTarifaValida(tarifa)) return 'La tarifa por hora debe estar entre S/ 5 y S/ 100.'
      if (!antecedentes) return 'Indica el estado de tus antecedentes penales.'
      if (!referencia1Nombre.trim() || !esCelularValido(referencia1Celular)) {
        return 'Completa el nombre y celular (9 dígitos) de tu primera referencia.'
      }
      if (!referencia2Nombre.trim() || !esCelularValido(referencia2Celular)) {
        return 'Completa el nombre y celular (9 dígitos) de tu segunda referencia.'
      }
      if (!aceptaVerificacion) return 'Debes aceptar el proceso de verificación de YAVI.'
    }

    return null
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const mensajeValidacion = validar()
    if (mensajeValidacion) {
      setError(mensajeValidacion)
      return
    }

    setError(null)
    setEnviando(true)

    const estadoMigratorio: EstadoMigratorio =
      rol === 'trabajador' && nacionalidad === 'extranjera' ? 'pendiente_validacion' : 'no_aplica'

    // Vive en el propio usuario de Supabase (no en localStorage): así, si
    // Supabase exige confirmar el correo, da igual desde qué navegador o
    // dispositivo se confirme y se vuelva a iniciar sesión — AuthContext
    // puede completar el alta igual (ver cargarPerfil). Los archivos (foto,
    // CV, antecedentes, documentos migratorios) no viajan aquí: se deberán
    // adjuntar desde el panel una vez confirmada la cuenta.
    const datosRegistro: RegistroPendiente = {
      email,
      rol,
      nombre,
      telefono: celular,
      zona: rol === 'cliente' ? zona : (zonas[0] ?? ''),
      direccion,
      genero: rol === 'trabajador' ? (genero as Genero) : undefined,
      nacionalidad: rol === 'trabajador' ? nacionalidad : undefined,
      tipo_documento: rol === 'trabajador' ? (tipoDocumento as TipoDocumento) : undefined,
      numero_documento: rol === 'trabajador' ? numeroDocumento : undefined,
      zonas: rol === 'trabajador' ? zonas : undefined,
      servicios: rol === 'trabajador' ? servicios : undefined,
      tarifa_hora: rol === 'trabajador' ? Number(tarifaHora) : undefined,
      experiencia: rol === 'trabajador' ? experiencia : undefined,
      antecedentes: rol === 'trabajador' ? antecedentes : undefined,
      cuenta_autorizacion_migratoria:
        rol === 'trabajador' && nacionalidad === 'extranjera' ? cuentaAutorizacion === 'si' : undefined,
      estado_migratorio: rol === 'trabajador' ? estadoMigratorio : undefined,
      doc_migratorio_numero: cuentaAutorizacion === 'si' ? docNumero : undefined,
      doc_migratorio_vencimiento: cuentaAutorizacion === 'si' ? docVencimiento : undefined,
      referencia1_nombre: rol === 'trabajador' ? referencia1Nombre : undefined,
      referencia1_celular: rol === 'trabajador' ? referencia1Celular : undefined,
      referencia2_nombre: rol === 'trabajador' ? referencia2Nombre : undefined,
      referencia2_celular: rol === 'trabajador' ? referencia2Celular : undefined,
    }

    const { data, error: errorSignUp } = await supabase.auth.signUp({
      email,
      password,
      options: { data: datosRegistro },
    })

    if (errorSignUp || !data.user) {
      setError(traducirError(errorSignUp ?? new Error('No se pudo crear la cuenta.')))
      setEnviando(false)
      return
    }

    // Sin sesión activa todavía significa que Supabase exige confirmar el
    // correo antes de dejar entrar. AuthContext.cargarPerfil completa el
    // alta con los datos de arriba en el primer login, desde cualquier
    // navegador (quedaron guardados en el propio usuario, no aquí).
    if (!data.session) {
      setEnviando(false)
      setError(null)
      alert('Te enviamos un correo de confirmación. Confírmalo y vuelve a iniciar sesión para terminar tu registro.')
      navigate(volver ? `/login?volver=${encodeURIComponent(volver)}` : '/login')
      return
    }

    const userId = data.user.id
    let fotoUrl: string | null = null

    if (rol === 'trabajador' && foto) {
      const ruta = await subirArchivo('fotos', userId, foto, 'foto')
      if (ruta) fotoUrl = supabase.storage.from('fotos').getPublicUrl(ruta).data.publicUrl
    }

    // upsert, no insert: si Supabase no exige confirmar correo, el listener
    // de AuthContext (onAuthStateChange) puede dispararse casi al mismo
    // tiempo que este signUp y crear el perfil primero desde user_metadata.
    // Con insert, esa carrera nos tiraría un error de clave duplicada aquí y
    // se perdería la foto/CV/documentos; con upsert, sea quien sea que llegó
    // primero, esto termina de escribir los datos completos igual.
    const { error: errorPerfil } = await supabase.from('perfiles').upsert({
      id: userId,
      rol,
      nombre,
      telefono: celular,
      zona: rol === 'cliente' ? zona : zonas[0],
      direccion,
      foto_url: fotoUrl,
    })

    if (errorPerfil) {
      setError(traducirError(errorPerfil))
      setEnviando(false)
      return
    }

    if (rol === 'trabajador') {
      const [cvRuta, antecedentesDocRuta, docFrontalRuta, docPosteriorRuta, docConstanciaRuta] = await Promise.all([
        cv ? subirArchivo('documentos', userId, cv, 'cv') : Promise.resolve(null),
        antecedentesDoc ? subirArchivo('documentos', userId, antecedentesDoc, 'antecedentes') : Promise.resolve(null),
        docFrontal ? subirArchivo('documentos', userId, docFrontal, 'doc-frontal') : Promise.resolve(null),
        docPosterior ? subirArchivo('documentos', userId, docPosterior, 'doc-posterior') : Promise.resolve(null),
        docConstancia ? subirArchivo('documentos', userId, docConstancia, 'doc-constancia') : Promise.resolve(null),
      ])

      const { error: errorTrabajador } = await supabase.from('trabajadores').upsert({
        id: userId,
        genero,
        nacionalidad,
        tipo_documento: tipoDocumento,
        numero_documento: numeroDocumento,
        zonas,
        servicios,
        tarifa_hora: Number(tarifaHora),
        experiencia: experiencia || null,
        cv_ruta: cvRuta,
        antecedentes,
        antecedentes_doc_ruta: antecedentesDocRuta,
        cuenta_autorizacion_migratoria: nacionalidad === 'extranjera' ? cuentaAutorizacion === 'si' : null,
        estado_migratorio: estadoMigratorio,
        doc_migratorio_numero: cuentaAutorizacion === 'si' ? docNumero : null,
        doc_migratorio_vencimiento: cuentaAutorizacion === 'si' ? docVencimiento : null,
        doc_migratorio_frontal_ruta: docFrontalRuta,
        doc_migratorio_posterior_ruta: docPosteriorRuta,
        doc_migratorio_constancia_ruta: docConstanciaRuta,
        referencia1_nombre: referencia1Nombre,
        referencia1_celular: referencia1Celular,
        referencia2_nombre: referencia2Nombre,
        referencia2_celular: referencia2Celular,
      })
      if (errorTrabajador) {
        setError(traducirError(errorTrabajador))
        setEnviando(false)
        return
      }
    }

    setEnviando(false)
    // Pasa por "/" para que el paso de activar notificaciones (Inicio en
    // App.tsx) se interponga antes de llegar a su panel/búsqueda.
    // Un cliente que venía armando un pedido vuelve a él; el resto pasa por "/" (activar notificaciones).
    navigate(rol === 'cliente' && volver ? volver : '/')
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <Logo className="mx-auto -mb-4 -mt-2 w-52" />
      <h1 className="mb-1 text-3xl font-extrabold">Crea tu cuenta</h1>
      <p className="mb-6 text-neutral-500">Elige cómo quieres usar YAVI.</p>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setRol('cliente')}
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            rol === 'cliente'
              ? 'border-brand-700 bg-brand-50 text-brand-800'
              : 'border-neutral-300 text-neutral-600'
          }`}
        >
          Soy cliente
        </button>
        <button
          type="button"
          onClick={() => setRol('trabajador')}
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            rol === 'trabajador'
              ? 'border-brand-700 bg-brand-50 text-brand-800'
              : 'border-neutral-300 text-neutral-600'
          }`}
        >
          Soy trabajadora/or
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Campo etiqueta={rol === 'trabajador' ? 'Nombres y apellidos' : 'Nombre completo'}>
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="input"
            placeholder="Ej. María Pérez"
          />
        </Campo>

        {rol === 'trabajador' && (
          <>
            <Campo etiqueta="Género">
              <select value={genero} onChange={(e) => setGenero(e.target.value)} className="input" required>
                <option value="">Elige una opción</option>
                {GENEROS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Nacionalidad">
              <select
                value={nacionalidad}
                onChange={(e) => cambiarNacionalidad(e.target.value as Nacionalidad)}
                className="input"
                required
              >
                {NACIONALIDADES.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
            </Campo>

            {nacionalidad === 'peruana' ? (
              <Campo etiqueta="DNI">
                <input
                  required
                  inputMode="numeric"
                  maxLength={8}
                  value={numeroDocumento}
                  onChange={(e) => setNumeroDocumento(e.target.value)}
                  className="input"
                  placeholder="8 dígitos"
                />
              </Campo>
            ) : (
              <>
                <Campo etiqueta="Tipo de documento de identidad">
                  <select
                    required
                    value={tipoDocumento}
                    onChange={(e) => setTipoDocumento(e.target.value)}
                    className="input"
                  >
                    <option value="">Elige una opción</option>
                    {TIPOS_DOCUMENTO_EXTRANJERA.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Campo>

                <Campo etiqueta="Número de documento">
                  <input
                    required
                    value={numeroDocumento}
                    onChange={(e) => setNumeroDocumento(e.target.value)}
                    className="input"
                    placeholder="Número de tu documento"
                  />
                </Campo>

                <Campo etiqueta="¿Cuenta con una calidad migratoria o autorización vigente que le permita trabajar en el Perú?">
                  <select
                    required
                    value={cuentaAutorizacion}
                    onChange={(e) => setCuentaAutorizacion(e.target.value)}
                    className="input"
                  >
                    <option value="">Elige una opción</option>
                    <option value="si">Sí</option>
                    <option value="no">No</option>
                  </select>
                </Campo>

                {cuentaAutorizacion === 'no' && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Puedes continuar con tu registro. Tu solicitud quedará como "Pendiente de
                    validación para trabajar": no podrás recibir pedidos hasta que YAVI valide tu
                    autorización para trabajar en el Perú.
                  </p>
                )}

                {cuentaAutorizacion === 'si' && (
                  <div className="flex flex-col gap-4 rounded-xl border border-neutral-300 p-3">
                    <Campo etiqueta="Número del documento que acredita tu autorización">
                      <input
                        required
                        value={docNumero}
                        onChange={(e) => setDocNumero(e.target.value)}
                        className="input"
                      />
                    </Campo>
                    <Campo etiqueta="Fecha de vencimiento del documento">
                      <input
                        required
                        type="date"
                        value={docVencimiento}
                        onChange={(e) => setDocVencimiento(e.target.value)}
                        className="input"
                      />
                    </Campo>
                    <Campo etiqueta="Foto del documento (parte frontal)">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setDocFrontal(e.target.files?.[0] ?? null)}
                        className="text-sm"
                      />
                    </Campo>
                    <Campo etiqueta="Foto del documento (parte posterior, cuando corresponda)">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setDocPosterior(e.target.files?.[0] ?? null)}
                        className="text-sm"
                      />
                    </Campo>
                    <Campo etiqueta="Documento o constancia que acredite tu autorización o condición migratoria para trabajar">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setDocConstancia(e.target.files?.[0] ?? null)}
                        className="text-sm"
                      />
                    </Campo>
                    <p className="text-xs text-neutral-500">
                      Aun así, no quedarás habilitada/o para aceptar servicios hasta que YAVI
                      valide tu autorización para trabajar en el Perú.
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <Campo etiqueta="Celular">
          <input
            required
            inputMode="numeric"
            value={celular}
            onChange={(e) => setCelular(e.target.value)}
            className="input"
            placeholder="9XXXXXXXX"
          />
        </Campo>

        <Campo etiqueta={rol === 'trabajador' ? 'Dirección de vivienda actual' : 'Dirección'}>
          <input
            required
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            className="input"
            placeholder="Jirón / calle, número, referencia"
          />
        </Campo>

        {rol === 'cliente' && (
          <Campo etiqueta="Zona">
            <select value={zona} onChange={(e) => setZona(e.target.value)} className="input" required>
              <option value="">Elige tu zona</option>
              {ZONAS.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {rol === 'trabajador' && (
          <>
            <Campo etiqueta={`📍 Zonas de atención (elige hasta ${MAX_ZONAS_TRABAJADOR})`}>
              <div className="flex flex-col gap-2 rounded-xl border border-neutral-300 p-3">
                {ZONAS.map((z) => {
                  const seleccionada = zonas.includes(z)
                  const deshabilitada = !seleccionada && zonas.length >= MAX_ZONAS_TRABAJADOR
                  return (
                    <label
                      key={z}
                      className={`flex items-center gap-2 text-sm ${deshabilitada ? 'opacity-40' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={seleccionada}
                        disabled={deshabilitada}
                        onChange={() => alternarZona(z)}
                        className="h-4 w-4 accent-brand-700"
                      />
                      {z}
                    </label>
                  )
                })}
              </div>
            </Campo>

            <Campo etiqueta="Servicios que ofreces">
              <div className="flex flex-col gap-2 rounded-xl border border-neutral-300 p-3">
                {SERVICIOS.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={servicios.includes(s)}
                      onChange={() => alternarServicio(s)}
                      className="h-4 w-4 accent-brand-700"
                    />
                    {s}
                  </label>
                ))}
              </div>
            </Campo>

            <Campo etiqueta="Tarifa por hora (S/ 5 - 100)">
              <input
                required
                type="number"
                min={5}
                max={100}
                step="0.5"
                value={tarifaHora}
                onChange={(e) => setTarifaHora(e.target.value)}
                className="input"
                placeholder="Ej. 15"
              />
            </Campo>

            <Campo etiqueta="Experiencia (opcional)">
              <textarea
                value={experiencia}
                onChange={(e) => setExperiencia(e.target.value)}
                className="input min-h-20"
                placeholder="Cuéntanos brevemente tu experiencia"
              />
            </Campo>

            <Campo etiqueta="Adjuntar CV (opcional)">
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setCv(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </Campo>

            <Campo etiqueta="Antecedentes penales">
              <select
                required
                value={antecedentes}
                onChange={(e) => setAntecedentes(e.target.value)}
                className="input"
              >
                <option value="">Elige una opción</option>
                {ANTECEDENTES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Adjuntar documento de antecedentes penales (opcional)">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setAntecedentesDoc(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </Campo>

            <Campo etiqueta="Referencia laboral 1 - nombre">
              <input
                required
                value={referencia1Nombre}
                onChange={(e) => setReferencia1Nombre(e.target.value)}
                className="input"
                placeholder="Ej. Juan Ramírez"
              />
            </Campo>
            <Campo etiqueta="Referencia laboral 1 - celular">
              <input
                required
                inputMode="numeric"
                value={referencia1Celular}
                onChange={(e) => setReferencia1Celular(e.target.value)}
                className="input"
                placeholder="9XXXXXXXX"
              />
            </Campo>

            <Campo etiqueta="Referencia laboral 2 - nombre">
              <input
                required
                value={referencia2Nombre}
                onChange={(e) => setReferencia2Nombre(e.target.value)}
                className="input"
                placeholder="Ej. Rosa Vela"
              />
            </Campo>
            <Campo etiqueta="Referencia laboral 2 - celular">
              <input
                required
                inputMode="numeric"
                value={referencia2Celular}
                onChange={(e) => setReferencia2Celular(e.target.value)}
                className="input"
                placeholder="9XXXXXXXX"
              />
            </Campo>

            <Campo etiqueta="Foto de perfil (opcional por ahora)">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </Campo>

            <label className="flex items-start gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={aceptaVerificacion}
                onChange={(e) => setAceptaVerificacion(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-700"
              />
              Acepto pasar por el proceso de verificación de YAVI antes de poder recibir
              pedidos.
            </label>
          </>
        )}

        <Campo etiqueta="Correo">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="tucorreo@ejemplo.com"
          />
        </Campo>

        <Campo etiqueta="Contraseña">
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            placeholder="Mínimo 6 caracteres"
          />
        </Campo>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="mt-2 rounded-xl bg-brand-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-semibold text-brand-700">
          Inicia sesión
        </Link>
      </p>
    </div>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-neutral-700">{etiqueta}</span>
      {children}
    </label>
  )
}
