// Rutas de YAVI Profesional. No incluye los pedidos del cliente ni el admin.
import { Navigate, Route, Routes } from 'react-router-dom'
import { RutaProtegida } from '../components/RutaProtegida'
import { useAuth } from '../context/AuthContext'
import { notifYaDecidido } from '../lib/push'
import { Login } from '../pages/Login'
import { Confirmado } from '../pages/Confirmado'
import { Registro } from '../pages/Registro'
import { RecuperarContrasena } from '../pages/RecuperarContrasena'
import { RestablecerContrasena } from '../pages/RestablecerContrasena'
import { Panel } from '../pages/Panel'
import { ActivarNotificaciones } from '../pages/ActivarNotificaciones'

/**
 * "/" decide a dónde ir:
 *  - sin cuenta -> iniciar sesión;
 *  - con cuenta pero sin perfil de profesional (cuenta nueva, cliente o alta abandonada) -> completar el perfil de profesional;
 *  - con perfil de profesional -> activar notificaciones (una vez) y el panel.
 */
function Raiz() {
  const { cargando, session, esProfesional } = useAuth()
  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  // Con o sin perfil base, quien aún no es profesional completa su perfil (ahí se crea todo, ya con sesión).
  if (!esProfesional) return <Navigate to="/registro" replace />
  if (!notifYaDecidido(session.user.id)) return <Navigate to="/activar-notificaciones" replace />
  return <Navigate to="/panel" replace />
}

export default function RutasProfesional() {
  return (
    <Routes>
      <Route path="/" element={<Raiz />} />
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Registro />} />
      <Route path="/confirmado" element={<Confirmado />} />
      <Route path="/recuperar" element={<RecuperarContrasena />} />
      <Route path="/restablecer" element={<RestablecerContrasena />} />
      <Route path="/activar-notificaciones" element={<RutaProtegida><ActivarNotificaciones /></RutaProtegida>} />
      <Route path="/panel/*" element={<RutaProtegida requiere="profesional"><Panel /></RutaProtegida>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
