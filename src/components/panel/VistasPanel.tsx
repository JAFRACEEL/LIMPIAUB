import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, BurbujaIcono, Icono, Interruptor, TarjetaInterruptor } from '../PanelProfesional'
import { EditarPerfilTrabajador } from '../EditarPerfilTrabajador'
import { MisPrecios } from '../MisPrecios'
import { especialidad, RUTAS_PANEL, resumenCalificacion } from '../../lib/panelProfesional'
import { formatoSoles, RECARGO_KIT } from '../../lib/precios'
import type { PrestamoKit, PrestamoKitMovimiento, Reserva, Trabajador } from '../../types'

/** Vistas del panel del profesional que muestran datos ya cargados por Panel.tsx (Inicio, Ganancias y Ajustes). */

export interface DatosGanancias {
  semana: number
  mes: number
  recientes: { id: string; servicio: string; fecha: string; neto: number }[]
}

const ETIQUETA_ESTADO: Record<string, string> = {
  aceptada: 'Confirmado',
  en_camino: 'En camino',
  en_curso: 'En curso',
}

function fechaCorta(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`)
  if (Number.isNaN(d.getTime())) return fecha
  return d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })
}

function soles(monto: number): string {
  return `S/ ${monto.toFixed(2)}`
}

function ErrorConReintento({ texto, onReintentar }: { texto: string; onReintentar: () => void }) {
  return (
    <div role="alert" className="yavi-aviso mt-3 flex flex-wrap items-center justify-between gap-2" data-tipo="error">
      <span>{texto}</span>
      <button type="button" onClick={onReintentar} className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-sm font-bold text-red-800">
        Reintentar
      </button>
    </div>
  )
}

function Tarjeta({ icono, titulo, enlace, children }: { icono: ReactNode; titulo: string; enlace?: { a: string; texto: string }; children: ReactNode }) {
  return (
    <section className="yavi-tarjeta p-4" aria-label={titulo}>
      <div className="flex items-center gap-3">
        <BurbujaIcono>{icono}</BurbujaIcono>
        <h2 className="min-w-0 flex-1 text-lg font-extrabold leading-tight text-neutral-900">{titulo}</h2>
        {enlace && (
          <Link to={enlace.a} className="flex shrink-0 items-center gap-0.5 text-sm font-bold text-brand-700 underline underline-offset-2">
            {enlace.texto}
            <Icono nombre="flecha" className="h-4 w-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

export function InicioVista({
  nombre,
  fotoUrl,
  trabajador,
  proximo,
  errorReservas,
  onReintentarReservas,
  ganancias,
  errorGanancias,
  onReintentarGanancias,
  tieneNotificaciones,
  guardandoDisponible,
  errorDisponible,
  onAlternarDisponible,
  avisos,
}: {
  nombre: string
  fotoUrl: string | null
  trabajador: Trabajador
  proximo: Reserva | null
  errorReservas: boolean
  onReintentarReservas: () => void
  ganancias: DatosGanancias | null
  errorGanancias: boolean
  onReintentarGanancias: () => void
  tieneNotificaciones: boolean | null
  guardandoDisponible: boolean
  errorDisponible: string | null
  onAlternarDisponible: () => void
  avisos: ReactNode
}) {
  const primerNombre = nombre.trim().split(/\s+/)[0] ?? ''
  const disponible = trabajador.disponible_ahora
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 py-1">
        <Avatar nombre={nombre} fotoUrl={fotoUrl} className="h-16 w-16 text-xl" />
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-extrabold leading-tight text-neutral-900">
            {primerNombre ? `Hola, ${primerNombre}` : 'Hola'}
          </h1>
          <p className="text-sm text-neutral-600">Tu panel de trabajo</p>
        </div>
      </div>

      {avisos}

      {trabajador.habilitado_trabajar && tieneNotificaciones === false && (
        <div className="yavi-aviso" data-tipo="alerta">
          <p className="font-semibold">Activa las notificaciones para recibir pedidos</p>
          <p className="mt-1">Son la única forma de enterarte al toque cuando llega uno, aunque tengas la app cerrada.</p>
          <Link to="/activar-notificaciones" className="mt-3 inline-block rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-semibold text-white">
            Activar notificaciones
          </Link>
        </div>
      )}

      {trabajador.habilitado_trabajar && tieneNotificaciones !== false && (
        <div className="yavi-tarjeta px-4 py-3">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 rounded-full ${disponible ? 'bg-green-600 ring-4 ring-green-100' : 'bg-neutral-400'}`} />
            <p id="interruptor-disponible" className="min-w-0 flex-1 text-base font-bold text-neutral-900">
              {disponible ? 'Disponible' : 'No disponible'}
              {guardandoDisponible && <span className="ml-2 text-sm font-medium text-neutral-600">Guardando…</span>}
            </p>
            <Interruptor
              activo={disponible}
              onCambiar={onAlternarDisponible}
              deshabilitado={guardandoDisponible || tieneNotificaciones === null}
              etiquetaId="interruptor-disponible"
            />
          </div>
          {!disponible && !errorDisponible && (
            <p className="mt-1.5 pl-6 text-sm leading-snug text-neutral-600">
              No apareces en la búsqueda. Los pedidos programados te siguen llegando.
            </p>
          )}
          {errorDisponible && (
            <p role="alert" className="yavi-aviso mt-2" data-tipo="error">
              {errorDisponible}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Tarjeta icono={<Icono nombre="calendario" className="h-5 w-5" />} titulo="Tus trabajos" enlace={proximo ? { a: RUTAS_PANEL.servicios, texto: 'Ver detalle' } : undefined}>
          {errorReservas ? (
            <ErrorConReintento texto="No pudimos cargar tus trabajos." onReintentar={onReintentarReservas} />
          ) : proximo ? (
            <div className="mt-3">
              <p className="break-words text-base font-bold text-neutral-900">{proximo.servicio}</p>
              <p className="mt-0.5 text-sm text-neutral-700">
                {fechaCorta(proximo.fecha)} · {proximo.hora.slice(0, 5)} · {proximo.horas} h
              </p>
              <p className="text-sm text-neutral-600">{proximo.zona}</p>
              <span className="mt-2 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800">
                {ETIQUETA_ESTADO[proximo.estado] ?? proximo.estado}
              </span>
            </div>
          ) : (
            <div className="mt-3 flex flex-col items-center text-center">
              <p className="text-base font-bold text-neutral-900">No tienes trabajos próximos</p>
              <p className="mt-0.5 text-sm text-neutral-600">Aquí verás tus servicios programados.</p>
              <Link to={RUTAS_PANEL.servicios} className="mt-3 rounded-2xl bg-brand-700 px-6 py-3 text-base font-bold">
                Ver servicios
              </Link>
            </div>
          )}
        </Tarjeta>

        <Tarjeta icono={<Icono nombre="tendencia" className="h-5 w-5" />} titulo="Mis ganancias" enlace={{ a: RUTAS_PANEL.ganancias, texto: 'Ver detalle' }}>
          {errorGanancias || !ganancias ? (
            <ErrorConReintento texto="No pudimos cargar tus ganancias." onReintentar={onReintentarGanancias} />
          ) : (
            <>
              <dl className="mt-3 grid grid-cols-2 divide-x divide-neutral-200">
                <div className="pr-3">
                  <dt className="text-sm text-neutral-700">Esta semana</dt>
                  <dd className="text-2xl font-extrabold text-brand-700">{soles(ganancias.semana)}</dd>
                </div>
                <div className="pl-4">
                  <dt className="text-sm text-neutral-700">Este mes</dt>
                  <dd className="text-2xl font-extrabold text-brand-700">{soles(ganancias.mes)}</dd>
                </div>
              </dl>
              <p className="mt-2 border-t border-neutral-200 pt-2 text-center text-xs text-neutral-600">Ganancia neta</p>
            </>
          )}
        </Tarjeta>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-neutral-200 py-1 text-sm">
        <div className="flex items-center justify-center gap-2 px-2">
          <Icono nombre="documento" className="h-5 w-5 shrink-0 text-brand-700" />
          <dd className="text-neutral-700">
            <span className="text-lg font-extrabold text-neutral-900">{trabajador.trabajos_completados}</span>{' '}
            {trabajador.trabajos_completados === 1 ? 'trabajo realizado' : 'trabajos realizados'}
          </dd>
        </div>
        <div className="flex items-center justify-center gap-2 px-2">
          <Icono nombre="estrella" className="h-5 w-5 shrink-0 text-brand-700" />
          <dd className="font-bold text-neutral-900">{resumenCalificacion(trabajador.rating_avg, trabajador.rating_n)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function GananciasVista({
  ganancias,
  errorGanancias,
  onReintentar,
  prestamo,
  movimientosPrestamo,
}: {
  ganancias: DatosGanancias | null
  errorGanancias: boolean
  onReintentar: () => void
  prestamo: PrestamoKit | null
  movimientosPrestamo: PrestamoKitMovimiento[]
}) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="pt-1 text-2xl font-extrabold text-neutral-900">Ganancias</h1>

      {errorGanancias || !ganancias ? (
        <ErrorConReintento texto="No pudimos cargar tus ganancias." onReintentar={onReintentar} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3">
            <div className="yavi-tarjeta p-4">
              <dt className="text-sm text-neutral-700">Esta semana</dt>
              <dd className="mt-0.5 break-words text-2xl font-extrabold text-brand-700">{soles(ganancias.semana)}</dd>
            </div>
            <div className="yavi-tarjeta p-4">
              <dt className="text-sm text-neutral-700">Este mes</dt>
              <dd className="mt-0.5 break-words text-2xl font-extrabold text-brand-700">{soles(ganancias.mes)}</dd>
            </div>
          </dl>
          <p className="text-sm leading-snug text-neutral-700">
            Ganancia neta, después de la comisión de YAVI. Incluye S/ 13 del kit cuando corresponde.
          </p>

          <section aria-labelledby="titulo-ultimos" className="yavi-tarjeta p-4">
            <h2 id="titulo-ultimos" className="text-base font-bold text-neutral-900">
              Últimos servicios completados
            </h2>
            {ganancias.recientes.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600">Aún no tienes servicios completados. Cuando termines uno, su ganancia aparecerá aquí.</p>
            ) : (
              <ul className="mt-2 divide-y divide-neutral-200">
                {ganancias.recientes.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block break-words font-semibold text-neutral-900">{r.servicio}</span>
                      <span className="text-neutral-600">{fechaCorta(r.fecha)}</span>
                    </span>
                    <span className="shrink-0 font-bold text-neutral-900">{soles(r.neto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {prestamo && (
        <div className="yavi-aviso" data-tipo="alerta">
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
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-neutral-600">{titulo}</h2>
      {children}
    </section>
  )
}

export function AjustesVista({
  nombre,
  fotoUrl,
  correo,
  trabajador,
  editando,
  onCambiarEditando,
  onPerfilActualizado,
  ofreceKit,
  guardandoKit,
  errorAjustes,
  onAlternarKit,
  tieneNotificaciones,
  onPreciosCambiados,
  onSalir,
}: {
  nombre: string
  fotoUrl: string | null
  correo: string
  trabajador: Trabajador
  editando: boolean
  onCambiarEditando: (abierto: boolean) => void
  onPerfilActualizado: () => void
  ofreceKit: boolean
  guardandoKit: boolean
  errorAjustes: string | null
  onAlternarKit: () => void
  tieneNotificaciones: boolean | null
  onPreciosCambiados?: () => void
  onSalir: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="pt-1 text-2xl font-extrabold text-neutral-900">Ajustes</h1>

      <Grupo titulo="Mi perfil">
        <div className="yavi-tarjeta p-4">
          <div className="flex items-center gap-3">
            <Avatar nombre={nombre} fotoUrl={fotoUrl} className="h-16 w-16 text-xl" />
            <div className="min-w-0 flex-1">
              <p className="break-words text-lg font-extrabold leading-tight text-neutral-900">{nombre || 'Tu perfil'}</p>
              <p className="break-words text-sm text-neutral-600">{especialidad(trabajador.servicios)}</p>
            </div>
          </div>
          <dl className="mt-3 grid gap-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">Tarifa por hora</dt>
              <dd className="font-bold text-neutral-900">{soles(trabajador.tarifa_hora)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-neutral-600">Servicios</dt>
              <dd className="break-words text-right font-semibold text-neutral-900">{trabajador.servicios.join(', ') || 'Ninguno elegido'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-neutral-600">Zonas</dt>
              <dd className="break-words text-right font-semibold text-neutral-900">{trabajador.zonas.join(', ') || 'Ninguna elegida'}</dd>
            </div>
          </dl>
          {!editando && (
            <button
              type="button"
              onClick={() => onCambiarEditando(true)}
              aria-expanded={editando}
              aria-controls="editar-perfil"
              className="mt-3 w-full rounded-2xl border-2 border-brand-600 bg-white px-4 py-3 text-base font-bold text-brand-700"
            >
              Editar perfil, foto y servicios
            </button>
          )}
        </div>
        <EditarPerfilTrabajador
          trabajador={trabajador}
          onActualizado={onPerfilActualizado}
          abierto={editando}
          onCambiarAbierto={onCambiarEditando}
        />
      </Grupo>

      <Grupo titulo="Mis precios">
        <MisPrecios trabajadorId={trabajador.id} servicios={trabajador.servicios} onCambio={onPreciosCambiados} />
      </Grupo>

      {ofreceKit && (
        <Grupo titulo="Kit de limpieza">
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
            onCambiar={onAlternarKit}
            deshabilitado={guardandoKit}
          />
          <p className="px-1 text-sm leading-snug text-neutral-700">
            Solo se te ofrece cuando el cliente no tiene materiales. Del recargo de {formatoSoles(RECARGO_KIT)}, S/ 13 son para ti y S/ 5 para YAVI.
          </p>
          {guardandoKit && <p className="px-1 text-sm text-neutral-600">Guardando…</p>}
          {errorAjustes && (
            <p role="alert" className="yavi-aviso" data-tipo="error">
              {errorAjustes}
            </p>
          )}
        </Grupo>
      )}

      <Grupo titulo="Notificaciones">
        <div className="yavi-tarjeta flex items-center gap-3 p-4">
          <BurbujaIcono>
            <Icono nombre="campana" className="h-5 w-5" />
          </BurbujaIcono>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-neutral-900">Avisos de pedidos</p>
            <p className="text-sm text-neutral-600">
              {tieneNotificaciones === null ? 'Comprobando…' : tieneNotificaciones ? 'Activadas en este dispositivo' : 'Desactivadas en este dispositivo'}
            </p>
          </div>
          <Link to="/activar-notificaciones" className="shrink-0 rounded-2xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-bold text-navy-800">
            {tieneNotificaciones ? 'Administrar' : 'Activar'}
          </Link>
        </div>
      </Grupo>

      <Grupo titulo="Cuenta">
        <div className="yavi-tarjeta p-4">
          {correo && (
            <p className="mb-3 break-all text-sm text-neutral-700">
              Sesión iniciada como <span className="font-semibold text-neutral-900">{correo}</span>
            </p>
          )}
          <button type="button" onClick={onSalir} className="yavi-boton-secundario w-full py-3.5! text-base!">
            Cerrar sesión
          </button>
        </div>
      </Grupo>
    </div>
  )
}
