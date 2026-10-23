import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { activarNotificaciones, marcarNotifDecidido, notifYaDecidido, soportaPush, tieneSuscripcionGuardada } from '../lib/push'

/**
 * Se ofrece al crear un pedido, explicando para qué sirve. Si se rechaza o no se puede,
 * el recorrido sigue igual: en Mis servicios se ve todo en pantalla.
 */
export function AvisoNotificaciones() {
  const { session } = useAuth()
  const [visible, setVisible] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !soportaPush() || notifYaDecidido(session.user.id)) return
    let activo = true
    tieneSuscripcionGuardada(session.user.id).then((tiene) => {
      if (activo && !tiene) setVisible(true)
    })
    return () => {
      activo = false
    }
  }, [session])

  if (!visible || !session) return mensaje ? <p className="mb-4 rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700">{mensaje}</p> : null

  async function activar() {
    if (!session) return
    setTrabajando(true)
    const r = await activarNotificaciones(session.user.id)
    setTrabajando(false)
    setVisible(false)
    marcarNotifDecidido(session.user.id)
    setMensaje(r.ok ? 'Listo, te avisaremos.' : 'No pudimos activar los avisos. No pasa nada: aquí verás todo en pantalla.')
  }

  function ahoraNo() {
    if (!session) return
    marcarNotifDecidido(session.user.id)
    setVisible(false)
  }

  return (
    <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
      <p className="font-semibold text-brand-950">¿Quieres que te avisemos?</p>
      <p className="mt-1 text-sm text-brand-900">
        Te mandamos un aviso cuando un profesional acepte tu pedido, vaya en camino o te envíe un presupuesto. Así no tienes que estar mirando la pantalla.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={activar} disabled={trabajando} className="rounded-xl bg-brand-700 px-3 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {trabajando ? 'Activando…' : 'Sí, avísame'}
        </button>
        <button type="button" onClick={ahoraNo} className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm font-semibold text-neutral-700">
          Ahora no
        </button>
      </div>
    </div>
  )
}
