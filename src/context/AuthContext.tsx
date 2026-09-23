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

    // Datos guardados por una versión anterior del formulario (antes de
    // documento/zonas múltiples): les faltan campos que ahora son
    // obligatorios y nunca se van a poder completar solos. No hay nada que
    // reintentar en logins futuros; limpiamos y pedimos registrarse de nuevo
    // (la cuenta de Auth ya existe, así que no vuelve a intentar crearla).
    if (pendiente.rol === 'trabajador' && (!pendiente.numero_documento || !pendiente.zonas?.length)) {
      limpiarPendiente()
      setPerfil(null)
      alert('No pudimos completar tu registro anterior. Por favor vuelve a registrarte como trabajadora.')
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

    let errorTrabajador: unknown = null
    if (!errorPerfil && pendiente.rol === 'trabajador') {
      const resultado = await supabase.from('trabajadores').insert({
        id: user.id,
        genero: pendiente.genero,
        nacionalidad: pendiente.nacionalidad,
        tipo_documento: pendiente.tipo_documento,
        numero_documento: pendiente.numero_documento,
        zonas: pendiente.zonas,
        servicios: pendiente.servicios ?? [],
        tarifa_hora: pendiente.tarifa_hora,
        experiencia: pendiente.experiencia || null,
        antecedentes: pendiente.antecedentes || null,
        cuenta_autorizacion_migratoria: pendiente.cuenta_autorizacion_migratoria ?? null,
        estado_migratorio: pendiente.estado_migratorio,
        doc_migratorio_numero: pendiente.doc_migratorio_numero || null,
        doc_migratorio_vencimiento: pendiente.doc_migratorio_vencimiento || null,
        referencia1_nombre: pendiente.referencia1_nombre,
        referencia1_celular: pendiente.referencia1_celular,
        referencia2_nombre: pendiente.referencia2_nombre,
        referencia2_celular: pendiente.referencia2_celular,
      })
      errorTrabajador = resultado.error
    }

    if (!errorPerfil && errorTrabajador) {
      // Los datos eran válidos pero el insert falló por otra razón (p. ej. un
      // error de red): deshacemos el perfil para que el próximo login vuelva
      // a intentar el alta completa, en vez de quedar a medias para siempre.
      await supabase.from('perfiles').delete().eq('id', user.id)
      setPerfil(null)
      return
    }

    // Solo borramos los datos guardados si todo se creó bien; si algo falló
    // los dejamos para no perder la información de la persona.
    if (!errorPerfil && !errorTrabajador) limpiarPendiente()

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
