import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { useToasts } from '../lib/useToasts'
import { inicioSemanaLima, inicioMesLima, whatsappUrl, MARGEN_TRASLADO_MINUTOS } from '../lib/constantes'
import { calcularComision, seSolapan } from '../lib/calculos'
import { tieneSuscripcionGuardada } from '../lib/push'
import { activarSonido, audioListo, detenerAlarma, iniciarAlarma, prepararSonido, reproducirSonidoAlerta } from '../lib/sonido'
import { FormularioCalificacion } from '../components/FormularioCalificacion'
import { EditarPerfilTrabajador } from '../components/EditarPerfilTrabajador'
import {
  BarraProfesional,
  BurbujaIcono,
  Estadistica,
  Ganancia,
  Icono,
  TarjetaInterruptor,
  TarjetaPerfil,
  type PestanaProfesional,
} from '../components/PanelProfesional'
import { cerrarSesion } from '../lib/sesion'
import { ofreceKitDeLimpieza } from '../lib/panelProfesional'
import { formatoSoles, RECARGO_KIT } from '../lib/precios'
import { DetallesServicioVista } from '../components/DetallesServicioVista'
import type { DetallesServicio } from '../lib/preguntasServicio'
import { PedidoEntranteOverlay, type PedidoEntranteOverlayData } from '../components/PedidoEntranteOverlay'
import type { PedidoAbierto, PrestamoKit, PrestamoKitMovimiento, Reserva, Trabajador } from '../types'

function vibrar() {
  try {
    navigator.vibrate?.(200)
  } catch {
    // no soportado en este dispositivo/navegador
  }
}

export function Panel() {
  const { session, perfil } = useAuth()
  const [editando, setEditando] = useState(false)
  const [pestana, setPestana] = useState<PestanaProfesional>('panel')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [trabajador, setTrabajador] = useState<Trabajador | null>(null)
  const [reservasPropias, setReservasPropias] = useState<Reserva[]>([])
  const [pedidosAbiertos, setPedidosAbiertos] = useState<PedidoAbierto[]>([])
  const [postulaciones, setPostulaciones] = useState<Record<string, PedidoAbierto>>({})
  const [calificadas, setCalificadas] = useState<Set<string>>(new Set())
  const [ganancias, setGanancias] = useState({ semana: 0, mes: 0 })
  const [prestamo, setPrestamo] = useState<PrestamoKit | null>(null)
  const [movimientosPrestamo, setMovimientosPrestamo] = useState<PrestamoKitMovimiento[]>([])
  const [contactosClientes, setContactosClientes] = useState<Record<string, { nombre: string; telefono: string }>>({})
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tieneNotificaciones, setTieneNotificaciones] = useState<boolean | null>(null)
  const [descartadosAbiertos, setDescartadosAbiertos] = useState<Set<string>>(new Set())
  const [overlayMinimizado, setOverlayMinimizado] = useState(false)
  const [overlayConfirmacion, setOverlayConfirmacion] = useState<{
    tipo: 'aceptado' | 'rechazado'
    titulo: string
    mensaje: string
  } | null>(null)
  const { toasts, agregar } = useToasts()
  const pedidosAbiertosRef = useRef<PedidoAbierto[]>([])
  const primeraCargaRef = useRef(true)
  const trabajadorRef = useRef<Trabajador | null>(null)
  const idPedidoActualRef = useRef<string | null>(null)
  const refMisServicios = useRef<HTMLElement | null>(null)

  const cargarTrabajador = useCallback(async () => {
    if (!session) return null
    const { data, error: errorCarga } = await supabase
      .from('trabajadores')
      .select('*')
      .eq('id', session.user.id)
      .single()
    if (errorCarga) setError(traducirError(errorCarga))
    else setTrabajador(data)
    return data as Trabajador | null
  }, [session])

  const cargarReservasPropias = useCallback(async () => {
    if (!session) return
    const { data } = await supabase
      .from('reservas')
      .select('*')
      .eq('trabajador_id', session.user.id)
      .order('creado_en', { ascending: false })
    setReservasPropias((data as Reserva[]) ?? [])
  }, [session])

  // La vista v_pedidos_abiertos ya decide qué ve cada profesional: los pedidos "ahora" exigen estar
  // disponible ahora; los programados se ven aunque el interruptor esté apagado (siempre con los
  // filtros de especialidad, zona, habilitación y solapamiento). Por eso aquí solo se exige estar habilitado.
  const cargarPedidosAbiertos = useCallback(async (habilitado: boolean) => {
    if (!habilitado) {
      setPedidosAbiertos([])
      return
    }
    const { data } = await supabase
      .from('v_pedidos_abiertos')
      .select('*')
      .order('creado_en', { ascending: true })
    const nuevos = (data as PedidoAbierto[]) ?? []
    if (!primeraCargaRef.current && nuevos.length > pedidosAbiertosRef.current.length) {
      vibrar()
      reproducirSonidoAlerta()
    }
    primeraCargaRef.current = false
    pedidosAbiertosRef.current = nuevos
    setPedidosAbiertos(nuevos)
  }, [])

  const cargarCalificadas = useCallback(async () => {
    if (!session) return
    const { data } = await supabase.from('calificaciones').select('reserva_id').eq('de_id', session.user.id)
    setCalificadas(new Set((data ?? []).map((c) => c.reserva_id)))
  }, [session])

  const cargarPostulaciones = useCallback(async () => {
    if (!session) return
    const { data } = await supabase.from('v_mis_postulaciones').select('*')
    const mapa: Record<string, PedidoAbierto> = {}
    for (const p of (data as PedidoAbierto[]) ?? []) mapa[p.id] = p
    setPostulaciones(mapa)
  }, [session])

  const cargarGanancias = useCallback(async () => {
    if (!session) return
    const { data } = await supabase
      .from('reservas')
      .select('total, comision_pct, recargo_materiales, fecha')
      .eq('trabajador_id', session.user.id)
      .eq('estado', 'completada')
    const inicioSemana = inicioSemanaLima()
    const inicioMes = inicioMesLima()
    let semana = 0
    let mes = 0
    for (const r of data ?? []) {
      if (r.total == null) continue
      const subtotalServicio = r.total - r.recargo_materiales
      const { netoTrabajadora } = calcularComision(subtotalServicio, r.comision_pct, r.recargo_materiales)
      if (r.fecha >= inicioMes) mes += netoTrabajadora
      if (r.fecha >= inicioSemana) semana += netoTrabajadora
    }
    setGanancias({ semana, mes })
  }, [session])

  const cargarPrestamo = useCallback(async () => {
    if (!session) return
    // El más reciente (activo o ya pagado), no solo los activos: si pedimos
    // solo activos, apenas se paga el último descuento esta consulta deja de
    // encontrar la fila y el historial de movimientos desaparece con ella.
    const { data } = await supabase
      .from('prestamos_kit')
      .select('*')
      .eq('trabajador_id', session.user.id)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle()
    const fila = (data as PrestamoKit | null) ?? null
    setPrestamo(fila)
    if (fila) {
      const { data: movs } = await supabase
        .from('prestamo_kit_movimientos')
        .select('*')
        .eq('prestamo_id', fila.id)
        .order('creado_en', { ascending: false })
        .limit(10)
      setMovimientosPrestamo((movs as PrestamoKitMovimiento[]) ?? [])
    } else {
      setMovimientosPrestamo([])
    }
  }, [session])

  const cargarContactosClientes = useCallback(async () => {
    if (!session) return
    const { data } = await supabase.from('v_cliente_contacto').select('*')
    const mapa: Record<string, { nombre: string; telefono: string }> = {}
    for (const c of (data as { id: string; nombre: string; telefono: string }[]) ?? []) {
      mapa[c.id] = { nombre: c.nombre, telefono: c.telefono }
    }
    setContactosClientes(mapa)
  }, [session])

  const cargarNotificaciones = useCallback(async () => {
    if (!session) return
    setTieneNotificaciones(await tieneSuscripcionGuardada(session.user.id))
  }, [session])

  const cargarTodo = useCallback(async () => {
    const t = await cargarTrabajador()
    await Promise.all([
      cargarReservasPropias(),
      cargarPedidosAbiertos(t?.habilitado_trabajar ?? false),
      cargarCalificadas(),
      cargarPostulaciones(),
      cargarGanancias(),
      cargarPrestamo(),
      cargarContactosClientes(),
      cargarNotificaciones(),
    ])
    setCargando(false)
  }, [
    cargarTrabajador,
    cargarReservasPropias,
    cargarPedidosAbiertos,
    cargarCalificadas,
    cargarPostulaciones,
    cargarGanancias,
    cargarPrestamo,
    cargarContactosClientes,
    cargarNotificaciones,
  ])

  useEffect(() => {
    cargarTodo()
  }, [cargarTodo])

  useEffect(() => {
    trabajadorRef.current = trabajador
  }, [trabajador])

  useEffect(() => {
    if (params.get('editar') !== '1' || !trabajador) return
    setEditando(true)
    setPestana('perfil')
    setParams({}, { replace: true })
    window.setTimeout(() => document.getElementById('editar-perfil')?.scrollIntoView({ block: 'start' }), 0)
  }, [params, trabajador, setParams])

  useEffect(() => {
    if (!session) return
    const uid = session.user.id

    const canalReservas = supabase
      .channel(`reservas-trabajador-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reservas', filter: `trabajador_id=eq.${uid}` },
        () => {
          vibrar()
          reproducirSonidoAlerta()
          cargarReservasPropias()
          cargarContactosClientes()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reservas', filter: `trabajador_id=eq.${uid}` },
        () => {
          cargarReservasPropias()
          cargarContactosClientes()
        },
      )
      .subscribe()

    // Los pedidos abiertos no tienen trabajador_id todavía, así que la
    // política de RLS de `reservas` (cliente/trabajador asignado/admin) le
    // impide a Realtime avisarle a nadie de un INSERT en modo abierto.
    // v_pedidos_abiertos sí filtra bien (corre con permisos del dueño de la
    // vista), así que en su lugar sondeamos esa vista cada 20s.
    const intervaloAbiertos = window.setInterval(() => {
      const actual = trabajadorRef.current
      if (actual) cargarPedidosAbiertos(actual.habilitado_trabajar)
    }, 20000)

    const canalCandidaturas = supabase
      .channel(`candidaturas-trabajador-${uid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'candidaturas', filter: `trabajador_id=eq.${uid}` },
        (payload) => {
          const reservaId = (payload.new as { reserva_id: string }).reserva_id
          const estado = (payload.new as { estado: string }).estado
          setPostulaciones((prev) => {
            const copia = { ...prev }
            delete copia[reservaId]
            return copia
          })
          if (estado === 'elegida') {
            agregar('¡Te eligieron para un servicio! Revisa tus trabajos.')
            cargarReservasPropias()
            cargarContactosClientes()
          } else if (estado === 'liberada') {
            agregar('Esta vez no fuiste elegida para un pedido.')
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canalReservas)
      window.clearInterval(intervaloAbiertos)
      supabase.removeChannel(canalCandidaturas)
    }
  }, [session, agregar, cargarReservasPropias, cargarPedidosAbiertos, cargarContactosClientes])

  // Cola de pedidos entrantes (directos + abiertos) para la pantalla completa
  // tipo "llamada entrante": uno a la vez, los directos primero (la piden a
  // ella específicamente) y luego los abiertos por ventana más próxima a
  // vencer.
  const colaEntrantes = useMemo<PedidoEntranteOverlayData[]>(() => {
    if (!trabajador) return []
    const items: PedidoEntranteOverlayData[] = []
    const enCursoActual = reservasPropias.filter(
      (x) => x.estado === 'aceptada' || x.estado === 'en_camino' || x.estado === 'en_curso',
    )
    for (const r of reservasPropias) {
      if (r.modo !== 'directo' || r.estado !== 'solicitada') continue
      const subtotal = (r.tarifa_hora ?? trabajador.tarifa_hora) * r.horas * (r.personas ?? 1)
      const seCruza = enCursoActual.some(
        (otra) => otra.id !== r.id && seSolapan(r.fecha, r.hora, r.horas, otra.fecha, otra.hora, otra.horas, MARGEN_TRASLADO_MINUTOS),
      )
      items.push({
        id: r.id,
        tipo: 'directo',
        servicio: r.servicio,
        subtipoServicio: r.subtipo_servicio,
        descripcionTrabajo: r.descripcion_trabajo,
        fotoReferenciaRuta: r.foto_referencia_ruta,
        detallesServicio: r.detalles_servicio,
        zona: r.zona,
        fecha: r.fecha,
        hora: r.hora,
        horas: r.horas,
        conMateriales: r.con_materiales,
        ventanaCierraEn: r.ventana_cierra_en,
        pagoNeto: calcularComision(subtotal, r.comision_pct, r.recargo_materiales).netoTrabajadora,
        advertencia: seCruza ? 'Este horario se cruza con otro trabajo que ya tienes.' : null,
      })
    }
    for (const p of pedidosAbiertos) {
      if (descartadosAbiertos.has(p.id)) continue
      items.push({
        id: p.id,
        tipo: 'abierto',
        servicio: p.servicio,
        subtipoServicio: p.subtipo_servicio,
        descripcionTrabajo: p.descripcion_trabajo,
        fotoReferenciaRuta: p.foto_referencia_ruta,
        detallesServicio: p.detalles_servicio,
        zona: p.zona,
        fecha: p.fecha,
        hora: p.hora,
        horas: p.horas,
        conMateriales: p.con_materiales,
        ventanaCierraEn: p.ventana_cierra_en,
        pagoNeto: calcularComision(trabajador.tarifa_hora * p.horas * (p.personas ?? 1), p.comision_pct, p.recargo_materiales)
          .netoTrabajadora,
      })
    }
    items.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'directo' ? -1 : 1
      const av = a.ventanaCierraEn ? new Date(a.ventanaCierraEn).getTime() : Infinity
      const bv = b.ventanaCierraEn ? new Date(b.ventanaCierraEn).getTime() : Infinity
      return av - bv
    })
    return items
  }, [reservasPropias, pedidosAbiertos, descartadosAbiertos, trabajador])

  const pedidoActual = colaEntrantes[0] ?? null

  // Un pedido nuevo al frente de la cola siempre se muestra a pantalla
  // completa, aunque la trabajadora haya minimizado el anterior.
  useEffect(() => {
    if (pedidoActual && pedidoActual.id !== idPedidoActualRef.current) setOverlayMinimizado(false)
    idPedidoActualRef.current = pedidoActual?.id ?? null
  }, [pedidoActual])

  // Mientras la pantalla de "llamada" está a la vista, suena y vibra en bucle hasta que responda o la minimice.
  const llamadaVisible = !!pedidoActual && !overlayMinimizado && !overlayConfirmacion
  useEffect(() => {
    prepararSonido()
  }, [])
  useEffect(() => {
    if (!llamadaVisible) return
    iniciarAlarma()
    return () => detenerAlarma()
  }, [llamadaVisible, pedidoActual?.id])
  // iPhone: si abrió la app desde la notificación sin tocar nada, el audio sigue bloqueado; se lo avisamos.
  const [audioBloqueado, setAudioBloqueado] = useState(false)
  useEffect(() => {
    if (!llamadaVisible) {
      setAudioBloqueado(false)
      return
    }
    const revisar = () => setAudioBloqueado(!audioListo())
    revisar()
    const id = window.setInterval(revisar, 700)
    return () => window.clearInterval(id)
  }, [llamadaVisible])

  async function overlayResponderDirecta(id: string, accion: 'aceptar' | 'rechazar') {
    const exito = await cambiarEstado(id, 'solicitada', { estado: accion === 'aceptar' ? 'aceptada' : 'rechazada' })
    if (!exito) return
    setOverlayConfirmacion(
      accion === 'aceptar'
        ? { tipo: 'aceptado', titulo: 'Pedido aceptado', mensaje: 'Ya puedes coordinar el servicio con la clienta.' }
        : {
            tipo: 'rechazado',
            titulo: 'Pedido rechazado',
            mensaje: 'No pasa nada, seguimos buscando otras trabajadoras.',
          },
    )
    window.setTimeout(() => setOverlayConfirmacion(null), 1300)
  }

  async function overlayResponderAbierto(pedido: PedidoEntranteOverlayData, accion: 'aceptar' | 'rechazar') {
    if (accion === 'rechazar') {
      setDescartadosAbiertos((prev) => new Set(prev).add(pedido.id))
      setOverlayConfirmacion({
        tipo: 'rechazado',
        titulo: 'Pedido descartado',
        mensaje: 'No pasa nada: rechazar un pedido abierto no te penaliza.',
      })
      window.setTimeout(() => setOverlayConfirmacion(null), 1300)
      return
    }
    const original = pedidosAbiertos.find((p) => p.id === pedido.id)
    if (!original) return
    const exito = await postularme(original)
    if (!exito) return
    setOverlayConfirmacion({
      tipo: 'aceptado',
      titulo: 'Postulación enviada',
      mensaje: 'Espera a que la clienta te elija. Te avisamos apenas responda.',
    })
    window.setTimeout(() => setOverlayConfirmacion(null), 1300)
  }

  function onOverlayAceptar() {
    if (!pedidoActual) return
    if (pedidoActual.tipo === 'directo') overlayResponderDirecta(pedidoActual.id, 'aceptar')
    else overlayResponderAbierto(pedidoActual, 'aceptar')
  }

  function onOverlayRechazar() {
    if (!pedidoActual) return
    if (pedidoActual.tipo === 'directo') overlayResponderDirecta(pedidoActual.id, 'rechazar')
    else overlayResponderAbierto(pedidoActual, 'rechazar')
  }

  async function alternarDisponible() {
    if (!trabajador) return
    setActualizando(true)
    setError(null)
    const nuevoValor = !trabajador.disponible_ahora
    const { error: errorUpdate } = await supabase
      .from('trabajadores')
      .update({ disponible_ahora: nuevoValor, ultima_actividad: new Date().toISOString() })
      .eq('id', trabajador.id)

    if (errorUpdate) {
      setError(traducirError(errorUpdate))
    } else {
      const actualizado = { ...trabajador, disponible_ahora: nuevoValor }
      setTrabajador(actualizado)
      cargarPedidosAbiertos(actualizado.habilitado_trabajar)
    }
    setActualizando(false)
  }

  async function verFotoReferencia(ruta: string | null) {
    if (!ruta) return
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(ruta, 300)
    if (error || !data) {
      alert(traducirError(error ?? new Error('No se pudo abrir la foto.')))
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function alternarKitPropio() {
    if (!trabajador) return
    setActualizando(true)
    setError(null)
    const nuevoValor = !trabajador.kit_propio
    const { error: errorUpdate } = await supabase
      .from('trabajadores')
      .update({ kit_propio: nuevoValor })
      .eq('id', trabajador.id)

    if (errorUpdate) setError(traducirError(errorUpdate))
    else setTrabajador({ ...trabajador, kit_propio: nuevoValor })
    setActualizando(false)
  }

  async function postularme(pedido: PedidoAbierto): Promise<boolean> {
    setProcesando(pedido.id)
    const { error: errorRpc } = await supabase.rpc('postularme_a_reserva', { p_reserva_id: pedido.id })
    let exito = false
    if (errorRpc) {
      alert(traducirError(errorRpc))
    } else {
      setPostulaciones((prev) => ({ ...prev, [pedido.id]: pedido }))
      setPedidosAbiertos((prev) => prev.filter((p) => p.id !== pedido.id))
      exito = true
    }
    setProcesando(null)
    return exito
  }

  async function cambiarEstado(id: string, desdeEstado: string, cambios: Record<string, unknown>): Promise<boolean> {
    setProcesando(id)
    // Filtramos por el estado que esperábamos ver: si la clienta canceló (u
    // otra cosa cambió el estado) justo antes de este clic, la fila ya no
    // coincide y no se actualiza nada, en vez de pisar ese cambio.
    const { data, error: errorUpdate } = await supabase
      .from('reservas')
      .update(cambios)
      .eq('id', id)
      .eq('estado', desdeEstado)
      .select('id')
    let exito = false
    if (errorUpdate) alert(traducirError(errorUpdate))
    else if (!data || data.length === 0) agregar('Esta reserva ya había cambiado. Actualizamos tu lista.')
    else exito = true
    cargarReservasPropias()
    cargarGanancias()
    cargarPrestamo()
    setProcesando(null)
    return exito
  }

  // Best-effort: si falla (sin permiso de ubicación, sin señal, la reserva
  // ya avanzó de estado) simplemente no se actualiza el punto; no vale la
  // pena interrumpir a la trabajadora con una alerta por esto.
  async function actualizarUbicacion(id: string, lat: number, lng: number) {
    await supabase
      .from('reservas')
      .update({ ubicacion_lat: lat, ubicacion_lng: lng })
      .eq('id', id)
      .eq('estado', 'en_camino')
  }

  if (cargando) {
    return <div className="p-6 text-center text-neutral-500">Cargando tu panel…</div>
  }

  if (!trabajador) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? 'No encontramos tu perfil de trabajadora.'}
        </p>
      </div>
    )
  }

  const enCurso = reservasPropias.filter(
    (r) => r.estado === 'aceptada' || r.estado === 'en_camino' || r.estado === 'en_curso',
  )
  const completadas = reservasPropias.filter((r) => r.estado === 'completada' && !calificadas.has(r.id))
  const postulacionesLista = Object.values(postulaciones)
  const hayServicios = enCurso.length > 0 || postulacionesLista.length > 0 || completadas.length > 0
  const resumenServicios = hayServicios
    ? [
        enCurso.length > 0 && `${enCurso.length} en curso`,
        postulacionesLista.length > 0 && `${postulacionesLista.length} esperando respuesta`,
        completadas.length > 0 && `${completadas.length} por calificar`,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Revisa tus trabajos y postulaciones'

  async function salir() {
    await cerrarSesion()
    navigate('/login')
  }

  function elegirPestana(p: PestanaProfesional) {
    setPestana(p)
    if (p === 'panel') window.scrollTo({ top: 0 })
    else if (p === 'servicios') irAMisServicios()
    else abrirEdicion()
  }

  function abrirEdicion() {
    setEditando(true)
    setPestana('perfil')
    window.setTimeout(() => document.getElementById('editar-perfil')?.scrollIntoView({ block: 'start' }), 0)
  }

  function irAMisServicios() {
    const destino = refMisServicios.current
    if (!destino) return
    setPestana('servicios')
    destino.scrollIntoView({ block: 'start' })
    destino.focus({ preventScroll: true })
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-4">
      {audioBloqueado && (
        <button
          type="button"
          onClick={activarSonido}
          className="fixed inset-x-4 bottom-24 z-[60] rounded-2xl bg-amber-400 px-4 py-4 text-center text-base font-bold text-neutral-900 shadow-xl"
        >
          🔔 Toca aquí para activar el sonido
        </button>
      )}
      <PedidoEntranteOverlay
        pedido={overlayConfirmacion ? null : pedidoActual}
        confirmacion={overlayConfirmacion}
        procesando={procesando === pedidoActual?.id}
        minimizado={overlayMinimizado}
        onAceptar={onOverlayAceptar}
        onRechazar={onOverlayRechazar}
        onMinimizar={() => setOverlayMinimizado(true)}
        onMaximizar={() => setOverlayMinimizado(false)}
        onVerFoto={verFotoReferencia}
      />

      <h1 className="mb-3 mt-1 text-3xl font-extrabold text-neutral-900">Mi panel</h1>

      <TarjetaPerfil
        nombre={perfil?.nombre ?? ''}
        fotoUrl={perfil?.foto_url ?? null}
        servicios={trabajador.servicios}
        editando={editando}
        onEditar={abrirEdicion}
      />
      <EditarPerfilTrabajador
        trabajador={trabajador}
        onActualizado={cargarTrabajador}
        abierto={editando}
        onCambiarAbierto={setEditando}
      />

      <div className="pointer-events-none fixed inset-x-0 top-24 z-20 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg">
            {t.mensaje}
          </div>
        ))}
      </div>

      {!trabajador.habilitado_trabajar ? (
        <div className="yavi-aviso mt-3" data-tipo="alerta">
          {!trabajador.verificado
            ? 'Tu perfil está en revisión. Un administrador de YAVI verificará tus datos antes de que puedas activar "Disponible ahora".'
            : trabajador.estado_migratorio === 'rechazado'
              ? 'No pudimos validar tu autorización para trabajar en Perú. Escríbenos para revisar tu caso.'
              : 'Tu perfil está verificado, pero tu autorización para trabajar en Perú aún está pendiente de validación. Te avisaremos apenas esté lista.'}
        </div>
      ) : null}

      {trabajador.nacionalidad === 'extranjera' &&
        trabajador.estado_migratorio !== 'validado' &&
        (!trabajador.doc_migratorio_frontal_ruta || !trabajador.doc_migratorio_constancia_ruta) && (
          <CompletarDocumentosMigratorios trabajadorId={trabajador.id} onListo={cargarTrabajador} />
        )}

      <div className="mt-3 flex flex-col gap-3">
        {trabajador.habilitado_trabajar && tieneNotificaciones === false && (
          <div className="yavi-aviso" data-tipo="alerta">
            <p className="font-semibold">Disponible ahora</p>
            <p className="mt-1">
              Activa las notificaciones para recibir pedidos: son la única forma de enterarte al toque cuando llega
              uno, aunque tengas la app cerrada.
            </p>
            <Link
              to="/activar-notificaciones"
              className="mt-3 inline-block rounded-xl bg-amber-900 px-3 py-2 text-sm font-semibold text-white"
            >
              Activar notificaciones
            </Link>
          </div>
        )}

        {trabajador.habilitado_trabajar && tieneNotificaciones !== false && (
          <TarjetaInterruptor
            id="interruptor-disponible"
            icono={
              <BurbujaIcono tono="verde">
                <span className={`h-4 w-4 rounded-full ${trabajador.disponible_ahora ? 'bg-green-600' : 'bg-neutral-400'}`} />
              </BurbujaIcono>
            }
            titulo="Disponible ahora"
            texto={
              trabajador.disponible_ahora
                ? 'Visible para nuevos pedidos'
                : 'No apareces en la búsqueda. Los pedidos programados te siguen llegando.'
            }
            activo={trabajador.disponible_ahora}
            onCambiar={alternarDisponible}
            deshabilitado={actualizando || tieneNotificaciones === null}
          />
        )}

        {ofreceKitDeLimpieza(trabajador.servicios) && (
          <TarjetaInterruptor
            id="interruptor-kit"
            icono={
              <BurbujaIcono>
                <Icono nombre="kit" className="h-5 w-5" />
              </BurbujaIcono>
            }
            titulo="Mi kit de limpieza"
            texto={`Ofrécelo cuando el pedido lo solicite (+${formatoSoles(RECARGO_KIT).replace('.00', '')})`}
            info={`Si el cliente no tiene materiales, puedes ofrecer llevar tu kit por un recargo de ${formatoSoles(RECARGO_KIT)}, de los cuales S/ 13 son para ti.`}
            activo={trabajador.kit_propio}
            onCambiar={alternarKitPropio}
            deshabilitado={actualizando}
          />
        )}
      </div>

      {error && (
        <p role="alert" className="yavi-aviso mt-3" data-tipo="error">
          {error}
        </p>
      )}

      <dl className="mt-3 grid grid-cols-3 gap-2.5">
        <Estadistica icono="monedas" titulo="Tarifa" valor={`S/ ${trabajador.tarifa_hora.toFixed(2)}`} />
        <Estadistica icono="documento" titulo="Trabajos" valor={trabajador.trabajos_completados} />
        <Estadistica
          icono="estrella"
          titulo="Calificación"
          valor={
            trabajador.rating_n > 0
              ? `${trabajador.rating_avg.toFixed(1)} ★ · ${trabajador.rating_n} ${trabajador.rating_n === 1 ? 'reseña' : 'reseñas'}`
              : 'Sin reseñas'
          }
        />
      </dl>

      <section aria-labelledby="titulo-ganancias" className="mt-5">
        <h2 id="titulo-ganancias" className="mb-3 text-2xl font-extrabold text-neutral-900">
          Mis ganancias
        </h2>
        <dl className="grid grid-cols-2 gap-3">
          <Ganancia icono="tendencia" titulo="Esta semana" monto={`S/ ${ganancias.semana.toFixed(2)}`} />
          <Ganancia icono="calendario" titulo="Este mes" monto={`S/ ${ganancias.mes.toFixed(2)}`} />
        </dl>
        <p className="mt-2 text-sm leading-snug text-neutral-700">
          Después de la comisión de YAVI. Incluye S/ 13 del kit cuando corresponde.
        </p>

        {prestamo && (
          <div className="yavi-aviso mt-3" data-tipo="alerta">
            <p className="font-medium">
              {prestamo.estado === 'emitido' || prestamo.estado === 'retirado'
                ? `Kit a crédito: saldo pendiente S/ ${prestamo.saldo.toFixed(2)} de S/ ${prestamo.monto.toFixed(2)}`
                : prestamo.estado === 'pagado'
                  ? `Kit a crédito: pagado ✓ (S/ ${prestamo.monto.toFixed(2)})`
                  : 'Kit a crédito: marcado como perdido'}
            </p>
            {movimientosPrestamo.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-xs text-neutral-700">
                {movimientosPrestamo.map((m) => (
                  <li key={m.id}>
                    {new Date(m.creado_en).toLocaleDateString('es-PE')} — se descontó S/ {m.monto.toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={irAMisServicios}
        aria-controls="mis-servicios"
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 px-4 py-3.5 text-base font-bold"
      >
        Ver mis servicios
        <span aria-hidden="true" className="text-xl leading-none">
          ›
        </span>
        <span className="sr-only">({resumenServicios})</span>
      </button>

      <button type="button" onClick={salir} className="yavi-boton-secundario mt-3 w-full py-3.5! text-base!">
        Cerrar sesión
      </button>

      <section
        id="mis-servicios"
        ref={refMisServicios}
        tabIndex={-1}
        aria-labelledby="titulo-mis-servicios"
        className="mt-8 scroll-mt-24 outline-none"
      >
        <h2 id="titulo-mis-servicios" className="mb-1 text-lg font-bold text-neutral-900">
          Mis servicios
        </h2>
        {!hayServicios && (
          <p className="yavi-aviso" data-tipo="info">
            Aún no tienes servicios en curso. Cuando una clienta te elija, aparecerá aquí.
          </p>
        )}
      {enCurso.length > 0 && (
        <Seccion titulo="Trabajo en curso" nivel={3} className="mt-4">
          {enCurso.map((r) => (
            <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-3">
              <p className="font-semibold">{r.servicio}</p>
              <p className="text-sm text-neutral-500">
                {r.direccion} · {r.zona}
              </p>
              <p className="text-sm text-neutral-500">
                {r.fecha} · {r.hora.slice(0, 5)} · {r.horas}h
              </p>
              {r.con_materiales && <p className="text-xs text-amber-700">Incluye llevar tu kit de limpieza</p>}
              <DetalleTrabajo reserva={r} onVerFoto={verFotoReferencia} />
              {contactosClientes[r.cliente_id] && (
                <a
                  href={whatsappUrl(
                    contactosClientes[r.cliente_id].telefono,
                    `Hola ${contactosClientes[r.cliente_id].nombre}, te escribo por tu reserva de YAVI (${r.servicio}).`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  WhatsApp con {contactosClientes[r.cliente_id].nombre.split(' ')[0]}
                </a>
              )}
              <ControlServicio
                reserva={r}
                procesando={procesando === r.id}
                onCambiarEstado={(cambios, desdeEstado) => cambiarEstado(r.id, desdeEstado, cambios)}
                onActualizarUbicacion={(lat, lng) => actualizarUbicacion(r.id, lat, lng)}
              />
            </div>
          ))}
        </Seccion>
      )}

      {postulacionesLista.length > 0 && (
        <Seccion titulo="Tus postulaciones (esperando respuesta)" nivel={3} className="mt-4">
          {postulacionesLista.map((p) => (
            <div key={p.id} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-600">
              <p>
                {p.servicio} · {p.zona} · {p.horas}h
              </p>
              <DetalleTrabajo reserva={p} onVerFoto={verFotoReferencia} />
            </div>
          ))}
        </Seccion>
      )}

      {completadas.length > 0 && (
        <Seccion titulo="Califica a tus clientas" nivel={3} className="mt-4">
          {completadas.map((r) => (
            <div key={r.id} className="flex flex-col gap-2">
              <p className="text-sm text-neutral-600">{r.servicio}</p>
              {session && (
                <FormularioCalificacion
                  reservaId={r.id}
                  paraId={r.cliente_id}
                  deId={session.user.id}
                  onCalificado={cargarCalificadas}
                />
              )}
            </div>
          ))}
        </Seccion>
      )}
      </section>

      <BarraProfesional activa={pestana} onElegir={elegirPestana} />
    </div>
  )
}

function Seccion({
  titulo,
  children,
  className = 'mt-6',
  nivel = 2,
}: {
  titulo: string
  children: ReactNode
  className?: string
  nivel?: 2 | 3
}) {
  const Titulo = nivel === 2 ? 'h2' : 'h3'
  return (
    <div className={className}>
      <Titulo className={nivel === 2 ? 'mb-3 text-lg font-bold text-neutral-900' : 'mb-2 text-base font-semibold text-neutral-900'}>
        {titulo}
      </Titulo>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

// Si Supabase exigió confirmar el correo antes de iniciar sesión, los
// archivos del registro (que no se pueden guardar en localStorage) se
// pierden. Sin esto, una trabajadora extranjera que ya dijo que sí cuenta
// con autorización para trabajar nunca podría adjuntar los documentos que
// el admin necesita para validarla.
function CompletarDocumentosMigratorios({
  trabajadorId,
  onListo,
}: {
  trabajadorId: string
  onListo: () => void
}) {
  const [docNumero, setDocNumero] = useState('')
  const [docVencimiento, setDocVencimiento] = useState('')
  const [frontal, setFrontal] = useState<File | null>(null)
  const [posterior, setPosterior] = useState<File | null>(null)
  const [constancia, setConstancia] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    if (!docNumero.trim() || !docVencimiento || !frontal || !constancia) {
      setError('Completa el número, la fecha de vencimiento, la foto frontal y la constancia.')
      return
    }
    setEnviando(true)
    setError(null)

    async function subir(file: File, prefijo: string) {
      const extension = file.name.split('.').pop() ?? 'jpg'
      const ruta = `${trabajadorId}/${prefijo}-${Date.now()}.${extension}`
      const { error: errorSubida } = await supabase.storage.from('documentos').upload(ruta, file, { upsert: true })
      return errorSubida ? null : ruta
    }

    const [frontalRuta, posteriorRuta, constanciaRuta] = await Promise.all([
      subir(frontal, 'doc-frontal'),
      posterior ? subir(posterior, 'doc-posterior') : Promise.resolve(null),
      subir(constancia, 'doc-constancia'),
    ])

    if (!frontalRuta || !constanciaRuta) {
      setError('No pudimos subir alguno de los archivos. Intenta de nuevo.')
      setEnviando(false)
      return
    }

    const { error: errorUpdate } = await supabase
      .from('trabajadores')
      .update({
        cuenta_autorizacion_migratoria: true,
        doc_migratorio_numero: docNumero,
        doc_migratorio_vencimiento: docVencimiento,
        doc_migratorio_frontal_ruta: frontalRuta,
        doc_migratorio_posterior_ruta: posteriorRuta,
        doc_migratorio_constancia_ruta: constanciaRuta,
      })
      .eq('id', trabajadorId)

    if (errorUpdate) {
      setError(traducirError(errorUpdate))
      setEnviando(false)
      return
    }

    setEnviando(false)
    onListo()
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="mb-3 text-sm font-medium text-amber-900">
        Falta un paso: adjunta el documento que acredita tu autorización para trabajar en Perú.
      </p>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Número del documento</span>
          <input value={docNumero} onChange={(e) => setDocNumero(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Fecha de vencimiento</span>
          <input
            type="date"
            value={docVencimiento}
            onChange={(e) => setDocVencimiento(e.target.value)}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Foto del documento (frontal)</span>
          <input type="file" accept="image/*" onChange={(e) => setFrontal(e.target.files?.[0] ?? null)} className="text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Foto del documento (posterior, si corresponde)</span>
          <input type="file" accept="image/*" onChange={(e) => setPosterior(e.target.files?.[0] ?? null)} className="text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">Documento o constancia de autorización</span>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setConstancia(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="button"
          disabled={enviando}
          onClick={enviar}
          className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {enviando ? 'Enviando…' : 'Enviar documentos'}
        </button>
      </div>
    </div>
  )
}

// Flujo tipo taxi: aceptada → en_camino (GPS real mientras dure este
// estado) → en_curso (temporizador contra fin_estimado) → completada.
function ControlServicio({
  reserva,
  procesando,
  onCambiarEstado,
  onActualizarUbicacion,
}: {
  reserva: Reserva
  procesando: boolean
  onCambiarEstado: (cambios: Record<string, unknown>, desdeEstado: string) => void
  onActualizarUbicacion: (lat: number, lng: number) => void
}) {
  useEffect(() => {
    if (reserva.estado !== 'en_camino' || !('geolocation' in navigator)) return
    const watchId = navigator.geolocation.watchPosition(
      (posicion) => onActualizarUbicacion(posicion.coords.latitude, posicion.coords.longitude),
      () => {
        // Sin permiso o sin señal: seguimos igual, la trabajadora puede
        // continuar el flujo aunque no se comparta la ubicación.
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reserva.estado, reserva.id])

  // Refresca la cuenta regresiva contra fin_estimado sin esperar a otro evento.
  const [, forzarRender] = useState(0)
  useEffect(() => {
    if (reserva.estado !== 'en_curso') return
    const id = window.setInterval(() => forzarRender((n) => n + 1), 30000)
    return () => window.clearInterval(id)
  }, [reserva.estado])

  if (reserva.estado === 'aceptada') {
    return (
      <button
        disabled={procesando}
        onClick={() => onCambiarEstado({ estado: 'en_camino' }, 'aceptada')}
        className="mt-2 w-full rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        Voy en camino
      </button>
    )
  }

  if (reserva.estado === 'en_camino') {
    return (
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-xs text-neutral-500">
          📍 Mientras vayas en camino compartimos tu ubicación para que la clienta sepa que ya vas llegando.
        </p>
        {!reserva.hora_llegada && (
          <button
            disabled={procesando}
            onClick={() => onCambiarEstado({ hora_llegada: new Date().toISOString() }, 'en_camino')}
            className="w-full rounded-lg border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700 disabled:opacity-60"
          >
            Ya llegué
          </button>
        )}
        <button
          disabled={procesando}
          onClick={() => onCambiarEstado({ estado: 'en_curso' }, 'en_camino')}
          className="w-full rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Iniciar servicio
        </button>
      </div>
    )
  }

  // en_curso
  const finEstimadoMs = reserva.fin_estimado ? new Date(reserva.fin_estimado).getTime() : null
  const faltanMin = finEstimadoMs !== null ? Math.round((finEstimadoMs - Date.now()) / 60000) : null
  const excedido = faltanMin !== null && faltanMin < 0

  return (
    <div className="mt-2 flex flex-col gap-2">
      {faltanMin !== null && (
        <p className={`text-xs font-medium ${excedido ? 'text-red-700' : 'text-neutral-500'}`}>
          {excedido
            ? `⏱ Ya superaste el tiempo estimado por ${Math.abs(faltanMin)} min. Si aún sigues trabajando, no hay problema: finaliza cuando termines.`
            : faltanMin <= 15
              ? `⏱ Tu servicio está por finalizar (quedan ~${faltanMin} min estimados).`
              : `Fin estimado: ${new Date(reserva.fin_estimado as string).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`}
        </p>
      )}
      <button
        disabled={procesando}
        onClick={() => onCambiarEstado({ estado: 'completada' }, 'en_curso')}
        className="w-full rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        Finalizar servicio
      </button>
    </div>
  )
}

interface ConDetalleTrabajo {
  subtipo_servicio: string | null
  descripcion_trabajo: string | null
  foto_referencia_ruta: string | null
  detalles_servicio: DetallesServicio | null
}

function DetalleTrabajo({
  reserva,
  onVerFoto,
}: {
  reserva: ConDetalleTrabajo
  onVerFoto: (ruta: string | null) => void
}) {
  if (
    !reserva.subtipo_servicio &&
    !reserva.descripcion_trabajo &&
    !reserva.foto_referencia_ruta &&
    !reserva.detalles_servicio
  ) {
    return null
  }
  return (
    <div className="mt-1 text-sm text-neutral-600">
      {reserva.subtipo_servicio && <p>{reserva.subtipo_servicio}</p>}
      {reserva.descripcion_trabajo && <p>{reserva.descripcion_trabajo}</p>}
      <DetallesServicioVista
        detalles={reserva.detalles_servicio}
        fotoLegado={reserva.foto_referencia_ruta}
        onVerFoto={onVerFoto}
      />
    </div>
  )
}
