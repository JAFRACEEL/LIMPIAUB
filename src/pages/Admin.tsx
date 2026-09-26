import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import {
  etiquetaTipoDocumento,
  etiquetaAntecedentes,
  etiquetaGenero,
  NACIONALIDADES,
} from '../lib/constantes'
import { calcularComision } from '../lib/calculos'
import { KitCredito } from '../components/KitCredito'
import type { Trabajador } from '../types'

interface PerfilResumen {
  nombre: string
  telefono: string
  direccion: string | null
  foto_url: string | null
}

type TrabajadorAdmin = Trabajador & { perfiles: PerfilResumen }

interface ClienteAdmin {
  id: string
  nombre: string
  telefono: string
  zona: string
  direccion: string | null
  creado_en: string
}

interface ReservaAdmin {
  id: string
  servicio: string
  subtipo_servicio: string | null
  descripcion_trabajo: string | null
  fecha: string
  hora: string
  estado: string
  total: number | null
  zona: string
  perfiles: { nombre: string } | null
  trabajadores: { perfiles: { nombre: string } } | null
}

interface ReservaTablero {
  id: string
  servicio: string
  zona: string
  direccion: string
  fecha: string
  hora: string
  horas: number
  estado: string
  hora_llegada: string | null
  inicio_real: string | null
  fin_estimado: string | null
  fin_real: string | null
  perfiles: { nombre: string } | null
  trabajadores: { perfiles: { nombre: string } } | null
}

// Además de "tiempo excedido" (ya pasó fin_estimado), un exceso mayor a
// este margen genera la alerta administrativa que pide el punto 9: no
// interrumpe a la trabajadora, solo lo resalta acá para que el admin revise.
const MARGEN_ALERTA_ADMIN_MINUTOS = 45

interface Metricas {
  clientes: number
  verificados: number
  disponibles: number
  porEstado: Record<string, number>
  tasaAceptacion: number | null
  ingresoComision: number
}

const ESTADOS_RESERVA = ['solicitada', 'aceptada', 'en_camino', 'en_curso', 'completada', 'cancelada', 'rechazada']

export function Admin() {
  const [pendientes, setPendientes] = useState<TrabajadorAdmin[]>([])
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [procesando, setProcesando] = useState<string | null>(null)

  const [clientes, setClientes] = useState<ClienteAdmin[] | null>(null)
  const [trabajadorasTodas, setTrabajadorasTodas] = useState<TrabajadorAdmin[] | null>(null)
  const [reservasRecientes, setReservasRecientes] = useState<ReservaAdmin[] | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState<string | null>(null)
  const [tablero, setTablero] = useState<ReservaTablero[]>([])

  async function cargarClientes() {
    if (clientes) return
    setCargandoDetalle('clientes')
    const { data, error } = await supabase
      .from('perfiles')
      .select('id, nombre, telefono, zona, direccion, creado_en')
      .eq('rol', 'cliente')
      .order('creado_en', { ascending: false })
    if (error) alert(traducirError(error))
    else setClientes((data as ClienteAdmin[]) ?? [])
    setCargandoDetalle(null)
  }

  async function cargarTrabajadorasTodas(forzar = false) {
    if (trabajadorasTodas && !forzar) return
    setCargandoDetalle('trabajadoras')
    const { data, error } = await supabase
      .from('trabajadores')
      .select('*, perfiles!inner(nombre, telefono, direccion, foto_url)')
      .order('rating_avg', { ascending: false })
    if (error) alert(traducirError(error))
    else setTrabajadorasTodas((data as TrabajadorAdmin[]) ?? [])
    setCargandoDetalle(null)
  }

  async function cargarReservasRecientes() {
    if (reservasRecientes) return
    setCargandoDetalle('reservas')
    const { data, error } = await supabase
      .from('reservas')
      .select(
        'id, servicio, subtipo_servicio, descripcion_trabajo, fecha, hora, estado, total, zona, perfiles(nombre), trabajadores(perfiles(nombre))',
      )
      .order('creado_en', { ascending: false })
      .limit(50)
    if (error) alert(traducirError(error))
    else setReservasRecientes((data as unknown as ReservaAdmin[]) ?? [])
    setCargandoDetalle(null)
  }

  async function cargarTablero() {
    const { data, error } = await supabase
      .from('reservas')
      .select(
        'id, servicio, zona, direccion, fecha, hora, horas, estado, hora_llegada, inicio_real, fin_estimado, fin_real, perfiles(nombre), trabajadores(perfiles(nombre))',
      )
      .in('estado', ['aceptada', 'en_camino', 'en_curso'])
      .order('fecha', { ascending: true })
      .order('hora', { ascending: true })
    if (!error) setTablero((data as unknown as ReservaTablero[]) ?? [])
  }

  async function cargar() {
    setCargando(true)
    setError(null)

    const { data: trabajadores, error: errorTrab } = await supabase
      .from('trabajadores')
      .select('*, perfiles!inner(nombre, telefono, direccion, foto_url)')
      .or('and(verificado.eq.false,verificacion_rechazada.eq.false),estado_migratorio.eq.pendiente_validacion')

    if (errorTrab) {
      setError(traducirError(errorTrab))
      setCargando(false)
      return
    }
    setPendientes((trabajadores as TrabajadorAdmin[]) ?? [])

    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [{ count: clientes }, { count: verificados }, { count: disponibles }, { data: reservas }] =
      await Promise.all([
        supabase.from('perfiles').select('id', { count: 'exact', head: true }).eq('rol', 'cliente'),
        supabase.from('trabajadores').select('id', { count: 'exact', head: true }).eq('verificado', true),
        supabase.from('trabajadores').select('id', { count: 'exact', head: true }).eq('disponible_ahora', true),
        supabase.from('reservas').select('estado, total, comision_pct, recargo_materiales').gte('creado_en', desde),
      ])

    const porEstado: Record<string, number> = {}
    for (const e of ESTADOS_RESERVA) porEstado[e] = 0
    let decididas = 0
    let rechazadas = 0
    let ingresoComision = 0
    for (const r of reservas ?? []) {
      porEstado[r.estado] = (porEstado[r.estado] ?? 0) + 1
      // Solo cuenta lo que sí tuvo una respuesta de alguna trabajadora
      // (cancelada no es un rechazo ni una aceptación: la clienta se echó
      // para atrás antes de eso).
      if (['aceptada', 'en_camino', 'en_curso', 'completada', 'rechazada'].includes(r.estado)) {
        decididas += 1
        if (r.estado === 'rechazada') rechazadas += 1
      }
      if (r.estado === 'completada' && r.total != null) {
        const subtotalServicio = r.total - r.recargo_materiales
        ingresoComision += calcularComision(subtotalServicio, r.comision_pct, r.recargo_materiales).comisionLimpi
      }
    }

    setMetricas({
      clientes: clientes ?? 0,
      verificados: verificados ?? 0,
      disponibles: disponibles ?? 0,
      porEstado,
      tasaAceptacion: decididas > 0 ? ((decididas - rechazadas) / decididas) * 100 : null,
      ingresoComision,
    })

    setCargando(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  useEffect(() => {
    cargarTablero()
    const id = window.setInterval(cargarTablero, 30000)
    return () => window.clearInterval(id)
  }, [])

  async function verDocumento(ruta: string | null) {
    if (!ruta) return
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(ruta, 300)
    if (error || !data) {
      alert(traducirError(error ?? new Error('No se pudo abrir el documento.')))
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function verificar(id: string) {
    setProcesando(id)
    const { error } = await supabase
      .from('trabajadores')
      .update({ verificado: true, verificacion_rechazada: false, motivo_rechazo: null })
      .eq('id', id)
    if (error) alert(traducirError(error))
    setProcesando(null)
    cargar()
    if (trabajadorasTodas) cargarTrabajadorasTodas(true)
  }

  async function rechazarVerificacion(id: string) {
    const motivo = window.prompt('Motivo del rechazo (se guarda para referencia interna):') ?? ''
    setProcesando(id)
    const { error } = await supabase
      .from('trabajadores')
      .update({ verificado: false, verificacion_rechazada: true, motivo_rechazo: motivo || null })
      .eq('id', id)
    if (error) alert(traducirError(error))
    setProcesando(null)
    cargar()
    if (trabajadorasTodas) cargarTrabajadorasTodas(true)
  }

  async function validarMigratorio(id: string) {
    setProcesando(id)
    const { error } = await supabase.from('trabajadores').update({ estado_migratorio: 'validado' }).eq('id', id)
    if (error) alert(traducirError(error))
    setProcesando(null)
    cargar()
    if (trabajadorasTodas) cargarTrabajadorasTodas(true)
  }

  async function rechazarMigratorio(id: string) {
    setProcesando(id)
    const { error } = await supabase.from('trabajadores').update({ estado_migratorio: 'rechazado' }).eq('id', id)
    if (error) alert(traducirError(error))
    setProcesando(null)
    cargar()
    if (trabajadorasTodas) cargarTrabajadorasTodas(true)
  }

  if (cargando) return <div className="p-6 text-center text-neutral-500">Cargando panel de admin…</div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold">Panel de admin</h1>
      <p className="mb-6 text-neutral-500">Verificación de trabajadoras y métricas de la plataforma.</p>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {metricas && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metrica etiqueta="Clientes registrados" valor={metricas.clientes} />
          <Metrica etiqueta="Verificadas" valor={metricas.verificados} />
          <Metrica etiqueta="Disponibles ahora" valor={metricas.disponibles} />
          <Metrica
            etiqueta="Tasa de aceptación (7 días)"
            valor={metricas.tasaAceptacion === null ? '—' : `${metricas.tasaAceptacion.toFixed(0)}%`}
          />
          <Metrica etiqueta="Ingreso por comisión (7 días)" valor={`S/ ${metricas.ingresoComision.toFixed(2)}`} />
          {ESTADOS_RESERVA.map((e) => (
            <Metrica key={e} etiqueta={`Reservas ${e} (7 días)`} valor={metricas.porEstado[e] ?? 0} />
          ))}
        </div>
      )}

      <TableroEnVivo tablero={tablero} />

      <h2 className="mb-3 text-lg font-semibold">Pendientes de revisión</h2>

      {pendientes.length === 0 ? (
        <p className="rounded-xl bg-neutral-100 px-4 py-6 text-center text-sm text-neutral-500">
          No hay trabajadoras pendientes de revisión.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {pendientes.map((t) => {
            const nacionalidadLabel = NACIONALIDADES.find((n) => n.value === t.nacionalidad)?.label ?? t.nacionalidad
            const necesitaVerificacion = !t.verificado && !t.verificacion_rechazada
            const necesitaMigratorio = t.estado_migratorio === 'pendiente_validacion'

            return (
              <li key={t.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex gap-3">
                  <img
                    src={t.perfiles.foto_url ?? 'https://placehold.co/64x64?text=%20'}
                    alt={t.perfiles.nombre}
                    className="h-16 w-16 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{t.perfiles.nombre}</p>
                    <p className="text-sm text-neutral-500">
                      {etiquetaGenero(t.genero)} · {nacionalidadLabel}
                    </p>
                    <p className="text-sm text-neutral-500">{t.perfiles.telefono}</p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <Dato etiqueta="Documento" valor={`${etiquetaTipoDocumento(t.tipo_documento)}: ${t.numero_documento}`} />
                  <Dato etiqueta="Dirección" valor={t.perfiles.direccion ?? '—'} />
                  <Dato etiqueta="Zonas" valor={t.zonas.join(', ')} />
                  <Dato etiqueta="Servicios" valor={t.servicios.join(', ')} />
                  <Dato etiqueta="Tarifa" valor={`S/ ${t.tarifa_hora.toFixed(2)}/h`} />
                  <Dato etiqueta="Antecedentes" valor={etiquetaAntecedentes(t.antecedentes)} />
                  <Dato etiqueta="Referencia 1" valor={`${t.referencia1_nombre ?? '—'} · ${t.referencia1_celular ?? '—'}`} />
                  <Dato etiqueta="Referencia 2" valor={`${t.referencia2_nombre ?? '—'} · ${t.referencia2_celular ?? '—'}`} />
                </dl>

                {t.experiencia && <p className="mt-2 text-sm text-neutral-600">{t.experiencia}</p>}

                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  {t.cv_ruta && <BotonDoc etiqueta="Ver CV" onClick={() => verDocumento(t.cv_ruta)} />}
                  {t.antecedentes_doc_ruta && (
                    <BotonDoc etiqueta="Ver doc. antecedentes" onClick={() => verDocumento(t.antecedentes_doc_ruta)} />
                  )}
                </div>

                {necesitaVerificacion && (
                  <div className="mt-4 flex gap-2 border-t border-neutral-100 pt-3">
                    <button
                      disabled={procesando === t.id}
                      onClick={() => verificar(t.id)}
                      className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      Verificar
                    </button>
                    <button
                      disabled={procesando === t.id}
                      onClick={() => rechazarVerificacion(t.id)}
                      className="flex-1 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
                    >
                      Rechazar
                    </button>
                  </div>
                )}

                {necesitaMigratorio && (
                  <div className="mt-4 border-t border-neutral-100 pt-3">
                    <p className="mb-2 text-sm font-medium text-amber-800">
                      Autorización para trabajar en Perú: pendiente de validación
                      {t.cuenta_autorizacion_migratoria === false && ' (la persona indicó que aún no cuenta con ella)'}
                    </p>
                    {t.doc_migratorio_numero && (
                      <p className="mb-2 text-sm text-neutral-600">
                        Doc. {t.doc_migratorio_numero} · vence{' '}
                        {t.doc_migratorio_vencimiento ?? '—'}
                      </p>
                    )}
                    <div className="mb-3 flex flex-wrap gap-2 text-sm">
                      {t.doc_migratorio_frontal_ruta && (
                        <BotonDoc etiqueta="Ver frontal" onClick={() => verDocumento(t.doc_migratorio_frontal_ruta)} />
                      )}
                      {t.doc_migratorio_posterior_ruta && (
                        <BotonDoc etiqueta="Ver posterior" onClick={() => verDocumento(t.doc_migratorio_posterior_ruta)} />
                      )}
                      {t.doc_migratorio_constancia_ruta && (
                        <BotonDoc etiqueta="Ver constancia" onClick={() => verDocumento(t.doc_migratorio_constancia_ruta)} />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={procesando === t.id}
                        onClick={() => validarMigratorio(t.id)}
                        className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Validar autorización
                      </button>
                      <button
                        disabled={procesando === t.id}
                        onClick={() => rechazarMigratorio(t.id)}
                        className="flex-1 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Ver todo el detalle</h2>
      <p className="mb-4 text-sm text-neutral-500">
        Los números de arriba son un resumen; aquí puedes revisar quién hay detrás de cada uno.
      </p>

      <SeccionDetalle
        titulo="Todos los clientes"
        cantidad={metricas?.clientes}
        cargando={cargandoDetalle === 'clientes'}
        onAbrir={cargarClientes}
      >
        {clientes && clientes.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay clientes registrados.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {clientes?.map((c) => (
              <li key={c.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                <p className="font-medium">{c.nombre}</p>
                <p className="text-neutral-500">
                  {c.telefono} · {c.zona}
                </p>
                {c.direccion && <p className="text-neutral-500">{c.direccion}</p>}
                <p className="text-xs text-neutral-400">
                  Registrado: {new Date(c.creado_en).toLocaleDateString('es-PE')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SeccionDetalle>

      <SeccionDetalle
        titulo="Todas las trabajadoras"
        cargando={cargandoDetalle === 'trabajadoras'}
        onAbrir={cargarTrabajadorasTodas}
      >
        {trabajadorasTodas && trabajadorasTodas.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay trabajadoras registradas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {trabajadorasTodas?.map((t) => (
              <li key={t.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{t.perfiles.nombre}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.habilitado_trabajar
                        ? 'bg-green-100 text-green-700'
                        : t.verificacion_rechazada || t.estado_migratorio === 'rechazado'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {t.habilitado_trabajar
                      ? 'Habilitada'
                      : t.verificacion_rechazada
                        ? 'Rechazada'
                        : t.estado_migratorio === 'rechazado'
                          ? 'Migratorio rechazado'
                          : 'Pendiente'}
                  </span>
                </div>
                <p className="text-neutral-500">
                  {t.perfiles.telefono} · {t.zonas.join(', ')}
                </p>
                <p className="text-neutral-500">
                  S/ {t.tarifa_hora.toFixed(2)}/h · {t.trabajos_completados} trabajos ·{' '}
                  {t.rating_n > 0 ? `${t.rating_avg.toFixed(1)} ★` : 'sin calificar'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SeccionDetalle>

      <SeccionDetalle
        titulo="Reservas recientes"
        cargando={cargandoDetalle === 'reservas'}
        onAbrir={cargarReservasRecientes}
      >
        {reservasRecientes && reservasRecientes.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay reservas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reservasRecientes?.map((r) => (
              <li key={r.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{r.servicio}</p>
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                    {r.estado}
                  </span>
                </div>
                <p className="text-neutral-500">
                  {r.fecha} · {r.hora.slice(0, 5)} · {r.zona}
                </p>
                {r.subtipo_servicio && <p className="text-neutral-500">{r.subtipo_servicio}</p>}
                {r.descripcion_trabajo && <p className="text-neutral-500">{r.descripcion_trabajo}</p>}
                <p className="text-neutral-500">
                  Cliente: {r.perfiles?.nombre ?? '—'} · Trabajadora: {r.trabajadores?.perfiles.nombre ?? '—'}
                </p>
                {r.total != null && <p className="font-medium text-teal-700">Total: S/ {r.total.toFixed(2)}</p>}
              </li>
            ))}
          </ul>
        )}
      </SeccionDetalle>

      <KitCredito />
    </div>
  )
}

function TableroEnVivo({ tablero }: { tablero: ReservaTablero[] }) {
  const enCamino = tablero.filter((r) => r.estado === 'en_camino')
  const enServicio = tablero.filter((r) => r.estado === 'en_curso')
  const proximos = tablero.filter((r) => r.estado === 'aceptada')

  const ahora = Date.now()
  const excedidos = enServicio.filter((r) => r.fin_estimado && new Date(r.fin_estimado).getTime() < ahora)
  const alertaAdmin = excedidos.filter(
    (r) => ahora - new Date(r.fin_estimado as string).getTime() > MARGEN_ALERTA_ADMIN_MINUTOS * 60_000,
  )

  return (
    <div className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">Tablero en vivo</h2>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica etiqueta="En camino" valor={enCamino.length} />
        <Metrica etiqueta="En servicio" valor={enServicio.length} />
        <Metrica etiqueta="Tiempo excedido" valor={excedidos.length} />
        <Metrica etiqueta="Próximos" valor={proximos.length} />
      </div>

      {alertaAdmin.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">
            {alertaAdmin.length === 1
              ? 'Un servicio superó por más de 45 min su tiempo estimado. Revisa si hay algún inconveniente.'
              : `${alertaAdmin.length} servicios superaron por más de 45 min su tiempo estimado. Revisa si hay algún inconveniente.`}
          </p>
        </div>
      )}

      {tablero.length === 0 ? (
        <p className="rounded-xl bg-neutral-100 px-4 py-6 text-center text-sm text-neutral-500">
          No hay servicios en camino, en curso o próximos ahora mismo.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tablero.map((r) => {
            const excedido = r.estado === 'en_curso' && r.fin_estimado && new Date(r.fin_estimado).getTime() < ahora
            return (
              <li key={r.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{r.servicio}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      excedido ? 'bg-red-100 text-red-700' : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {excedido ? 'En servicio · tiempo excedido' : ESTADO_TABLERO_LABELS[r.estado] ?? r.estado}
                  </span>
                </div>
                <p className="text-neutral-500">
                  Cliente: {r.perfiles?.nombre ?? '—'} · Trabajadora: {r.trabajadores?.perfiles.nombre ?? '—'}
                </p>
                <p className="text-neutral-500">
                  {r.direccion} · {r.zona}
                </p>
                <p className="text-neutral-500">
                  Programada: {r.fecha} {r.hora.slice(0, 5)} · {r.horas}h
                </p>
                {r.hora_llegada && (
                  <p className="text-neutral-500">
                    Llegó: {new Date(r.hora_llegada).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                {r.inicio_real && (
                  <p className="text-neutral-500">
                    Inicio real: {new Date(r.inicio_real).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                {r.fin_estimado && (
                  <p className="text-neutral-500">
                    Fin estimado: {new Date(r.fin_estimado).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                {r.fin_real && (
                  <p className="text-neutral-500">
                    Fin real: {new Date(r.fin_real).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const ESTADO_TABLERO_LABELS: Record<string, string> = {
  aceptada: 'Próximo',
  en_camino: 'En camino',
  en_curso: 'En servicio',
}

function SeccionDetalle({
  titulo,
  cantidad,
  cargando,
  onAbrir,
  children,
}: {
  titulo: string
  cantidad?: number
  cargando: boolean
  onAbrir: () => void
  children: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4">
      <button
        type="button"
        onClick={() => {
          const siguiente = !abierto
          setAbierto(siguiente)
          if (siguiente) onAbrir()
        }}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-semibold">
          {titulo}
          {cantidad != null && <span className="ml-1 font-normal text-neutral-500">({cantidad})</span>}
        </span>
        <span className="text-sm text-teal-700">{abierto ? 'Ocultar ▲' : 'Ver detalle ▼'}</span>
      </button>

      {abierto && (
        <div className="mt-3 border-t border-neutral-100 pt-3">
          {cargando ? <p className="text-sm text-neutral-500">Cargando…</p> : children}
        </div>
      )}
    </div>
  )
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div className="rounded-xl bg-neutral-100 p-3 text-center">
      <dt className="text-xs text-neutral-500">{etiqueta}</dt>
      <dd className="font-semibold">{valor}</dd>
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{etiqueta}</dt>
      <dd className="truncate text-neutral-800">{valor}</dd>
    </div>
  )
}

function BotonDoc({ etiqueta, onClick }: { etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700"
    >
      {etiqueta}
    </button>
  )
}
