// Rutas de YAVI Admin. La barrera real es RLS (es_admin() en la base); esto solo evita mostrar pantallas vacías.
import { Navigate, Route, Routes } from 'react-router-dom'
import { RutaProtegida } from '../components/RutaProtegida'
import { useAuth } from '../context/AuthContext'
import { notifYaDecidido } from '../lib/push'
import { Login } from '../pages/Login'
import { RecuperarContrasena } from '../pages/RecuperarContrasena'
import { RestablecerContrasena } from '../pages/RestablecerContrasena'
import { Admin } from '../pages/Admin'
import { ActivarNotificaciones } from '../pages/ActivarNotificaciones'

function Raiz() {
  const { cargando, session, esAdmin } = useAuth()
  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!esAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="mb-2 text-lg font-semibold">Esta cuenta no es de administración</p>
        <p className="text-neutral-500">Entra con una cuenta de administrador.</p>
      </div>
    )
  }
  if (!notifYaDecidido(session.user.id)) return <Navigate to="/activar-notificaciones" replace />
  return <Navigate to="/admin" replace />
}

export default function RutasAdmin() {
  return (
    <Routes>
      <Route path="/" element={<Raiz />} />
      <Route path="/login" element={<Login />} />
      <Route path="/recuperar" element={<RecuperarContrasena />} />
      <Route path="/restablecer" element={<RestablecerContrasena />} />
      <Route path="/activar-notificaciones" element={<RutaProtegida><ActivarNotificaciones /></RutaProtegida>} />
      <Route path="/admin" element={<RutaProtegida requiere="admin"><Admin /></RutaProtegida>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
