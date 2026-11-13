import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { ESPERA_REENVIO_S, reenviarConfirmacion } from '../lib/altaCuenta'
import { Logo } from './Logo'
import { Aviso } from './ui'

/** Pantalla posterior al registro: todavía no hay sesión ni se guardó nada. Permite reenviar el correo o cambiarlo. */
export function RevisaTuCorreo({
  email,
  volver,
  onCambiarCorreo,
}: {
  email: string
  volver?: string | null
  onCambiarCorreo: () => void
}) {
  const [espera, setEspera] = useState(ESPERA_REENVIO_S)
  const [reenviando, setReenviando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null)

  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  async function reenviar() {
    setReenviando(true)
    setMensaje(null)
    const { error } = await reenviarConfirmacion(supabase.auth, email, window.location.origin, volver)
    setReenviando(false)
    if (error) {
      setMensaje({ tipo: 'error', texto: traducirError(error) })
      return
    }
    setMensaje({ tipo: 'exito', texto: 'Te enviamos el correo de nuevo.' })
    setEspera(ESPERA_REENVIO_S)
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-57px)] max-w-lg flex-col justify-center px-4 py-6">
      <Logo className="mx-auto -mb-4 -mt-2 w-52" />
      <h1 className="mb-1 text-3xl font-extrabold">Revisa tu correo</h1>
      <p className="mb-4 text-neutral-600">
        Te enviamos un enlace a <strong className="break-all">{email}</strong>. Ábrelo desde este mismo celular para
        confirmar tu cuenta y entrar.
      </p>
      <p className="mb-6 text-sm text-neutral-500">
        Si no lo ves en unos minutos, revisa la carpeta de spam o correo no deseado.
      </p>

      {mensaje && <Aviso tipo={mensaje.tipo} className="mb-4">{mensaje.texto}</Aviso>}

      <div className="yavi-tarjeta flex flex-col gap-3 p-5">
        <button
          type="button"
          onClick={reenviar}
          disabled={reenviando || espera > 0}
          className="rounded-2xl bg-brand-700 px-4 py-3.5 text-base font-bold text-white disabled:opacity-60"
        >
          {reenviando ? 'Enviando…' : espera > 0 ? `Reenviar correo (${espera} s)` : 'Reenviar correo'}
        </button>
        <button type="button" onClick={onCambiarCorreo} className="rounded-2xl px-4 py-3 text-base font-semibold text-brand-700">
          Cambiar correo
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-neutral-500">
        ¿Ya confirmaste?{' '}
        <Link to="/login" className="font-semibold text-brand-700">
          Inicia sesión
        </Link>
      </p>
    </div>
  )
}
