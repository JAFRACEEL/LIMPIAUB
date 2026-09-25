import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'

export function RecuperarContrasena() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/restablecer`,
    })
    setEnviando(false)
    if (error) {
      setError(traducirError(error))
      return
    }
    setEnviado(true)
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-57px)] max-w-lg flex-col justify-center px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Recupera tu contraseña</h1>
      <p className="mb-6 text-neutral-500">Te enviamos un enlace a tu correo para crear una nueva.</p>

      {enviado ? (
        <p className="rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-800">
          Listo. Revisa tu correo ({email}) y sigue el enlace para crear una nueva contraseña.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">Correo</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-neutral-300 px-4 py-3 text-base focus:border-teal-600"
              placeholder="tucorreo@ejemplo.com"
            />
          </label>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={enviando}
            className="mt-2 rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {enviando ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-neutral-500">
        <Link to="/login" className="font-semibold text-teal-700">
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  )
}
