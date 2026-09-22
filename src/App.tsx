import { Navigate, Route, Routes } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { RutaProtegida } from './components/RutaProtegida'
import { useAuth } from './context/AuthContext'
import { Login } from './pages/Login'
import { Registro } from './pages/Registro'
import { Buscar } from './pages/Buscar'
import { Panel } from './pages/Panel'

function Inicio() {
  const { cargando, session, perfil } = useAuth()
  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  if (perfil?.rol === 'trabajador') return <Navigate to="/panel" replace />
  return <Navigate to="/buscar" replace />
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
          path="/panel"
          element={
            <RutaProtegida rolRequerido="trabajador">
              <Panel />
            </RutaProtegida>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
