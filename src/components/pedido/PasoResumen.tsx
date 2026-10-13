import { Link } from 'react-router-dom'
import { lomasPronto } from '../../lib/horario'
import { ETIQUETA_MODALIDAD } from '../../lib/modalidades'
import { desglosar, formatoSoles, manoObraPorHoras, RECARGO_KIT } from '../../lib/precios'
import { armarDetalles, conKit, detalleDelPedido, entregaEstimada, esRecojo, resolverServicio } from '../../lib/solicitud'
import { ETIQUETA_SERVICIO_CORTA } from '../../lib/sinonimos'
import { usaFlujoLimpieza } from '../../lib/iniciarPedido'
import type { PedidoBorrador } from '../../lib/borrador'
import type { TrabajadorPublico } from '../../types'
import { AlcanceServicio } from '../AlcanceServicio'
import { DesglosePrecio } from '../DesglosePrecio'

function cuando(b: PedidoBorrador): string {
  if (b.programacion === 'ahora') {
    const { hora } = lomasPronto(new Date())
    return `Lo antes posible (desde las ${hora})`
  }
  const f = new Date(`${b.fecha}T${b.hora}`)
  return `${f.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })} · ${b.hora.slice(0, 5)}`
}

/** Precio que se puede afirmar con datos reales. Nada se estima a partir del texto. */
export function precioDirecto(b: PedidoBorrador, directo: TrabajadorPublico) {
  const manoObra = manoObraPorHoras(directo.tarifa_hora, b.horas, b.personas)
  return desglosar({ manoObra, kit: conKit(b) ? RECARGO_KIT : 0 })
}

export function PasoResumen({
  b,
  directo,
  haySesion,
  esCliente,
  error,
}: {
  b: PedidoBorrador
  directo: TrabajadorPublico | null
  haySesion: boolean
  esCliente: boolean
  error: string | null
}) {
  const r = resolverServicio(b)
  if (!r) return null
  const nombreServicio = usaFlujoLimpieza(b.servicioId) ? 'Limpieza' : (ETIQUETA_SERVICIO_CORTA[r.servicio.id] ?? r.servicio.nombre)
  const detalles = armarDetalles(b, [])
  const detalle = detalleDelPedido(b)
  const kit = conKit(b)
  const entrega = entregaEstimada(b, new Date())
  const recojo = esRecojo(b)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Revisa tu pedido</h1>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
        <p className="text-base font-semibold">{nombreServicio}</p>
        {b.texto.trim() && <p className="mt-1 italic text-neutral-600">“{b.texto.trim()}”</p>}
        {detalles && detalles.respuestas.length > 0 && (
          <dl className="mt-3 flex flex-col gap-1">
            {detalles.respuestas.map((f) => (
              <div key={f.etiqueta} className="grid grid-cols-[auto_1fr] gap-x-3">
                <dt className="text-neutral-500">{f.etiqueta}</dt>
                <dd className="text-right text-neutral-800">{f.valor}</dd>
              </div>
            ))}
          </dl>
        )}
        <dl className="mt-3 flex flex-col gap-1 border-t border-neutral-100 pt-3">
          <div className="grid grid-cols-[auto_1fr] gap-x-3">
            <dt className="text-neutral-500">{recojo ? 'Recojo' : 'Cuándo'}</dt>
            <dd className="text-right text-neutral-800">{cuando(b)}</dd>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3">
            <dt className="text-neutral-500">{recojo ? 'Dirección de recojo' : 'Dónde'}</dt>
            <dd className="text-right text-neutral-800">
              {b.direccion.trim()} · {b.zona}
            </dd>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3">
            <dt className="text-neutral-500">Cobro</dt>
            <dd className="text-right text-neutral-800">
              {ETIQUETA_MODALIDAD[b.modalidad]}
              {b.modalidad === 'horas' ? ` · ${b.horas} h${b.personas > 1 ? ` × ${b.personas} personas` : ''}` : ''}
            </dd>
          </div>
        </dl>
      </section>

      {recojo && (
        <p className="rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
          {entrega ? (
            <>
              Entrega estimada: <strong>{entrega}</strong>. Es una fecha orientativa: el tiempo real depende de la cantidad de prendas.
            </>
          ) : (
            'La fecha de entrega se confirma al recoger tus prendas.'
          )}
        </p>
      )}

      {/* Precio según el trabajo */}
      {directo && b.modalidad === 'horas' ? (
        <>
          <DesglosePrecio
            titulo={`Precio con ${directo.nombre.split(' ')[0]}`}
            desglose={precioDirecto(b, directo)}
            detalleManoObra={`${formatoSoles(directo.tarifa_hora)} × ${b.horas} h${b.personas > 1 ? ` × ${b.personas} personas` : ''}`}
          />
          <p className="text-xs text-neutral-500">Al enviar aceptas este precio y el alcance de abajo. {directo.nombre.split(' ')[0]} tiene 15 minutos para responder.</p>
        </>
      ) : b.modalidad === 'horas' ? (
        <div className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          <p className="font-medium text-neutral-900">El precio lo ves antes de contratar</p>
          <p className="mt-1">
            Los profesionales que acepten te mostrarán su precio por {b.horas} h{b.personas > 1 ? ` × ${b.personas} personas` : ''}. Tú eliges y confirmas a quién contratar.
          </p>
          {kit && <p className="mt-1 text-neutral-600">Se suma el kit de limpieza: {formatoSoles(RECARGO_KIT)}.</p>}
        </div>
      ) : (
        <div className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          <p className="font-medium text-neutral-900">Aún no hay precio</p>
          <p className="mt-1">
            {b.modalidad === 'cotizacion' && 'Los profesionales te enviarán una propuesta con precio y alcance. Tú decides si la aceptas.'}
            {b.modalidad === 'diagnostico' && 'Primero pagas una visita con precio conocido. Si hace falta reparar, recibirás un presupuesto aparte para aceptar o rechazar.'}
            {b.modalidad === 'fijo' && 'Cada profesional te mostrará su precio fijo y lo que incluye antes de que contrates.'}
          </p>
        </div>
      )}

      {detalle && <AlcanceServicio incluye={detalle.incluye} noIncluye={detalle.noIncluye} condiciones={detalle.notas} titulo="Qué incluye y condiciones" />}

      {!haySesion && (
        <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          Para enviar tu pedido necesitas entrar o crear tu cuenta. Guardamos lo que escribiste: al volver sigues aquí.
          <Link to="/registro?volver=/pedir" className="mt-2 block font-semibold underline">
            Crear cuenta
          </Link>
        </p>
      )}
      {haySesion && !esCliente && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Esta cuenta es de profesional. Para pedir un servicio entra con una cuenta de cliente.
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}
