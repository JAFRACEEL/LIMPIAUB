import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { Aviso } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { borradorClienteDesdeMetadata, errorContacto, filaPerfilCliente, LIMITE_DIRECCION, LIMITE_NOMBRE } from '../lib/altaCuenta'
import { ZONAS } from '../lib/constantes'
import { traducirError } from '../lib/errores'
import { cerrarSesion } from '../lib/sesion'
import { supabase } from '../lib/supabase'

/**
 * "Completa tus datos": cuenta confirmada y con sesión, pero sin fila en `perfiles` (los datos que se escribieron al registrarse
 * no pasaron la validación, o la creación falló). En vez de dejar a la persona sin salida, se rellena con lo que se pudo leer,
 * se corrige y se reintenta. El rol es siempre 'cliente' (lo fija filaPerfilCliente; nunca sale de user_metadata).
 */
export function CompletarPerfilCliente() {
  const { session, recargarPerfil } = useAuth()
  const navigate = useNavigate()
  const previo = borradorClienteDesdeMetadata(session?.user.user_metadata)

  const [nombre, setNombre] = useState(previo.nombre)
  const [celular, setCelular] = useState(previo.telefono)
  const [direccion, setDireccion] = useState(previo.direccion)
  const [zona, setZona] = useState(previo.zona)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (enviando || !session) return
    const mensaje = errorContacto({ nombre, telefono: celular, direccion, zona })
    if (mensaje) {
      setError(mensaje)
      return
    }
    setError(null)
    setEnviando(true)
    try {
      const fila = filaPerfilCliente(session.user.id, {
        nombre: nombre.trim(),
        telefono: celular.trim(),
        zona,
        direccion: direccion.trim(),
      })
      const { error: errorInsert } = await supabase.from('perfiles').insert(fila)
      // 23505 = ya existe la fila (otra pestaña o carga la creó): no es un error, se vuelve a leer.
      if (errorInsert && errorInsert.code !== '23505') throw errorInsert
      await recargarPerfil()
    } catch (err) {
      // Lo escrito se conserva: se puede corregir y reintentar.
      setError(traducirError(err))
    } finally {
      setEnviando(false)
    }
  }

  async function salir() {
    await cerrarSesion()
    navigate('/login')
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <Logo className="mx-auto -mb-4 -mt-2 w-52" />
      <h1 className="mb-1 text-3xl font-extrabold">Completa tus datos</h1>
      <p className="mb-2 text-neutral-500">
        Tu correo ya está confirmado. Revisa tus datos de contacto para terminar de crear tu cuenta.
      </p>
      <p className="mb-6 text-sm text-neutral-500">
        Cuenta: <strong className="break-all">{session?.user.email}</strong> ·{' '}
        <button type="button" onClick={salir} disabled={enviando} className="font-semibold text-brand-700 disabled:opacity-50">
          Cerrar sesión
        </button>
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Campo etiqueta="Nombre completo">
          <input required maxLength={LIMITE_NOMBRE} value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" placeholder="Ej. María Pérez" />
        </Campo>
        <Campo etiqueta="Celular">
          <input required inputMode="numeric" value={celular} onChange={(e) => setCelular(e.target.value)} className="input" placeholder="9XXXXXXXX" />
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
          <select required value={zona} onChange={(e) => setZona(e.target.value)} className="input">
            <option value="">Elige tu zona</option>
            {ZONAS.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Campo>

        {error && <Aviso tipo="error">{error}</Aviso>}

        <button type="submit" disabled={enviando} className="mt-2 rounded-xl bg-brand-700 px-4 py-3 font-semibold text-white disabled:opacity-60">
          {enviando ? 'Guardando…' : error ? 'Reintentar' : 'Guardar y continuar'}
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
