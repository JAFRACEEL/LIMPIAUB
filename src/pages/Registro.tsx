import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { ZONAS, SERVICIOS, ANTECEDENTES } from '../lib/constantes'
import { esDniValido, esCelularValido, esTarifaValida } from '../lib/validadores'
import { guardarPendiente } from '../lib/registroPendiente'
import type { Rol } from '../types'

export function Registro() {
  const navigate = useNavigate()
  const [rol, setRol] = useState<Rol>('cliente')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [celular, setCelular] = useState('')
  const [zona, setZona] = useState('')
  const [direccion, setDireccion] = useState('')

  const [dni, setDni] = useState('')
  const [servicios, setServicios] = useState<string[]>([])
  const [tarifaHora, setTarifaHora] = useState('')
  const [experiencia, setExperiencia] = useState('')
  const [antecedentes, setAntecedentes] = useState('')
  const [referencia1, setReferencia1] = useState('')
  const [referencia2, setReferencia2] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [aceptaVerificacion, setAceptaVerificacion] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function alternarServicio(s: string) {
    setServicios((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  function validar(): string | null {
    if (!nombre.trim()) return 'Escribe tu nombre completo.'
    if (!esCelularValido(celular)) return 'El celular debe tener 9 dígitos y empezar con 9.'
    if (!zona) return 'Elige tu zona.'
    if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.'

    if (rol === 'cliente' && !direccion.trim()) return 'Escribe tu dirección.'

    if (rol === 'trabajador') {
      if (!esDniValido(dni)) return 'El DNI debe tener 8 dígitos.'
      if (servicios.length === 0) return 'Elige al menos un servicio que ofreces.'
      const tarifa = Number(tarifaHora)
      if (!esTarifaValida(tarifa)) return 'La tarifa por hora debe estar entre S/ 5 y S/ 100.'
      if (!antecedentes) return 'Indica el estado de tus antecedentes penales.'
      if (!referencia1.trim() || !referencia2.trim()) return 'Escribe tus 2 referencias.'
      if (!aceptaVerificacion) return 'Debes aceptar el proceso de verificación de Limpi.'
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

    const { data, error: errorSignUp } = await supabase.auth.signUp({ email, password })

    if (errorSignUp || !data.user) {
      setError(traducirError(errorSignUp ?? new Error('No se pudo crear la cuenta.')))
      setEnviando(false)
      return
    }

    const referencias = `${referencia1.trim()}; ${referencia2.trim()}`

    // Sin sesión activa todavía significa que Supabase exige confirmar el
    // correo antes de dejar entrar. Guardamos los datos y los completamos en
    // el primer login (ver AuthContext.cargarPerfil).
    if (!data.session) {
      guardarPendiente({
        email,
        rol,
        nombre,
        telefono: celular,
        zona,
        direccion: rol === 'cliente' ? direccion : undefined,
        dni: rol === 'trabajador' ? dni : undefined,
        servicios: rol === 'trabajador' ? servicios : undefined,
        tarifa_hora: rol === 'trabajador' ? Number(tarifaHora) : undefined,
        experiencia: rol === 'trabajador' ? experiencia : undefined,
        antecedentes: rol === 'trabajador' ? antecedentes : undefined,
        referencias: rol === 'trabajador' ? referencias : undefined,
      })
      setEnviando(false)
      setError(null)
      alert('Te enviamos un correo de confirmación. Confírmalo y vuelve a iniciar sesión para terminar tu registro.')
      navigate('/login')
      return
    }

    const userId = data.user.id
    let fotoUrl: string | null = null

    if (rol === 'trabajador' && foto) {
      const extension = foto.name.split('.').pop() ?? 'jpg'
      const ruta = `${userId}/${Date.now()}.${extension}`
      const { error: errorSubida } = await supabase.storage.from('fotos').upload(ruta, foto, {
        upsert: true,
      })
      if (!errorSubida) {
        fotoUrl = supabase.storage.from('fotos').getPublicUrl(ruta).data.publicUrl
      }
    }

    const { error: errorPerfil } = await supabase.from('perfiles').insert({
      id: userId,
      rol,
      nombre,
      telefono: celular,
      zona,
      direccion: rol === 'cliente' ? direccion : null,
      foto_url: fotoUrl,
    })

    if (errorPerfil) {
      setError(traducirError(errorPerfil))
      setEnviando(false)
      return
    }

    if (rol === 'trabajador') {
      const { error: errorTrabajador } = await supabase.from('trabajadores').insert({
        id: userId,
        dni,
        servicios,
        tarifa_hora: Number(tarifaHora),
        experiencia: experiencia || null,
        antecedentes,
        referencias,
      })
      if (errorTrabajador) {
        setError(traducirError(errorTrabajador))
        setEnviando(false)
        return
      }
    }

    setEnviando(false)
    navigate(rol === 'trabajador' ? '/panel' : '/buscar')
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Crea tu cuenta</h1>
      <p className="mb-6 text-neutral-500">Elige cómo quieres usar Limpi.</p>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setRol('cliente')}
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            rol === 'cliente'
              ? 'border-teal-700 bg-teal-50 text-teal-800'
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
              ? 'border-teal-700 bg-teal-50 text-teal-800'
              : 'border-neutral-300 text-neutral-600'
          }`}
        >
          Soy trabajadora/or
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Campo etiqueta="Nombre completo">
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="input"
            placeholder="Ej. María Pérez"
          />
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

        {rol === 'cliente' && (
          <Campo etiqueta="Dirección">
            <input
              required
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className="input"
              placeholder="Jirón / calle, número, referencia"
            />
          </Campo>
        )}

        {rol === 'trabajador' && (
          <>
            <Campo etiqueta="DNI">
              <input
                required
                inputMode="numeric"
                maxLength={8}
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                className="input"
                placeholder="8 dígitos"
              />
            </Campo>

            <Campo etiqueta="Servicios que ofreces">
              <div className="flex flex-col gap-2 rounded-xl border border-neutral-300 p-3">
                {SERVICIOS.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={servicios.includes(s)}
                      onChange={() => alternarServicio(s)}
                      className="h-4 w-4 accent-teal-700"
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

            <Campo etiqueta="Referencia 1 (nombre y celular)">
              <input
                required
                value={referencia1}
                onChange={(e) => setReferencia1(e.target.value)}
                className="input"
                placeholder="Ej. Juan Ramírez - 987654321"
              />
            </Campo>

            <Campo etiqueta="Referencia 2 (nombre y celular)">
              <input
                required
                value={referencia2}
                onChange={(e) => setReferencia2(e.target.value)}
                className="input"
                placeholder="Ej. Rosa Vela - 987654322"
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
                className="mt-0.5 h-4 w-4 accent-teal-700"
              />
              Acepto pasar por el proceso de verificación de Limpi antes de poder recibir
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
          className="mt-2 rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-semibold text-teal-700">
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
