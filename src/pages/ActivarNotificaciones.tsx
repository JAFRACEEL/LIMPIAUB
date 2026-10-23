import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { destinoPorRol } from '../lib/rutas'
import {
  activarNotificaciones,
  esIOS,
  esStandalone,
  marcarNotifDecidido,
  requiereInstalarComoApp,
  soportaPush,
  suscripcionLePerteneceA,
} from '../lib/push'

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>
}

export function ActivarNotificaciones() {
  const { session, perfil } = useAuth()
  const navigate = useNavigate()
  const destino = destinoPorRol(perfil)

  const [revisando, setRevisando] = useState(true)
  const [instalada, setInstalada] = useState(esStandalone())
  const [activando, setActivando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventoInstalacion, setEventoInstalacion] = useState<EventoInstalacion | null>(null)

  useEffect(() => {
    // Si el navegador ya tiene una suscripción activa Y está registrada para
    // esta cuenta en el servidor, no tiene sentido volver a pedirle esto: pasa
    // directo. (Si la suscripción del navegador es de otra cuenta que usó
    // este mismo dispositivo, no cuenta: activarNotificaciones la renueva.)
    if (!session) {
      setRevisando(false)
      return
    }
    let activo = true
    suscripcionLePerteneceA(session.user.id).then((esPropia) => {
      if (!activo) return
      if (esPropia) {
        marcarNotifDecidido(session.user.id)
        navigate(destino, { replace: true })
        return
      }
      setRevisando(false)
    })
    return () => {
      activo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setEventoInstalacion(e as EventoInstalacion)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', () => setInstalada(true))
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  function continuar() {
    if (!session) return
    marcarNotifDecidido(session.user.id)
    navigate(destino, { replace: true })
  }

  async function onActivar() {
    if (!session) return
    setActivando(true)
    setError(null)
    const resultado = await activarNotificaciones(session.user.id)
    setActivando(false)
    if (!resultado.ok) {
      setError(resultado.error ?? 'No pudimos activar las notificaciones.')
      return
    }
    continuar()
  }

  async function onInstalar() {
    if (!eventoInstalacion) return
    await eventoInstalacion.prompt()
    setEventoInstalacion(null)
  }

  if (revisando) {
    return <div className="p-6 text-center text-neutral-500">Un momento…</div>
  }

  const necesitaInstalarIOS = esIOS() && requiereInstalarComoApp() && !instalada

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-57px)] max-w-lg flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-3xl">
          🔔
        </div>
        <h1 className="mb-2 text-2xl font-bold">Activa las notificaciones</h1>
        <p className="text-neutral-500">
          {perfil?.rol === 'trabajador'
            ? 'Así te enteras al toque cuando llega un pedido, aunque tengas la app cerrada. Sin esto no podrás activar "Disponible ahora".'
            : 'Así sabes al toque cuando una trabajadora se postula, acepta tu pedido o cuando empieza y termina tu servicio.'}
        </p>
      </div>

      {necesitaInstalarIOS ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="mb-2 font-semibold">En iPhone, primero instala YAVI en tu pantalla de inicio:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Toca el ícono de <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba) en Safari.
              </li>
              <li>
                Elige <strong>"Agregar a inicio"</strong>.
              </li>
              <li>Abre YAVI desde el ícono que apareció en tu pantalla de inicio (no desde Safari).</li>
              <li>Vuelve a esta pantalla y activa las notificaciones.</li>
            </ol>
          </div>
          <button
            type="button"
            onClick={() => setInstalada(esStandalone())}
            className="rounded-xl bg-brand-700 px-4 py-3 font-semibold text-white"
          >
            Ya la instalé, continuar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {eventoInstalacion && !instalada && (
            <button
              type="button"
              onClick={onInstalar}
              className="rounded-xl border border-brand-700 px-4 py-3 font-semibold text-brand-700"
            >
              Instalar YAVI en mi celular
            </button>
          )}

          <button
            type="button"
            disabled={activando || !soportaPush()}
            onClick={onActivar}
            className="rounded-xl bg-brand-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {activando ? 'Activando…' : 'Activar notificaciones'}
          </button>

          {!soportaPush() && (
            <p className="text-center text-xs text-neutral-500">
              Tu navegador no soporta notificaciones push. Puedes continuar, pero no recibirás avisos.
            </p>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">{error}</p>}
        </div>
      )}

      <button type="button" onClick={continuar} className="mt-4 text-center text-sm font-medium text-neutral-500">
        Ahora no
      </button>
    </div>
  )
}
