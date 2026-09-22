import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../types'
import { leerPendiente, limpiarPendiente } from '../lib/registroPendiente'

interface AuthState {
  cargando: boolean
  session: Session | null
  perfil: Perfil | null
  recargarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)

  async function cargarPerfil(user: User) {
    const { data } = await supabase.from('perfiles').select('*').eq('id', user.id).maybeSingle()

    if (data) {
      setPerfil(data)
      return
    }

    // No hay fila en `perfiles` todavía: puede ser un registro que quedó
    // pendiente de confirmar el correo. Si tenemos los datos guardados,
    // completamos el alta ahora que sí existe una sesión autenticada.
    const pendiente = user.email ? leerPendiente(user.email) : null
    if (!pendiente) {
      setPerfil(null)
      return
    }

    const { error: errorPerfil } = await supabase.from('perfiles').insert({
      id: user.id,
      rol: pendiente.rol,
      nombre: pendiente.nombre,
      telefono: pendiente.telefono,
      zona: pendiente.zona,
      direccion: pendiente.direccion ?? null,
    })

    if (!errorPerfil && pendiente.rol === 'trabajador') {
      await supabase.from('trabajadores').insert({
        id: user.id,
        dni: pendiente.dni,
        servicios: pendiente.servicios ?? [],
        tarifa_hora: pendiente.tarifa_hora,
        experiencia: pendiente.experiencia ?? null,
        antecedentes: pendiente.antecedentes ?? null,
        referencias: pendiente.referencias ?? null,
      })
    }

    if (!errorPerfil) limpiarPendiente()

    const { data: creado } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    setPerfil(creado)
  }

  async function recargarPerfil() {
    if (session?.user) await cargarPerfil(session.user)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session?.user) await cargarPerfil(data.session.user)
      setCargando(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_evento, nuevaSession) => {
      setSession(nuevaSession)
      if (nuevaSession?.user) {
        await cargarPerfil(nuevaSession.user)
      } else {
        setPerfil(null)
      }
    })

    return () => listener.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthContext.Provider value={{ cargando, session, perfil, recargarPerfil }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
