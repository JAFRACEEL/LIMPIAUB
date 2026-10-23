import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { borrarBorrador } from '../lib/borrador'
import { traducirError } from '../lib/errores'
import { ZONAS } from '../lib/constantes'
import { esCelularValido } from '../lib/validadores'
import { activarNotificaciones, desactivarNotificaciones, soportaPush, tieneSuscripcionGuardada } from '../lib/push'

export function Cuenta() {
  const navigate = useNavigate()
  const { session, perfil, recargarPerfil } = useAuth()
  const [telefono, setTelefono] = useState(perfil?.telefono ?? '')
  const [zona, setZona] = useState(perfil?.zona ?? '')
  const [direccion, setDireccion] = useState(perfil?.direccion ?? '')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [avisos, setAvisos] = useState<boolean | null>(null)
  const [cambiandoAvisos, setCambiandoAvisos] = useState(false)

  useEffect(() => {
    if (!perfil) return
    setTelefono(perfil.telefono)
    setZona(perfil.zona)
    setDireccion(perfil.direccion ?? '')
  }, [perfil])

  useEffect(() => {
    if (!session) return
    tieneSuscripcionGuardada(session.user.id).then(setAvisos)
  }, [session])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!perfil) return
    if (!esCelularValido(telefono)) {
      setMensaje({ tipo: 'error', texto: 'El celular debe tener 9 dígitos y empezar con 9.' })
      return
    }
    if (!zona) {
      setMensaje({ tipo: 'error', texto: 'Elige tu zona.' })
      return
    }
    setGuardando(true)
    const { error } = await supabase
      .from('perfiles')
      .update({ telefono, zona, direccion: direccion.trim() || null })
      .eq('id', perfil.id)
    setGuardando(false)
    if (error) {
      setMensaje({ tipo: 'error', texto: traducirError(error) })
      return
    }
    await recargarPerfil()
    setMensaje({ tipo: 'ok', texto: 'Listo, guardamos tus datos.' })
  }

  async function alternarAvisos() {
    if (!session) return
    setCambiandoAvisos(true)
    if (avisos) {
      await desactivarNotificaciones(session.user.id)
      setAvisos(false)
    } else {
      const r = await activarNotificaciones(session.user.id)
      setAvisos(r.ok)
      if (!r.ok) setMensaje({ tipo: 'error', texto: r.error ?? 'No pudimos activar los avisos.' })
    }
    setCambiandoAvisos(false)
  }

  async function salir() {
    borrarBorrador()
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (!perfil) return <div className="p-6 text-center text-neutral-500">Cargando…</div>

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold">Cuenta</h1>
      <p className="mb-5 text-neutral-500">{perfil.nombre} · {session?.user.email}</p>

      <form onSubmit={guardar} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Celular</span>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" className="input" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Zona</span>
          <select value={zona} onChange={(e) => setZona(e.target.value)} className="input">
            <option value="">Elige tu zona</option>
            {ZONAS.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Dirección de siempre</span>
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className="input" placeholder="Jirón / calle, número, referencia" />
          <span className="text-xs text-neutral-500">Se usa como punto de partida en tus pedidos; siempre puedes cambiarla.</span>
        </label>
        {mensaje && (
          <p className={`rounded-lg px-3 py-2 text-sm ${mensaje.tipo === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{mensaje.texto}</p>
        )}
        <button type="submit" disabled={guardando} className="rounded-xl bg-brand-700 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </form>

      <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="text-base font-semibold">Avisos en este celular</h2>
        {soportaPush() ? (
          <>
            <p className="mt-1 text-sm text-neutral-600">
              Te avisamos cuando un profesional responde tu pedido, va en camino o termina. {avisos ? 'Están activados.' : 'Están desactivados.'}
            </p>
            <button
              type="button"
              onClick={alternarAvisos}
              disabled={cambiandoAvisos || avisos === null}
              className="mt-3 w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm font-semibold text-neutral-800 disabled:opacity-60"
            >
              {avisos ? 'Desactivar avisos' : 'Activar avisos'}
            </button>
          </>
        ) : (
          <p className="mt-1 text-sm text-neutral-600">Este navegador no permite avisos. Revisa Mis servicios para ver novedades.</p>
        )}
      </section>

      <button type="button" onClick={salir} className="mt-6 w-full rounded-xl border border-red-300 px-4 py-3 text-sm font-semibold text-red-700">
        Cerrar sesión
      </button>
    </div>
  )
}
