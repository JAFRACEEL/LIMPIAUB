import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'

export function RestablecerContrasena() {
  const navigate = useNavigate()
  const { cargando, session } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setError(null)
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password })
    setEnviando(false)
    if (error) {
      setError(traducirError(error))
      return
    }
    alert('Tu contraseña se actualizó. Ya puedes usarla para iniciar sesión.')
    navigate('/')
  }

  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando…</div>

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="mb-2 text-lg font-semibold">Este enlace ya no es válido</p>
        <p className="mb-4 text-neutral-500">
          Puede haber expirado o ya lo usaste. Pide uno nuevo para restablecer tu contraseña.
        </p>
        <Link to="/recuperar" className="font-semibold text-teal-700">
          Pedir un enlace nuevo
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-57px)] max-w-lg flex-col justify-center px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Crea tu nueva contraseña</h1>
      <p className="mb-6 text-neutral-500">Escríbela dos veces para confirmar.</p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Nueva contraseña</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-neutral-300 px-4 py-3 text-base focus:border-teal-600"
            placeholder="Mínimo 6 caracteres"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Repite la contraseña</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            className="rounded-xl border border-neutral-300 px-4 py-3 text-base focus:border-teal-600"
            placeholder="••••••••"
          />
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="mt-2 rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {enviando ? 'Guardando…' : 'Guardar nueva contraseña'}
        </button>
      </form>
    </div>
  )
}
