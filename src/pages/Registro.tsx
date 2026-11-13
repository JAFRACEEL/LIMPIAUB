import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { RevisaTuCorreo } from '../components/RevisaTuCorreo'
import { Aviso } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { APP } from '../lib/app'
import { correoYaTieneCuenta, errorContacto, LIMITE_DIRECCION, LIMITE_NOMBRE, metadataCliente, urlConfirmado } from '../lib/altaCuenta'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { volverSeguro } from '../lib/rutas'
import { ZONAS } from '../lib/constantes'
import { CompletarPerfilProfesional } from './CompletarPerfilProfesional'

/**
 * /registro:
 *  - sin sesión: crear la cuenta (correo + contraseña; en la app de clientes también sus datos de contacto). Solo se crea el
 *    usuario de acceso y se envía el correo de confirmación: NO se guarda nada más hasta que la persona confirme y entre;
 *  - con sesión: en la app Profesional, "Completar perfil de profesional"; en la de clientes no hay nada que registrar.
 */
export function Registro() {
  const { cargando, session } = useAuth()
  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando…</div>
  if (session) {
    return APP === 'profesional' ? <CompletarPerfilProfesional /> : <Navigate to="/" replace />
  }
  return <FormularioCuenta />
}

function FormularioCuenta() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const volver = volverSeguro(params.get('volver'))
  const esProfesional = APP === 'profesional'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [celular, setCelular] = useState('')
  const [direccion, setDireccion] = useState('')
  const [zona, setZona] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [correoExiste, setCorreoExiste] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // Correo al que se envió la confirmación (null = todavía se está llenando el formulario).
  const [enviadoA, setEnviadoA] = useState<string | null>(null)

  function validar(): string | null {
    if (!esProfesional) {
      // Misma regla (y mismos límites) con la que luego se crea el perfil: si pasa aquí, no se queda sin perfil al confirmar.
      const mensaje = errorContacto({ nombre, telefono: celular, direccion, zona })
      if (mensaje) return mensaje
    }
    if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.'
    return null
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    const mensaje = validar()
    if (mensaje) {
      setError(mensaje)
      return
    }
    setError(null)
    setCorreoExiste(false)
    setEnviando(true)
    try {
      const correo = email.trim()
      const { data, error: errorSignUp } = await supabase.auth.signUp({
        email: correo,
        password,
        options: {
          // El enlace del correo vuelve a ESTA app (mismo dominio) y deja la sesión iniciada.
          emailRedirectTo: urlConfirmado(window.location.origin, volver),
          // Solo datos de contacto del cliente. Nunca el rol. El profesional no manda nada: todo se pide ya con sesión.
          data: esProfesional ? undefined : metadataCliente({ nombre, telefono: celular, zona, direccion }),
        },
      })
      if (errorSignUp || !data.user) {
        setError(traducirError(errorSignUp ?? new Error('No se pudo crear la cuenta.')))
        return
      }
      // Correo que ya tiene cuenta: nunca se crea otra. Se invita a iniciar sesión.
      if (correoYaTieneCuenta(data.user)) {
        setCorreoExiste(true)
        return
      }
      // Si el proyecto aún no exige confirmar el correo, ya hay sesión: se sigue como cualquier ingreso.
      if (data.session) {
        navigate(volver ?? '/', { replace: true })
        return
      }
      setEnviadoA(correo)
    } catch (err) {
      setError(traducirError(err))
    } finally {
      setEnviando(false)
    }
  }

  if (enviadoA) {
    return <RevisaTuCorreo email={enviadoA} volver={volver} onCambiarCorreo={() => setEnviadoA(null)} />
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <Logo className="mx-auto -mb-4 -mt-2 w-52" />
      <h1 className="mb-1 text-3xl font-extrabold">Crea tu cuenta</h1>
      <p className="mb-6 text-neutral-500">
        {esProfesional
          ? 'Primero tu correo y una contraseña. Te enviamos un enlace para confirmarlo y luego completas tu perfil de profesional.'
          : 'Pide servicios para tu hogar en Iquitos.'}
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {!esProfesional && (
          <>
            <Campo etiqueta="Nombre completo">
              <input required maxLength={LIMITE_NOMBRE} value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" placeholder="Ej. María Pérez" />
            </Campo>
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
            <Campo etiqueta="Dirección">
              <input
                required
                maxLength={LIMITE_DIRECCION}
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                className="input"
                placeholder="Jirón / calle, número, referencia"
              />
            </Campo>
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
          </>
        )}

        <Campo etiqueta="Correo">
          <input
            required
            type="email"
            autoComplete="email"
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            placeholder="Mínimo 6 caracteres"
          />
        </Campo>

        {correoExiste && (
          <Aviso tipo="alerta">
            Ese correo ya tiene cuenta en YAVI.{' '}
            <Link to={volver ? `/login?volver=${encodeURIComponent(volver)}` : '/login'} className="font-semibold underline">
              Inicia sesión
            </Link>
            {esProfesional ? ' con él: si todavía no eres profesional, completarás tu perfil ahí mismo.' : '.'} Si olvidaste la
            contraseña, puedes recuperarla.
          </Aviso>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}

        <button
          type="submit"
          disabled={enviando}
          className="mt-2 rounded-xl bg-brand-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        {esProfesional ? '¿Ya tienes cuenta de YAVI (como cliente o profesional)?' : '¿Ya tienes cuenta?'}{' '}
        <Link to={volver ? `/login?volver=${encodeURIComponent(volver)}` : '/login'} className="font-semibold text-brand-700">
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
