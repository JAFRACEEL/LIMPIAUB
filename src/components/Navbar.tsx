import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { cerrarSesion } from '../lib/sesion'
import { Logo } from './Logo'
import { Avatar, Icono } from './PanelProfesional'
import { CLASE_ALTO_AVISO, ES_ENTORNO_PRUEBAS } from './AvisoEntornoPruebas'

/** Barra superior. El cliente navega con la barra inferior (Inicio, Mis servicios, Cuenta); aquí solo va la marca. */
export function Navbar() {
  const { session, perfil } = useAuth()
  const navigate = useNavigate()

  async function salir() {
    await cerrarSesion()
    navigate('/login')
  }


  return (
    <header className={`sticky ${ES_ENTORNO_PRUEBAS ? CLASE_ALTO_AVISO : 'top-0'} z-10 border-b border-neutral-200/70 bg-white/85 shadow-xs backdrop-blur`}>
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-2">
        <Link to="/" aria-label="YAVI, ir al inicio" className="flex items-center gap-1.5 text-xl font-extrabold tracking-tight text-brand-700">
          <Logo variante="icono" className="h-10 w-10" />
          YAVI
        </Link>
        {!session && (
          <div className="flex items-center gap-3 text-sm">
            <Link to="/login" className="font-semibold text-brand-700">
              Ingresar
            </Link>
          </div>
        )}
        {session && perfil?.rol === 'trabajador' && (
          <div className="flex items-center gap-3">
            <Link
              to="/activar-notificaciones"
              aria-label="Notificaciones"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-navy-800 shadow-md ring-1 ring-black/5"
            >
              <Icono nombre="campana" className="h-6 w-6" />
            </Link>
            <Link to="/panel?editar=1" aria-label="Mi perfil" className="rounded-full">
              <Avatar nombre={perfil.nombre} fotoUrl={perfil.foto_url} className="h-11 w-11 text-sm" />
            </Link>
          </div>
        )}
        {session && perfil?.rol === 'admin' && (
          <div className="flex items-center gap-3 text-sm">
            <Link to="/admin" className="text-neutral-600">
              Admin
            </Link>
            <Link to="/activar-notificaciones" className="text-neutral-500" aria-label="Notificaciones">
              🔔
            </Link>
            <button onClick={salir} className="font-medium text-neutral-500">
              Salir
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
