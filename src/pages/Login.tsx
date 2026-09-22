import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'

export function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setEnviando(false)
    if (error) {
      setError(traducirError(error))
      return
    }
    navigate('/')
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-57px)] max-w-lg flex-col justify-center px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Inicia sesión</h1>
      <p className="mb-6 text-neutral-500">Entra a tu cuenta de Limpi.</p>

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

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Contraseña</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-neutral-300 px-4 py-3 text-base focus:border-teal-600"
            placeholder="••••••••"
          />
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="mt-2 rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        ¿No tienes cuenta?{' '}
        <Link to="/registro" className="font-semibold text-teal-700">
          Regístrate
        </Link>
      </p>
    </div>
  )
}
