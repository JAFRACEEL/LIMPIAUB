import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { ESTADO_RESERVA_LABELS, whatsappUrl } from '../lib/constantes'
import { ETIQUETA_MODALIDAD } from '../lib/modalidades'
import { desgloseAceptado, resumenPago } from '../lib/estadoPago'
import { useToasts } from '../lib/useToasts'
import { Estrellas } from '../components/Estrellas'
import { FormularioCalificacion } from '../components/FormularioCalificacion'
import { DetallesServicioVista } from '../components/DetallesServicioVista'
import { DesglosePrecio } from '../components/DesglosePrecio'
import { PropuestaTarjeta } from '../components/PropuestaTarjeta'
import { PropuestasServicio } from '../components/PropuestasServicio'
import { EtiquetaPago, PagoReserva } from '../components/PagoReserva'
import { AvisoNotificaciones } from '../components/AvisoNotificaciones'
import type { Pago, Propuesta, Reserva, TrabajadorContacto, TrabajadorPublico } from '../types'

// Se carga solo cuando hace falta (una reserva en camino), para no meter
// Leaflet en el bundle principal de gente que nunca llega a ver el mapa.
const MapaSeguimiento = lazy(() => import('../components/MapaSeguimiento'))

// Suspense solo cubre la carga; si falla la descarga del chunk del mapa
// (típico con conexión inestable en un celular de gama baja), sin este
// límite de error se caería toda la pantalla de reservas, no solo el mapa.
class LimiteMapa extends Component<{ children: ReactNode; alternativa: ReactNode }, { fallo: boolean }> {
  state = { fallo: false }
  static getDerivedStateFromError() {
    return { fallo: true }
  }
  render() {
    return this.state.fallo ? this.props.alternativa : this.props.children
  }
}

const ESTADOS_ACTIVOS = ['solicitada', 'aceptada', 'en_camino', 'en_curso']

function agrupar<T extends { reserva_id: string }>(filas: T[]): Record<string, T[]> {
  const mapa: Record<string, T[]> = {}
  for (const f of filas) (mapa[f.reserva_id] ??= []).push(f)
  return mapa
}

export function MisReservas() {
  const { session } = useAuth()
  const [params, setParams] = useSearchParams()
  const nuevo = params.get('nuevo')
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [contactos, setContactos] = useState<Record<string, TrabajadorContacto>>({})
  const [perfiles, setPerfiles] = useState<Record<string, TrabajadorPublico>>({})
  const [propuestas, setPropuestas] = useState<Record<string, Propuesta[]>>({})
  const [pagos, setPagos] = useState<Record<string, Pago[]>>({})
  const [candidatos, setCandidatos] = useState<Record<string, string[]>>({})
  const [calificadas, setCalificadas] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editandoDireccion, setEditandoDireccion] = useState<string | null>(null)
  const [nuevaDireccion, setNuevaDireccion] = useState('')
  const [guardandoDireccion, setGuardandoDireccion] = useState(false)
  const { toasts, agregar } = useToasts()

  const cargar = useCallback(async () => {
    if (!session) return
    setError(null)
    const [{ data: datos, error: errorReservas }, { data: propias }] = await Promise.all([
      supabase.from('reservas').select('*').eq('cliente_id', session.user.id).order('creado_en', { ascending: false }),
      supabase.from('calificaciones').select('reserva_id').eq('de_id', session.user.id),
    ])
    if (errorReservas) {
      setError(traducirError(errorReservas))
      setCargando(false)
      return
    }
    const lista = (datos as Reserva[]) ?? []
    setReservas(lista)
    setCalificadas(new Set((propias ?? []).map((c) => c.reserva_id)))

    const ids = lista.map((r) => r.id)
    const abiertas = lista.filter((r) => r.estado === 'solicitada' && r.modo === 'abierto' && !r.trabajador_id).map((r) => r.id)
    const [rp, rg, rc] = await Promise.all([
      ids.length ? supabase.from('propuestas').select('*').in('reserva_id', ids).order('creado_en') : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('pagos').select('*').in('reserva_id', ids).order('creado_en') : Promise.resolve({ data: [] }),
      abiertas.length
        ? supabase.from('candidaturas').select('reserva_id, trabajador_id').in('reserva_id', abiertas).eq('estado', 'pendiente')
        : Promise.resolve({ data: [] }),
    ])
    const props = (rp.data as Propuesta[]) ?? []
    setPropuestas(agrupar(props))
    setPagos(agrupar((rg.data as Pago[]) ?? []))
    const porReserva: Record<string, string[]> = {}
    for (const c of (rc.data as { reserva_id: string; trabajador_id: string }[]) ?? []) (porReserva[c.reserva_id] ??= []).push(c.trabajador_id)
    setCandidatos(porReserva)

    // Datos públicos de quienes aceptaron (sin teléfono: el contacto llega al contratar).
    const idsPerfil = Array.from(new Set([...props.map((p) => p.trabajador_id), ...Object.values(porReserva).flat()]))
    if (idsPerfil.length > 0) {
      const { data } = await supabase.from('v_trabajadores_publicos').select('*').in('id', idsPerfil)
      const mapa: Record<string, TrabajadorPublico> = {}
      for (const t of (data as TrabajadorPublico[]) ?? []) mapa[t.id] = t
      setPerfiles(mapa)
    } else {
      setPerfiles({})
    }

    const idsAsignados = Array.from(new Set(lista.map((r) => r.trabajador_id).filter((id): id is string => !!id)))
    if (idsAsignados.length > 0) {
      const { data: datosContacto } = await supabase.from('v_trabajador_contacto').select('*').in('id', idsAsignados)
      const mapa: Record<string, TrabajadorContacto> = {}
      for (const c of (datosContacto as TrabajadorContacto[]) ?? []) mapa[c.id] = c
      setContactos(mapa)
    } else {
      setContactos({})
    }
    setCargando(false)
  }, [session])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (!session) return
    const canal = supabase
      .channel(`reservas-cliente-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reservas', filter: `cliente_id=eq.${session.user.id}` },
        (payload) => {
          const estado = (payload.new as { estado?: string }).estado
          const anterior = (payload.old as { estado?: string } | undefined)?.estado
          if (estado && estado !== anterior) agregar(`Tu servicio cambió a: ${ESTADO_RESERVA_LABELS[estado] ?? estado}`)
          cargar()
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'propuestas' }, () => {
        agregar('Tienes novedades en tu pedido')
        cargar()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidaturas' }, () => cargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos' }, () => cargar())
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [session, cargar, agregar])

  async function cancelar(id: string) {
    // Si el profesional ya inició o terminó el servicio justo antes de este
    // clic, no queremos pisar ese cambio: solo cancela si sigue solicitada o
    // recién aceptada.
    const { data, error: errorCancelar } = await supabase
      .from('reservas')
      .update({ estado: 'cancelada' })
      .eq('id', id)
      .in('estado', ['solicitada', 'aceptada'])
      .select('id')
    if (errorCancelar) alert(traducirError(errorCancelar))
    else if (!data || data.length === 0) agregar('Este servicio ya había cambiado. Actualizamos tu lista.')
    cargar()
  }

  function empezarEdicionDireccion(r: Reserva) {
    setEditandoDireccion(r.id)
    setNuevaDireccion(r.direccion)
  }

  async function verFoto(ruta: string | null) {
    if (!ruta) return
    const { data, error: errorFoto } = await supabase.storage.from('documentos').createSignedUrl(ruta, 300)
    if (errorFoto || !data) {
      setError(traducirError(errorFoto ?? new Error('No se pudo abrir la foto.')))
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function guardarDireccion(id: string) {
    if (!nuevaDireccion.trim()) return
    setGuardandoDireccion(true)
    // Si justo se completó o canceló antes de este clic, no queremos
    // cambiarle la dirección a un servicio que ya terminó.
    const { data, error: errorUpdate } = await supabase
      .from('reservas')
      .update({ direccion: nuevaDireccion.trim() })
      .eq('id', id)
      .in('estado', ['solicitada', 'aceptada', 'en_curso'])
      .select('id')
    setGuardandoDireccion(false)
    if (errorUpdate) {
      alert(traducirError(errorUpdate))
      return
    }
    if (!data || data.length === 0) {
      agregar('Este servicio ya había cambiado y no se puede editar la dirección.')
    }
    setEditandoDireccion(null)
    cargar()
  }

  const activos = useMemo(() => reservas.filter((r) => ESTADOS_ACTIVOS.includes(r.estado)), [reservas])
  const anteriores = useMemo(() => reservas.filter((r) => !ESTADOS_ACTIVOS.includes(r.estado)), [reservas])

  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando tus servicios…</div>

  function tarjeta(r: Reserva) {
    const contacto = r.trabajador_id ? contactos[r.trabajador_id] : undefined
    const props = propuestas[r.id] ?? []
    const ofrecidasServicio = props.filter((p) => p.tipo === 'servicio' && p.estado === 'ofrecida')
    const porResponder = props.filter((p) => p.tipo !== 'servicio' && p.estado === 'ofrecida')
    const desglose = desgloseAceptado(r, props)
    const pago = resumenPago(r, pagos[r.id] ?? [])
    const esAbierta = r.estado === 'solicitada' && r.modo === 'abierto' && !r.trabajador_id
    return (
      <li key={r.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{r.servicio}</p>
            {r.subtipo_servicio && <p className="text-sm text-neutral-500">{r.subtipo_servicio}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
              {ESTADO_RESERVA_LABELS[r.estado] ?? r.estado}
            </span>
            <EtiquetaPago estado={pago.estado} />
          </div>
        </div>

        <p className="mt-1 text-sm text-neutral-500">
          {r.programacion === 'ahora' && r.estado === 'solicitada' ? 'Lo antes posible · ' : ''}
          {new Date(`${r.fecha}T${r.hora}`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
          {r.hora.slice(0, 5)}
          {r.modalidad_precio === 'horas' ? ` · ${r.horas} h${r.personas > 1 ? ` × ${r.personas} personas` : ''}` : ` · ${ETIQUETA_MODALIDAD[r.modalidad_precio]}`}
        </p>
        <p className="text-sm text-neutral-500">{r.zona}</p>
        {r.descripcion_trabajo && <p className="mt-1 text-sm italic text-neutral-600">“{r.descripcion_trabajo}”</p>}
        <DetallesServicioVista detalles={r.detalles_servicio} fotoLegado={r.foto_referencia_ruta} onVerFoto={verFoto} />

        {editandoDireccion === r.id ? (
          <div className="mt-2 flex flex-col gap-2">
            <input value={nuevaDireccion} onChange={(e) => setNuevaDireccion(e.target.value)} className="input" placeholder="Jirón / calle, número, referencia" />
            <div className="flex gap-2">
              <button disabled={guardandoDireccion} onClick={() => guardarDireccion(r.id)} className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                Guardar dirección
              </button>
              <button onClick={() => setEditandoDireccion(null)} className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm text-neutral-700">{r.direccion}</p>
            {['solicitada', 'aceptada', 'en_curso'].includes(r.estado) && (
              <button onClick={() => empezarEdicionDireccion(r)} className="shrink-0 text-xs font-semibold text-teal-700">
                Cambiar dirección
              </button>
            )}
          </div>
        )}

        {desglose && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-teal-800">
              Total: S/ {desglose.total.toFixed(2)} · ver detalle del precio
            </summary>
            <div className="mt-2">
              <DesglosePrecio desglose={desglose} />
            </div>
          </details>
        )}
        {!desglose && r.total != null && r.estado !== 'solicitada' && (
          <p className="mt-2 text-sm font-semibold text-teal-700">Total: S/ {(r.total_cliente ?? r.total).toFixed(2)}</p>
        )}

        {contacto && (
          <div className="mt-3 flex items-center gap-2">
            <img src={contacto.foto_url ?? 'https://placehold.co/40x40?text=%20'} alt="" className="h-10 w-10 rounded-full object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{contacto.nombre}</p>
              <Estrellas promedio={contacto.rating_avg} cantidad={contacto.rating_n} />
            </div>
            {['aceptada', 'en_camino', 'en_curso', 'completada'].includes(r.estado) && (
              <a
                href={whatsappUrl(contacto.telefono, `Hola ${contacto.nombre}, te escribo por mi servicio de Limpi (${r.servicio}).`)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white"
              >
                WhatsApp
              </a>
            )}
          </div>
        )}

        {r.estado === 'solicitada' && r.modo === 'directo' && (
          <p className="mt-3 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600">
            {r.ventana_cierra_en && new Date(r.ventana_cierra_en).getTime() < Date.now()
              ? 'El profesional no respondió a tiempo. Puedes cancelar y pedirlo de nuevo, o enviarlo a otros profesionales.'
              : 'Esperando la respuesta del profesional (tiene 15 minutos).'}{' '}
            {r.ventana_cierra_en && new Date(r.ventana_cierra_en).getTime() < Date.now() && (
              <Link to="/pedir" className="font-semibold text-teal-700 underline">
                Pedir de nuevo
              </Link>
            )}
          </p>
        )}

        {contacto && r.estado === 'en_camino' && (
          <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-2">
            <p className="px-1 pb-1 text-sm font-medium text-teal-800">🚗 {contacto.nombre.split(' ')[0]} va en camino</p>
            {r.ubicacion_lat != null && r.ubicacion_lng != null ? (
              <LimiteMapa
                alternativa={
                  <a
                    href={`https://www.google.com/maps?q=${r.ubicacion_lat},${r.ubicacion_lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-1 pb-1 text-xs font-semibold text-teal-800 underline"
                  >
                    No pudimos cargar el mapa. Ver ubicación en Google Maps
                  </a>
                }
              >
                <Suspense fallback={<div className="h-56 w-full animate-pulse rounded-xl bg-teal-100" />}>
                  <MapaSeguimiento lat={r.ubicacion_lat} lng={r.ubicacion_lng} nombre={contacto.nombre} />
                </Suspense>
              </LimiteMapa>
            ) : (
              <p className="px-1 pb-1 text-xs text-teal-700">Esperando su ubicación…</p>
            )}
            <div className="flex flex-wrap gap-x-3 px-1 pt-1 text-xs text-teal-700">
              {r.hora_llegada && (
                <span>Llegó a las {new Date(r.hora_llegada).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {r.ubicacion_actualizada_en && (
                <span>Actualizado hace {Math.max(0, Math.round((Date.now() - new Date(r.ubicacion_actualizada_en).getTime()) / 60000))} min</span>
              )}
            </div>
          </div>
        )}

        {r.estado === 'en_curso' && r.fin_estimado && (
          <p className="mt-2 text-sm text-neutral-500">
            Fin estimado: {new Date(r.fin_estimado).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}

        {contacto && (r.estado === 'aceptada' || r.estado === 'en_camino') && (
          <>
            <a
              href={whatsappUrl(contacto.telefono, `Hola ${contacto.nombre}, aquí te comparto mi ubicación en vivo para que me encuentres más fácil 📍`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block rounded-lg border border-green-600 px-3 py-2.5 text-center text-xs font-semibold text-green-700"
            >
              📍 Enviar mi ubicación en vivo por WhatsApp
            </a>
            <p className="mt-1 text-center text-[11px] text-neutral-400">En WhatsApp, toca el clip 📎 → Ubicación → Compartir ubicación en tiempo real</p>
          </>
        )}

        {/* Presupuestos y adicionales: detalle y acción explícita */}
        {porResponder.length > 0 && (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-sm font-semibold text-amber-800">Necesitamos tu respuesta</p>
            {porResponder.map((p) => (
              <PropuestaTarjeta key={p.id} propuesta={p} nombre={perfiles[p.trabajador_id]?.nombre ?? contactos[p.trabajador_id]?.nombre} onResuelta={cargar} />
            ))}
          </div>
        )}

        {esAbierta && (
          <PropuestasServicio
            reserva={r}
            propuestas={ofrecidasServicio}
            candidatos={candidatos[r.id] ?? []}
            perfiles={perfiles}
            onCambio={cargar}
          />
        )}

        {session && ['aceptada', 'en_camino', 'en_curso', 'completada'].includes(r.estado) && (
          <PagoReserva reservaId={r.id} clienteId={session.user.id} resumen={pago} onCambio={cargar} />
        )}

        {(r.estado === 'solicitada' || r.estado === 'aceptada') && (
          <button onClick={() => cancelar(r.id)} className="mt-3 w-full rounded-lg border border-red-300 px-3 py-2.5 text-sm font-semibold text-red-700">
            Cancelar
          </button>
        )}

        {r.estado === 'completada' && r.trabajador_id && !calificadas.has(r.id) && session && (
          <div className="mt-3">
            <FormularioCalificacion reservaId={r.id} paraId={r.trabajador_id} deId={session.user.id} onCalificado={cargar} />
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Mis servicios</h1>

      <div className="pointer-events-none fixed inset-x-0 top-16 z-20 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg">
            {t.mensaje}
          </div>
        ))}
      </div>

      {nuevo && (
        <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="font-semibold text-green-900">¡Pedido enviado!</p>
          <p className="mt-1 text-sm text-green-800">Ya avisamos a los profesionales. Aquí verás quién acepta y su precio antes de contratar.</p>
          <button onClick={() => setParams({}, { replace: true })} className="mt-2 text-xs font-semibold text-green-900 underline">
            Entendido
          </button>
        </div>
      )}
      {nuevo && <AvisoNotificaciones />}

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {reservas.length === 0 ? (
        <div className="rounded-2xl bg-neutral-100 px-4 py-8 text-center">
          <p className="text-sm text-neutral-600">Todavía no has pedido ningún servicio.</p>
          <Link to="/" className="mt-3 inline-block rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white">
            Contar qué necesito
          </Link>
        </div>
      ) : (
        <>
          {activos.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">En curso</h2>
              <ul className="flex flex-col gap-4">{activos.map(tarjeta)}</ul>
            </>
          )}
          {anteriores.length > 0 && (
            <>
              <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-500">Anteriores</h2>
              <ul className="flex flex-col gap-4">{anteriores.map(tarjeta)}</ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
