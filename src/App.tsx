import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { BarraInferior } from './components/BarraInferior'
import { RutaProtegida } from './components/RutaProtegida'
import { useAuth } from './context/AuthContext'
import { destinoPorRol } from './lib/rutas'
import { notifYaDecidido } from './lib/push'
import { ocultarSplash } from './lib/splash'
import { Login } from './pages/Login'
import { Registro } from './pages/Registro'
import { RecuperarContrasena } from './pages/RecuperarContrasena'
import { RestablecerContrasena } from './pages/RestablecerContrasena'
import { Buscar } from './pages/Buscar'
import { Panel } from './pages/Panel'
import { Admin } from './pages/Admin'
import { PerfilTrabajador } from './pages/PerfilTrabajador'
import { Inicio } from './pages/Inicio'
import { Pedir } from './pages/Pedir'
import { MisReservas } from './pages/MisReservas'
import { Cuenta } from './pages/Cuenta'
import { ActivarNotificaciones } from './pages/ActivarNotificaciones'

/**
 * "/" es el inicio del cliente (también para quien aún no tiene cuenta: se puede
 * explorar y armar un pedido). Profesionales y admin siguen yendo a su panel.
 */
function Raiz() {
  const { cargando, session, perfil } = useAuth()
  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando…</div>
  if (!session) return <Inicio />
  // Hay sesión pero no encontramos tu fila en `perfiles`: mandarte al lado
  // cliente por defecto aquí sería confuso (pareces cliente sin serlo).
  if (!perfil) return <PerfilNoEncontrado />
  if (perfil.rol === 'cliente') return <Inicio />
  if (!notifYaDecidido(session.user.id)) return <Navigate to="/activar-notificaciones" replace />
  return <Navigate to={destinoPorRol(perfil)} replace />
}

function PerfilNoEncontrado() {
  return (
    <div className="mx-auto max-w-lg px-4 py-10 text-center">
      <p className="mb-2 text-lg font-semibold">No encontramos tu perfil</p>
      <p className="text-neutral-500">
        Si acabas de registrarte y confirmar tu correo, intenta cerrar sesión y volver a entrar. Si el problema
        sigue, contáctanos.
      </p>
    </div>
  )
}

/** /reservar quedó reemplazado por /pedir (se conserva el profesional elegido, si lo hay). */
function RedirigirReservar() {
  const { search } = useLocation()
  return <Navigate to={`/pedir${search}`} replace />
}

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
  const mostrarBarra = !!session && perfil?.rol === 'cliente' && !enPedido && !['/login', '/registro'].includes(pathname)

  return (
    <div className={`min-h-dvh ${mostrarBarra ? 'pb-20' : ''}`}>
      <Navbar />
      <Routes>
        <Route path="/" element={<Raiz />} />
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<Registro />} />
        <Route path="/recuperar" element={<RecuperarContrasena />} />
        <Route path="/restablecer" element={<RestablecerContrasena />} />
        <Route path="/pedir" element={<Pedir />} />
        <Route path="/reservar" element={<RedirigirReservar />} />
        <Route
          path="/buscar"
          element={
            <RutaProtegida rolRequerido="cliente">
              <Buscar />
            </RutaProtegida>
          }
        />
        <Route
          path="/t/:id"
          element={
            <RutaProtegida rolRequerido="cliente">
              <PerfilTrabajador />
            </RutaProtegida>
          }
        />
        <Route
          path="/reservas"
          element={
            <RutaProtegida rolRequerido="cliente">
              <MisReservas />
            </RutaProtegida>
          }
        />
        <Route
          path="/cuenta"
          element={
            <RutaProtegida rolRequerido="cliente">
              <Cuenta />
            </RutaProtegida>
          }
        />
        <Route
          path="/activar-notificaciones"
          element={
            <RutaProtegida>
              <ActivarNotificaciones />
            </RutaProtegida>
          }
        />
        <Route
          path="/panel"
          element={
            <RutaProtegida rolRequerido="trabajador">
              <Panel />
            </RutaProtegida>
          }
        />
        <Route
          path="/admin"
          element={
            <RutaProtegida rolRequerido="admin">
              <Admin />
            </RutaProtegida>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {mostrarBarra && <BarraInferior />}
    </div>
  )
}

export default App
