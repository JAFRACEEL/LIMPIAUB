import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../types'
import { APP } from '../lib/app'
import { datosClienteDesdeMetadata, filaPerfilCliente } from '../lib/altaCuenta'

interface AuthState {
  /** Todavía no se sabe qué tiene la cuenta (sesión, perfil y capacidades). */
  cargando: boolean
  session: Session | null
  perfil: Perfil | null
  recargarPerfil: () => Promise<void>
  /** Existe su fila en `trabajadores` (puede estar aún sin verificar). */
  esProfesional: boolean
  /** Está en la tabla `admins`. Solo sirve para mostrar u ocultar pantallas: la barrera real es RLS. */
  esAdmin: boolean
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [inicial, setInicial] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [esProfesional, setEsProfesional] = useState(false)
  const [esAdmin, setEsAdmin] = useState(false)
  // Id de la persona cuyo perfil y capacidades ya se cargaron. Mientras no coincida con la sesión, la app sigue "cargando":
  // así nadie ve "no hay perfil" ni es redirigido antes de saber qué tiene la cuenta. Un refresco de token no lo reinicia.
  const [idCargado, setIdCargado] = useState<string | null>(null)

  // Las capacidades salen de la base (no de perfiles.rol, que quedó congelado): "es profesional" = existe su fila
  // en trabajadores; "es admin" = está en la tabla admins (se pregunta con es_admin(), la tabla no se puede leer).
  async function cargarCapacidades(userId: string) {
    const [{ data: fila }, { data: admin }] = await Promise.all([
      supabase.from('trabajadores').select('id').eq('id', userId).maybeSingle(),
      supabase.rpc('es_admin'),
    ])
    setEsProfesional(!!fila)
    setEsAdmin(admin === true)
  }

  async function cargarPerfil(user: User) {
    await cargarPerfilBase(user)
    await cargarCapacidades(user.id)
    setIdCargado(user.id)
  }

  async function cargarPerfilBase(user: User) {
    const { data } = await supabase.from('perfiles').select('*').eq('id', user.id).maybeSingle()

    if (data) {
      setPerfil(data)
      return
    }

    // Sin fila en `perfiles`. Solo la app de clientes la crea sola, en el primer ingreso con sesión (después de confirmar
    // el correo), con el rol 'cliente' FIJO: el rol nunca se lee de user_metadata. De ahí solo salen los datos de contacto,
    // validados. En la app Profesional la fila (y la de trabajadores) la crea el formulario "Completar perfil de profesional".
    const datos = APP === 'cliente' ? datosClienteDesdeMetadata(user.user_metadata) : null
    if (!datos) {
      setPerfil(null)
      return
    }

    // Si dos cargas coinciden (inicio + evento de sesión), una choca con la otra por clave duplicada: no importa, se vuelve a leer.
    await supabase.from('perfiles').insert(filaPerfilCliente(user.id, datos))
    const { data: creado } = await supabase.from('perfiles').select('*').eq('id', user.id).maybeSingle()
    setPerfil(creado)
  }

  async function recargarPerfil() {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user) await cargarPerfil(data.session.user)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session?.user) await cargarPerfil(data.session.user)
      setInicial(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_evento, nuevaSession) => {
      setSession(nuevaSession)
      if (nuevaSession?.user) {
        await cargarPerfil(nuevaSession.user)
      } else {
        setPerfil(null)
        setIdCargado(null)
        setEsProfesional(false)
        setEsAdmin(false)
      }
    })

    return () => listener.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cargando = inicial || (!!session && idCargado !== session.user.id)

  return (
    <AuthContext.Provider value={{ cargando, session, perfil, recargarPerfil, esProfesional, esAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
