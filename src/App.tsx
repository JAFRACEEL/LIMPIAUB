import { lazy, Suspense, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { BarraInferior } from './components/BarraInferior'
import { useAuth } from './context/AuthContext'
import { ocultarSplash } from './lib/splash'
import { APP } from './lib/app'

// Cada build incluye solo las rutas de su app: __APP__ se fija al compilar y el resto no entra al bundle.
const Rutas = lazy(() =>
  __APP__ === 'admin'
    ? import('./apps/RutasAdmin')
    : __APP__ === 'profesional'
      ? import('./apps/RutasProfesional')
      : import('./apps/RutasCliente'),
)

// Al abrir la app en "/" sin sesión, tras la pantalla de inicio se muestra Iniciar sesión (una sola vez por carga).
let irALoginAlArrancar = window.location.pathname === '/'

function App() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { cargando, session, perfil } = useAuth()

  // La pantalla de inicio (index.html) se va cuando la app ya sabe si hay sesión.
  useEffect(() => {
    if (cargando) return
    if (irALoginAlArrancar && !session && pathname === '/') navigate('/login', { replace: true })
    irALoginAlArrancar = false
    ocultarSplash()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando])

  // Al tocar una notificación push con la app ya abierta en otra pestaña,
  // el service worker enfoca esa pestaña y nos manda a dónde navegar (una
  // pestaña ya enfocada no cambia de URL sola).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    function onMensaje(e: MessageEvent) {
      if (e.data?.tipo === 'limpi-navegar' && typeof e.data.url === 'string') navigate(e.data.url)
    }
    navigator.serviceWorker.addEventListener('message', onMensaje)
    return () => navigator.serviceWorker.removeEventListener('message', onMensaje)
  }, [navigate])

  // Barra inferior del cliente (no en el pedido, que tiene su propio botón principal).
  const enPedido = pathname.startsWith('/pedir')
  const mostrarBarra =
    APP === 'cliente' && !!session && !!perfil && !enPedido && !['/login', '/registro'].includes(pathname)

  return (
    <div className={`min-h-dvh ${mostrarBarra ? 'pb-20' : ''}`}>
      <Navbar />
      <Suspense fallback={<div className="p-6 text-center text-neutral-500">Cargando…</div>}>
        <Rutas />
      </Suspense>
      {mostrarBarra && <BarraInferior />}
    </div>
  )
}

export default App
