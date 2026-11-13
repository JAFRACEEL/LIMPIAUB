import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { volverSeguro } from '../lib/rutas'
import { Logo } from '../components/Logo'
import { Aviso } from '../components/ui'

/**
 * A esta pantalla vuelve el enlace del correo de confirmación (en la MISMA app que lo originó).
 * Supabase deja la sesión iniciada al abrir el enlace; aquí solo se espera a que cargue y se sigue a "/" (o al pedido en curso).
 * Si el enlace venció o ya se usó, Supabase vuelve con un error en la URL (#error=...): se explica y se ofrece entrar.
 */
export function Confirmado() {
  const { cargando, session } = useAuth()
  const [params] = useSearchParams()
  const volver = volverSeguro(params.get('volver'))
  // La URL se lee una sola vez al abrir: el cliente de Supabase puede limpiarla después.
  const [errorEnlace] = useState(() => /[#&]error(_code)?=/.test(window.location.hash) || params.has('error'))

  if (errorEnlace && !session) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-57px)] max-w-lg flex-col justify-center px-4 py-6">
        <Logo className="mx-auto -mb-4 -mt-2 w-52" />
        <h1 className="mb-3 text-3xl font-extrabold">Este enlace ya no sirve</h1>
        <Aviso tipo="alerta">
          El enlace del correo venció o ya se usó. Si ya confirmaste tu correo, inicia sesión. Si no, entra y pide que te
          lo reenviemos.
        </Aviso>
        <Link to="/login" className="mt-6 rounded-2xl bg-brand-700 px-4 py-3.5 text-center text-base font-bold text-white">
          Ir a iniciar sesión
        </Link>
      </div>
    )
  }

  if (cargando) return <div className="p-6 text-center text-neutral-500">Confirmando tu correo…</div>
  // Sin sesión y sin error: el enlace se abrió sin completar la confirmación.
  if (!session) return <Navigate to="/login" replace />
  return <Navigate to={volver ?? '/'} replace />
}
