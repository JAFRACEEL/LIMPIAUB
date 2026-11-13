import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Logo } from '../components/Logo'
import { Aviso } from '../components/ui'
import { cambiosPerfilAlCompletar } from '../lib/perfilProfesional'
import { errorContacto, filaPerfilProfesional, filaTrabajador, LIMITE_DIRECCION, LIMITE_NOMBRE } from '../lib/altaCuenta'
import { cerrarSesion } from '../lib/sesion'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import {
  ZONAS,
  MAX_ZONAS_TRABAJADOR,
  SERVICIOS_TECNICO,
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
import type { Nacionalidad, EstadoMigratorio } from '../types'

/**
 * "Completar perfil de profesional": la ÚNICA pantalla que crea la fila de `trabajadores` y sube los documentos.
 * Solo se muestra con sesión (el correo ya está confirmado). Sirve para dos casos:
 *  - cuenta nueva sin perfil: crea `perfiles` y `trabajadores`;
 *  - cuenta que ya tiene perfil (p. ej. un cliente, o un alta que se abandonó a medias): actualiza los datos de contacto
 *    que cambió (sin tocar `rol`) y crea `trabajadores`.
 * Mientras se envía, no se sale de la pantalla; si algo falla se muestra el error y se puede reintentar sin perder lo escrito
 * (los archivos que ya se subieron no se vuelven a subir).
 */
export function CompletarPerfilProfesional() {
  const navigate = useNavigate()
  const { session, perfil, esProfesional, recargarPerfil } = useAuth()

  const [nombre, setNombre] = useState('')
  const [celular, setCelular] = useState('')
  const [direccion, setDireccion] = useState('')

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
  // Archivos ya subidos en un intento anterior: un reintento no los vuelve a subir.
  const subidos = useRef(new Map<File, string>())

  // Si la cuenta ya tiene datos de contacto (cliente, o alta que se dejó a medias), se reutilizan.
  useEffect(() => {
    if (!perfil) return
    setNombre((v) => v || perfil.nombre)
    setCelular((v) => v || perfil.telefono)
    setDireccion((v) => v || perfil.direccion || '')
  }, [perfil])

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
    // Mismos límites que el registro de cliente (nombre y dirección). La zona del profesional se elige más abajo (zonas de atención).
    const mensajeContacto = errorContacto({ nombre, telefono: celular, direccion }, { pedirZona: false })
    if (mensajeContacto) return mensajeContacto
    if (!genero) return 'Elige tu género.'
    if (!tipoDocumento) return 'Elige tu tipo de documento.'
    if (!esNumeroDocumentoValido(tipoDocumento, numeroDocumento)) {
      return tipoDocumento === 'dni' ? 'El DNI debe tener 8 dígitos.' : 'Escribe un número de documento válido.'
    }

    if (nacionalidad === 'extranjera') {
      if (!cuentaAutorizacion) {
        return '¿Cuenta con una calidad migratoria o autorización vigente que le permita trabajar en el Perú? Elige Sí o No.'
      }
      if (cuentaAutorizacion === 'si') {
        if (!docNumero.trim()) return 'Escribe el número del documento que acredita tu autorización.'
        if (!esFechaFuturaValida(docVencimiento)) return 'La fecha de vencimiento del documento debe ser una fecha futura.'
        if (!docFrontal) return 'Adjunta la foto frontal de tu documento.'
        if (!docConstancia) return 'Adjunta el documento o constancia que acredite tu autorización para trabajar.'
      }
    }

    if (!sonZonasValidas(zonas, MAX_ZONAS_TRABAJADOR)) return `Elige entre 1 y ${MAX_ZONAS_TRABAJADOR} zonas de atención.`
    if (servicios.length === 0) return 'Elige al menos un servicio que ofreces.'
    if (!esTarifaValida(Number(tarifaHora))) return 'La tarifa por hora debe estar entre S/ 5 y S/ 100.'
    if (!antecedentes) return 'Indica el estado de tus antecedentes penales.'
    if (referencia1Nombre.trim().length > LIMITE_NOMBRE || referencia2Nombre.trim().length > LIMITE_NOMBRE) return `El nombre de una referencia es muy largo (máximo ${LIMITE_NOMBRE} caracteres).`
    if (!referencia1Nombre.trim() || !esCelularValido(referencia1Celular)) {
      return 'Completa el nombre y celular (9 dígitos) de tu primera referencia.'
    }
    if (!referencia2Nombre.trim() || !esCelularValido(referencia2Celular)) {
      return 'Completa el nombre y celular (9 dígitos) de tu segunda referencia.'
    }
    if (!aceptaVerificacion) return 'Debes aceptar el proceso de verificación de YAVI.'
    return null
  }

  /** Sube un archivo una sola vez. Si falla, corta el envío con un mensaje claro (nada queda a medias sin avisar). */
  async function subir(bucket: string, userId: string, archivo: File, prefijo: string): Promise<string> {
    const previo = subidos.current.get(archivo)
    if (previo) return previo
    const extension = archivo.name.split('.').pop() ?? 'jpg'
    const ruta = `${userId}/${prefijo}-${Date.now()}.${extension}`
    const { error: errorSubida } = await supabase.storage.from(bucket).upload(ruta, archivo, { upsert: true })
    if (errorSubida) throw new Error(`No pudimos subir "${archivo.name}". Revisa tu internet e inténtalo de nuevo.`)
    subidos.current.set(archivo, ruta)
    return ruta
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (enviando || !session) return
    const mensajeValidacion = validar()
    if (mensajeValidacion) {
      setError(mensajeValidacion)
      return
    }

    setError(null)
    setEnviando(true)
    try {
      const userId = session.user.id
      const estadoMigratorio: EstadoMigratorio = nacionalidad === 'extranjera' ? 'pendiente_validacion' : 'no_aplica'

      // Se lee de nuevo (no se confía en el estado de la pantalla): si el perfil ya existe, no se crea ni se toca su rol.
      const { data: existente, error: errorLectura } = await supabase
        .from('perfiles')
        .select('nombre, telefono, direccion, zona')
        .eq('id', userId)
        .maybeSingle()
      if (errorLectura) throw errorLectura

      let fotoUrl: string | null = null
      if (foto) {
        const ruta = await subir('fotos', userId, foto, 'foto')
        fotoUrl = supabase.storage.from('fotos').getPublicUrl(ruta).data.publicUrl
      }

      if (!existente) {
        const { error: errorPerfil } = await supabase
          .from('perfiles')
          .insert(filaPerfilProfesional(userId, { nombre, telefono: celular, direccion, zonas }, fotoUrl))
        if (errorPerfil) throw errorPerfil
      } else {
        // Nunca se envía `rol`; la zona no se toca (aquí "zonas" son las de trabajo, no la zona del cliente).
        const cambios = cambiosPerfilAlCompletar(existente, { nombre, telefono: celular, direccion }, fotoUrl)
        if (Object.keys(cambios).length > 0) {
          const { error: errorPerfil } = await supabase.from('perfiles').update(cambios).eq('id', userId)
          if (errorPerfil) throw errorPerfil
        }
      }

      const [cvRuta, antecedentesRuta, frontalRuta, posteriorRuta, constanciaRuta] = await Promise.all([
        cv ? subir('documentos', userId, cv, 'cv') : null,
        antecedentesDoc ? subir('documentos', userId, antecedentesDoc, 'antecedentes') : null,
        docFrontal ? subir('documentos', userId, docFrontal, 'doc-frontal') : null,
        docPosterior ? subir('documentos', userId, docPosterior, 'doc-posterior') : null,
        docConstancia ? subir('documentos', userId, docConstancia, 'doc-constancia') : null,
      ])

      const { error: errorTrabajador } = await supabase.from('trabajadores').upsert(
        filaTrabajador(
          userId,
          {
            genero,
            nacionalidad,
            tipoDocumento,
            numeroDocumento,
            zonas,
            servicios,
            tarifaHora: Number(tarifaHora),
            experiencia,
            antecedentes,
            cuentaAutorizacion,
            estadoMigratorio,
            docNumero,
            docVencimiento,
            referencia1Nombre,
            referencia1Celular,
            referencia2Nombre,
            referencia2Celular,
          },
          { cv: cvRuta, antecedentes: antecedentesRuta, docFrontal: frontalRuta, docPosterior: posteriorRuta, docConstancia: constanciaRuta },
        ),
      )
      if (errorTrabajador) throw errorTrabajador

      // Las capacidades se leen de la base: se recargan ahora que existe su fila de trabajadores.
      await recargarPerfil()
    } catch (err) {
      setError(traducirError(err))
    } finally {
      setEnviando(false)
    }
  }

  async function salir() {
    await cerrarSesion()
    navigate('/login')
  }

  // Solo cuando terminó el envío (nunca durante): con el perfil ya completo no hay nada que hacer aquí.
  if (esProfesional && !enviando) return <Navigate to="/" replace />

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <Logo className="mx-auto -mb-4 -mt-2 w-52" />
      <h1 className="mb-1 text-3xl font-extrabold">Completa tu perfil de profesional</h1>
      <p className="mb-2 text-neutral-500">
        Tu correo ya está confirmado. Completa tus datos y documentos para que YAVI verifique tu perfil y empieces a
        recibir pedidos.
      </p>
      <p className="mb-6 text-sm text-neutral-500">
        Cuenta: <strong className="break-all">{session?.user.email}</strong> ·{' '}
        <button type="button" onClick={salir} disabled={enviando} className="font-semibold text-brand-700 disabled:opacity-50">
          Cerrar sesión
        </button>
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Campo etiqueta="Nombres y apellidos">
          <input required maxLength={LIMITE_NOMBRE} value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" placeholder="Ej. María Pérez" />
        </Campo>

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
              <select required value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)} className="input">
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
              <select required value={cuentaAutorizacion} onChange={(e) => setCuentaAutorizacion(e.target.value)} className="input">
                <option value="">Elige una opción</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </Campo>

            {cuentaAutorizacion === 'no' && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Puedes continuar con tu registro. Tu solicitud quedará como "Pendiente de validación para trabajar": no
                podrás recibir pedidos hasta que YAVI valide tu autorización para trabajar en el Perú.
              </p>
            )}

            {cuentaAutorizacion === 'si' && (
              <div className="flex flex-col gap-4 rounded-xl border border-neutral-300 p-3">
                <Campo etiqueta="Número del documento que acredita tu autorización">
                  <input required value={docNumero} onChange={(e) => setDocNumero(e.target.value)} className="input" />
                </Campo>
                <Campo etiqueta="Fecha de vencimiento del documento">
                  <input required type="date" value={docVencimiento} onChange={(e) => setDocVencimiento(e.target.value)} className="input" />
                </Campo>
                <Campo etiqueta="Foto del documento (parte frontal)">
                  <input type="file" accept="image/*" onChange={(e) => setDocFrontal(e.target.files?.[0] ?? null)} className="text-sm" />
                </Campo>
                <Campo etiqueta="Foto del documento (parte posterior, cuando corresponda)">
                  <input type="file" accept="image/*" onChange={(e) => setDocPosterior(e.target.files?.[0] ?? null)} className="text-sm" />
                </Campo>
                <Campo etiqueta="Documento o constancia que acredite tu autorización o condición migratoria para trabajar">
                  <input type="file" accept="image/*,.pdf" onChange={(e) => setDocConstancia(e.target.files?.[0] ?? null)} className="text-sm" />
                </Campo>
                <p className="text-xs text-neutral-500">
                  Aun así, no quedarás habilitada/o para aceptar servicios hasta que YAVI valide tu autorización para
                  trabajar en el Perú.
                </p>
              </div>
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

        <Campo etiqueta="Dirección de vivienda actual">
          <input
            required
            maxLength={LIMITE_DIRECCION}
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            className="input"
            placeholder="Jirón / calle, número, referencia"
          />
        </Campo>

        <Campo etiqueta={`📍 Zonas de atención (elige hasta ${MAX_ZONAS_TRABAJADOR})`}>
          <div className="flex flex-col gap-2 rounded-xl border border-neutral-300 p-3">
            {ZONAS.map((z) => {
              const seleccionada = zonas.includes(z)
              const deshabilitada = !seleccionada && zonas.length >= MAX_ZONAS_TRABAJADOR
              return (
                <label key={z} className={`flex items-center gap-2 text-sm ${deshabilitada ? 'opacity-40' : ''}`}>
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
            {SERVICIOS_TECNICO.map((s) => (
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
          <input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(e) => setCv(e.target.files?.[0] ?? null)} className="text-sm" />
        </Campo>

        <Campo etiqueta="Antecedentes penales">
          <select required value={antecedentes} onChange={(e) => setAntecedentes(e.target.value)} className="input">
            <option value="">Elige una opción</option>
            {ANTECEDENTES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Adjuntar documento de antecedentes penales (opcional)">
          <input type="file" accept="image/*,.pdf" onChange={(e) => setAntecedentesDoc(e.target.files?.[0] ?? null)} className="text-sm" />
        </Campo>

        <Campo etiqueta="Referencia laboral 1 - nombre">
          <input required maxLength={LIMITE_NOMBRE} value={referencia1Nombre} onChange={(e) => setReferencia1Nombre(e.target.value)} className="input" placeholder="Ej. Juan Ramírez" />
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
          <input required maxLength={LIMITE_NOMBRE} value={referencia2Nombre} onChange={(e) => setReferencia2Nombre(e.target.value)} className="input" placeholder="Ej. Rosa Vela" />
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
          <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} className="text-sm" />
        </Campo>

        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={aceptaVerificacion}
            onChange={(e) => setAceptaVerificacion(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-700"
          />
          Acepto pasar por el proceso de verificación de YAVI antes de poder recibir pedidos.
        </label>

        {error && <Aviso tipo="error">{error}</Aviso>}

        <button
          type="submit"
          disabled={enviando}
          className="mt-2 rounded-xl bg-brand-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {enviando ? 'Guardando…' : error ? 'Reintentar' : 'Enviar mi perfil a verificación'}
        </button>
      </form>
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
