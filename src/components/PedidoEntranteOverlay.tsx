import { useEffect, useState } from 'react'
import type { DetallesServicio } from '../lib/preguntasServicio'
import { DetallesServicioVista } from './DetallesServicioVista'

export interface PedidoEntranteOverlayData {
  id: string
  tipo: 'directo' | 'abierto'
  servicio: string
  subtipoServicio: string | null
  descripcionTrabajo: string | null
  fotoReferenciaRuta: string | null
  detallesServicio: DetallesServicio | null
  zona: string
  fecha: string
  hora: string
  horas: number
  conMateriales: boolean
  ventanaCierraEn: string | null
  pagoNeto: number
  advertencia?: string | null
}

interface Confirmacion {
  tipo: 'aceptado' | 'rechazado'
  titulo: string
  mensaje: string
}

function useCuentaRegresiva(hasta: string | null): string | null {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    if (!hasta) return
    const id = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [hasta])
  if (!hasta) return null
  const faltanMs = new Date(hasta).getTime() - ahora
  if (faltanMs <= 0) return 'Venciendo…'
  const m = Math.floor(faltanMs / 60000)
  const s = Math.floor((faltanMs % 60000) / 1000)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Pantalla completa tipo "llamada entrante", para que un pedido nuevo se
// note de verdad aunque la trabajadora tenga el celular en la mano: solo se
// atiende un pedido a la vez (el más urgente primero), igual que en apps de
// taxi. Se puede minimizar a una franja inferior para poder ver el resto del
// panel sin perder la cola.
export function PedidoEntranteOverlay({
  pedido,
  confirmacion,
  procesando,
  minimizado,
  onAceptar,
  onRechazar,
  onMinimizar,
  onMaximizar,
  onVerFoto,
}: {
  pedido: PedidoEntranteOverlayData | null
  confirmacion: Confirmacion | null
  procesando: boolean
  minimizado: boolean
  onAceptar: () => void
  onRechazar: () => void
  onMinimizar: () => void
  onMaximizar: () => void
  onVerFoto: (ruta: string | null) => void
}) {
  const cuentaRegresiva = useCuentaRegresiva(pedido?.ventanaCierraEn ?? null)

  if (!pedido && !confirmacion) return null

  if (minimizado && !confirmacion && pedido) {
    return (
      <button
        type="button"
        onClick={onMaximizar}
        className="fixed inset-x-4 bottom-4 z-50 flex items-center justify-between gap-3 rounded-2xl bg-navy-800 px-4 py-3 text-left text-white shadow-xl"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-white">
            {pedido.tipo === 'directo' ? 'Pedido directo' : 'Pedido cerca de ti'}
          </span>
          <span className="block truncate text-sm font-semibold">
            {pedido.servicio} · S/ {pedido.pagoNeto.toFixed(2)}
          </span>
        </span>
        {cuentaRegresiva && <span className="shrink-0 text-xs font-bold">⏱ {cuentaRegresiva}</span>}
        <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-800">Ver</span>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto text-brand-ink"
      style={{
        background: 'radial-gradient(120% 90% at 50% 0%, #ffa04a 0%, #ff7a1a 42%, #e8590c 100%)',
      }}
    >
      {confirmacion ? (
        <div className="flex min-h-full flex-col items-center justify-center gap-3 px-8 py-14 text-center">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full bg-white text-4xl ${
              confirmacion.tipo === 'aceptado' ? 'text-brand-700' : 'text-neutral-500'
            }`}
          >
            {confirmacion.tipo === 'aceptado' ? '✓' : '✕'}
          </div>
          <p className="text-xl font-extrabold">{confirmacion.titulo}</p>
          <p className="text-sm text-brand-ink">{confirmacion.mensaje}</p>
        </div>
      ) : pedido ? (
        <div className="flex min-h-full w-full max-w-lg flex-col items-center justify-between gap-6 px-7 py-14">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onMinimizar}
              className="mb-1 rounded-full bg-white/35 px-3 py-1 text-xs font-semibold text-brand-ink"
            >
              ↓ Ver panel
            </button>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-ink">
              {pedido.tipo === 'directo' ? 'Pedido directo para ti' : 'Nuevo pedido abierto'}
            </p>
            {cuentaRegresiva && <p className="text-3xl font-extrabold tabular-nums">{cuentaRegresiva}</p>}
          </div>

          <div className="relative flex h-40 w-40 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-white/30" />
            <span className="absolute inset-3 animate-ping rounded-full bg-white/20 [animation-delay:0.4s]" />
            <span className="relative flex h-28 w-28 items-center justify-center rounded-full bg-white shadow-lg">
              <svg
                width="52"
                height="52"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#123b8c"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.5 3 9 8.5" />
                <path d="M3 21l4.5-1.5L18.5 8.5a2.12 2.12 0 0 0-3-3L4.5 16.5 3 21z" />
                <path d="M18 6l1.5 1.5" />
              </svg>
            </span>
          </div>

          <div className="flex w-full flex-col items-center gap-4">
            <div className="text-center">
              <p className="text-4xl font-extrabold leading-none">S/ {pedido.pagoNeto.toFixed(2)}</p>
              <p className="mt-1 text-sm text-brand-ink">Pago neto estimado</p>
            </div>

            <div className="w-full rounded-2xl bg-white/30 px-4 py-3 text-sm">
              <Fila etiqueta="Servicio" valor={pedido.servicio} />
              {pedido.subtipoServicio && <Fila etiqueta="Detalle" valor={pedido.subtipoServicio} />}
              <Fila etiqueta="Zona" valor={pedido.zona} />
              <Fila etiqueta="Fecha" valor={`${pedido.fecha} · ${pedido.hora.slice(0, 5)}`} />
              <Fila etiqueta="Duración" valor={`${pedido.horas} horas`} />
              {pedido.conMateriales && <Fila etiqueta="Materiales" valor="Llevas tu kit (+S/ 18)" />}
              {pedido.advertencia && (
                <p className="mt-2 border-t border-brand-ink/25 pt-2 font-bold text-brand-ink">
                  ⚠️ {pedido.advertencia}
                </p>
              )}
              {pedido.descripcionTrabajo && (
                <p className="mt-2 border-t border-brand-ink/25 pt-2 text-brand-ink">{pedido.descripcionTrabajo}</p>
              )}
              <DetallesServicioVista
                claro
                detalles={pedido.detallesServicio}
                fotoLegado={pedido.fotoReferenciaRuta}
                onVerFoto={onVerFoto}
              />
            </div>

            <div className="flex w-full gap-4">
              <button
                type="button"
                disabled={procesando}
                onClick={onRechazar}
                aria-label="Rechazar pedido"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/35 text-2xl text-brand-ink disabled:opacity-60"
              >
                ✕
              </button>
              <button
                type="button"
                disabled={procesando}
                onClick={onAceptar}
                className="h-16 flex-1 rounded-full bg-white text-lg font-extrabold text-brand-700 shadow-lg disabled:opacity-60"
              >
                Acepto
              </button>
            </div>

            <p className="text-center text-[11px] text-brand-ink">
              {pedido.tipo === 'directo'
                ? 'Aún no ves la dirección; aparece apenas aceptes.'
                : 'No ves la dirección ni el nombre de la clienta hasta que te elija.'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-brand-ink">{etiqueta}</span>
      <span className="text-right font-semibold">{valor}</span>
    </div>
  )
}
