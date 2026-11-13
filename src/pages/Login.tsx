import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { esErrorCorreoNoConfirmado, reenviarConfirmacion } from '../lib/altaCuenta'
import { volverSeguro } from '../lib/rutas'
import { Logo } from '../components/Logo'
import { Aviso } from '../components/ui'

export function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const volver = volverSeguro(params.get('volver'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [sinConfirmar, setSinConfirmar] = useState(false)
  const [reenvio, setReenvio] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null)
  const [reenviando, setReenviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSinConfirmar(false)
    setReenvio(null)
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setEnviando(false)
    if (error) {
      if (esErrorCorreoNoConfirmado(error)) {
        setSinConfirmar(true)
        return
      }
      setError(traducirError(error))
      return
    }
    navigate(volver ?? '/')
  }

  async function reenviar() {
    setReenviando(true)
    setReenvio(null)
    const { error } = await reenviarConfirmacion(supabase.auth, email, window.location.origin, volver)
    setReenviando(false)
    setReenvio(error ? { tipo: 'error', texto: traducirError(error) } : { tipo: 'exito', texto: `Te enviamos el correo de confirmación a ${email.trim()}. Revisa también el spam.` })
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-57px)] max-w-lg flex-col justify-center px-4 py-6">
      <Logo className="mx-auto -mb-4 -mt-2 w-64" />
      <h1 className="mb-1 text-3xl font-extrabold">Inicia sesión</h1>
      <p className="mb-6 text-neutral-500">
        {volver === '/pedir' ? 'Entra para enviar tu pedido. Guardamos lo que escribiste.' : 'Entra a tu cuenta de YAVI.'}
      </p>

      <form onSubmit={onSubmit} className="yavi-tarjeta flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Correo</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
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
            className="input"
            placeholder="••••••••"
          />
        </label>

        <Link to="/recuperar" className="-mt-2 text-right text-sm font-medium text-brand-700">
          ¿Olvidaste tu contraseña?
        </Link>

        {error && (
          <Aviso tipo="error">{error}</Aviso>
        )}

        {sinConfirmar && (
          <Aviso tipo="alerta">
            Aún no confirmaste tu correo. Abre el enlace que te enviamos al registrarte (revisa también el spam) o pide que te lo
            enviemos de nuevo.
            <button type="button" onClick={reenviar} disabled={reenviando} className="mt-2 block font-semibold underline disabled:opacity-60">
              {reenviando ? 'Enviando…' : 'Reenviar correo de confirmación'}
            </button>
          </Aviso>
        )}
        {reenvio && <Aviso tipo={reenvio.tipo}>{reenvio.texto}</Aviso>}

        <button
          type="submit"
          disabled={enviando}
          className="mt-2 rounded-2xl bg-brand-700 px-4 py-3.5 text-base font-bold text-white disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        ¿No tienes cuenta?{' '}
        <Link to={volver ? `/registro?volver=${encodeURIComponent(volver)}` : '/registro'} className="font-semibold text-brand-700">
          Regístrate
        </Link>
      </p>
    </div>
  )
}
