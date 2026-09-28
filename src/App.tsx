import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { RutaProtegida } from './components/RutaProtegida'
import { useAuth } from './context/AuthContext'
import { destinoPorRol } from './lib/rutas'
import { notifYaDecidido } from './lib/push'
import { Login } from './pages/Login'
import { Registro } from './pages/Registro'
import { RecuperarContrasena } from './pages/RecuperarContrasena'
import { RestablecerContrasena } from './pages/RestablecerContrasena'
import { Buscar } from './pages/Buscar'
import { Panel } from './pages/Panel'
import { Admin } from './pages/Admin'
import { PerfilTrabajador } from './pages/PerfilTrabajador'
import { Reservar } from './pages/Reservar'
import { MisReservas } from './pages/MisReservas'
import { ActivarNotificaciones } from './pages/ActivarNotificaciones'

function Inicio() {
  const { cargando, session, perfil } = useAuth()
  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  // Hay sesión pero no encontramos tu fila en `perfiles`: mandarte al lado
  // cliente por defecto aquí sería confuso (pareces cliente sin serlo).
  if (!perfil) return <PerfilNoEncontrado />
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

function App() {
  const navigate = useNavigate()

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

  return (
    <div className="min-h-dvh">
      <Navbar />
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<Registro />} />
        <Route path="/recuperar" element={<RecuperarContrasena />} />
        <Route path="/restablecer" element={<RestablecerContrasena />} />
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
          path="/reservar"
          element={
            <RutaProtegida rolRequerido="cliente">
              <Reservar />
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
    </div>
  )
}

export default App
