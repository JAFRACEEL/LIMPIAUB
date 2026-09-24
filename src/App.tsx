import { Navigate, Route, Routes } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { RutaProtegida } from './components/RutaProtegida'
import { useAuth } from './context/AuthContext'
import { Login } from './pages/Login'
import { Registro } from './pages/Registro'
import { Buscar } from './pages/Buscar'
import { Panel } from './pages/Panel'
import { Admin } from './pages/Admin'
import { PerfilTrabajador } from './pages/PerfilTrabajador'
import { Reservar } from './pages/Reservar'
import { MisReservas } from './pages/MisReservas'

function Inicio() {
  const { cargando, session, perfil } = useAuth()
  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  if (perfil?.rol === 'trabajador') return <Navigate to="/panel" replace />
  if (perfil?.rol === 'admin') return <Navigate to="/admin" replace />
  if (perfil?.rol === 'cliente') return <Navigate to="/buscar" replace />
  // Hay sesión pero no encontramos tu fila en `perfiles`: mandarte al lado
  // cliente por defecto aquí sería confuso (pareces cliente sin serlo).
  return <PerfilNoEncontrado />
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
  return (
    <div className="min-h-dvh">
      <Navbar />
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<Registro />} />
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
