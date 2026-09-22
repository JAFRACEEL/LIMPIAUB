import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export function Navbar() {
  const { session, perfil } = useAuth()
  const navigate = useNavigate()

  async function salir() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold text-teal-700">
          Limpi
        </Link>
        {session && (
          <div className="flex items-center gap-3 text-sm">
            {perfil?.rol === 'cliente' && (
              <Link to="/buscar" className="text-neutral-600">
                Buscar
              </Link>
            )}
            {perfil?.rol === 'trabajador' && (
              <Link to="/panel" className="text-neutral-600">
                Mi panel
              </Link>
            )}
            <button onClick={salir} className="font-medium text-neutral-500">
              Salir
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
