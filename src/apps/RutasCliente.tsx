// Rutas de la app YAVI (cliente). No incluye el panel del profesional ni el admin.
import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { RutaProtegida } from '../components/RutaProtegida'
import { useAuth } from '../context/AuthContext'
import { APP } from '../lib/app'
import { notifYaDecidido, suscripcionesDe } from '../lib/push'
import { debeOfrecerReactivacion } from '../lib/pushReactivar'
import { CompletarPerfilCliente } from '../pages/CompletarPerfilCliente'
import { Login } from '../pages/Login'
import { Confirmado } from '../pages/Confirmado'
import { Registro } from '../pages/Registro'
import { RecuperarContrasena } from '../pages/RecuperarContrasena'
import { RestablecerContrasena } from '../pages/RestablecerContrasena'
import { Buscar } from '../pages/Buscar'
import { PerfilTrabajador } from '../pages/PerfilTrabajador'
import { Inicio } from '../pages/Inicio'
import { Pedir } from '../pages/Pedir'
import { MisReservas } from '../pages/MisReservas'
import { Cuenta } from '../pages/Cuenta'
import { ActivarNotificaciones } from '../pages/ActivarNotificaciones'

/** "/" es el inicio del cliente (también sin cuenta: se puede explorar y armar un pedido). */
function Raiz() {
  const { cargando, session, perfil } = useAuth()
  const reactivar = useOfertaReactivarAvisos(session?.user.id, !!perfil)
  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando…</div>
  if (!session) return <Inicio />
  // Hay sesión pero no hay fila en `perfiles` (los datos del registro no sirvieron o falló la creación): se piden de nuevo,
  // con "Cerrar sesión" a mano. Nunca queda sin salida.
  if (!perfil) return <CompletarPerfilCliente />
  // Tenía avisos activados antes de separar las apps (suscripción sin app): se le ofrece reactivarlos, una vez.
  if (reactivar === 'revisando') return <div className="p-6 text-center text-neutral-500">Cargando…</div>
  if (reactivar === 'si') return <Navigate to="/activar-notificaciones" replace />
  return <Inicio />
}

/** 'si' = mostrar una vez la pantalla de reactivar avisos. Solo consulta si la persona aún no decidió (activar o "Ahora no"). */
function useOfertaReactivarAvisos(userId: string | undefined, hayPerfil: boolean): 'revisando' | 'si' | 'no' {
  const [estado, setEstado] = useState<{ id: string; r: 'si' | 'no' } | null>(null)
  const pendiente = !!userId && hayPerfil && !notifYaDecidido(userId)
  useEffect(() => {
    if (!pendiente || !userId) return
    let activo = true
    suscripcionesDe(userId).then((subs) => {
      if (activo) setEstado({ id: userId, r: subs && debeOfrecerReactivacion(subs, APP, false) ? 'si' : 'no' })
    })
    return () => {
      activo = false
    }
  }, [pendiente, userId])
  if (!pendiente) return 'no'
  return estado?.id === userId ? estado.r : 'revisando'
}

/** /reservar quedó reemplazado por /pedir (se conserva el profesional elegido, si lo hay). */
function RedirigirReservar() {
  const { search } = useLocation()
  return <Navigate to={`/pedir${search}`} replace />
}

export default function RutasCliente() {
  return (
    <Routes>
      <Route path="/" element={<Raiz />} />
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Registro />} />
      <Route path="/confirmado" element={<Confirmado />} />
      <Route path="/recuperar" element={<RecuperarContrasena />} />
      <Route path="/restablecer" element={<RestablecerContrasena />} />
      <Route path="/pedir" element={<Pedir />} />
      <Route path="/reservar" element={<RedirigirReservar />} />
      <Route path="/buscar" element={<RutaProtegida requiere="cliente"><Buscar /></RutaProtegida>} />
      <Route path="/t/:id" element={<RutaProtegida requiere="cliente"><PerfilTrabajador /></RutaProtegida>} />
      <Route path="/reservas" element={<RutaProtegida requiere="cliente"><MisReservas /></RutaProtegida>} />
      <Route path="/cuenta" element={<RutaProtegida requiere="cliente"><Cuenta /></RutaProtegida>} />
      <Route path="/activar-notificaciones" element={<RutaProtegida><ActivarNotificaciones /></RutaProtegida>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
