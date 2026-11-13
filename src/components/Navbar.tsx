import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { cerrarSesion } from '../lib/sesion'
import { Logo } from './Logo'
import { Icono } from './PanelProfesional'
import { APP, NOMBRE_APP } from '../lib/app'
import { CLASE_ALTO_AVISO, ES_ENTORNO_PRUEBAS } from './AvisoEntornoPruebas'

/**
 * Barra superior. El cliente navega con la barra inferior (Inicio, Mis servicios, Cuenta); aquí va la marca y, siempre que
 * haya sesión, "Cerrar sesión" (también sin perfil: así nadie queda atrapado con la cuenta equivocada).
 */
export function Navbar() {
  const { session, esProfesional } = useAuth()
  const navigate = useNavigate()

  async function salir() {
    await cerrarSesion()
    navigate('/login')
  }

  return (
    <header className={`sticky ${ES_ENTORNO_PRUEBAS ? CLASE_ALTO_AVISO : 'top-0'} z-10 border-b border-neutral-200/70 bg-white/85 shadow-xs backdrop-blur`}>
      <div className={`mx-auto flex max-w-lg items-center justify-between px-4 py-2 ${APP === 'profesional' ? 'md:max-w-2xl' : ''}`}>
        <Link to="/" aria-label={`${NOMBRE_APP[APP]}, ir al inicio`} className="flex items-center gap-1.5 text-xl font-extrabold tracking-tight text-brand-700">
          <Logo variante="icono" className="h-10 w-10" />
          {NOMBRE_APP[APP]}
        </Link>
        {!session && (
          <div className="flex items-center gap-3 text-sm">
            <Link to="/login" className="font-semibold text-brand-700">
              Ingresar
            </Link>
          </div>
        )}
        {session && APP === 'cliente' && (
          <button onClick={salir} className="text-sm font-semibold text-brand-700">
            Cerrar sesión
          </button>
        )}
        {session && APP === 'profesional' && (
          <div className="flex items-center gap-3">
            <button onClick={salir} className="text-sm font-semibold text-brand-700">
              Cerrar sesión
            </button>
            {esProfesional && (
              <Link
                to="/activar-notificaciones"
                aria-label="Notificaciones"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-navy-800 shadow-md ring-1 ring-black/5"
              >
                <Icono nombre="campana" className="h-6 w-6" />
              </Link>
            )}
          </div>
        )}
        {session && APP === 'admin' && (
          <div className="flex items-center gap-3 text-sm">
            <Link to="/admin" className="text-neutral-600">
              Admin
            </Link>
            <Link to="/activar-notificaciones" className="text-neutral-500" aria-label="Notificaciones">
              🔔
            </Link>
            <button onClick={salir} className="font-medium text-neutral-500">
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
