import type { Desglose } from '../lib/precios'
import { formatoSoles } from '../lib/precios'

/** Líneas de precio separadas: mano de obra, materiales, movilidad y otros cargos autorizados. */
export function DesglosePrecio({
  desglose,
  detalleManoObra,
  titulo,
}: {
  desglose: Desglose
  /** Ej. "S/ 15.00 × 4 h". */
  detalleManoObra?: string
  titulo?: string
}) {
  const filas: { etiqueta: string; valor: string; suave?: boolean }[] = [
    {
      etiqueta: detalleManoObra ? `Mano de obra (${detalleManoObra})` : 'Mano de obra',
      valor: formatoSoles(desglose.manoObra),
    },
  ]
  if (desglose.descuentoVisita > 0) {
    filas.push({ etiqueta: 'Descuento: visita de diagnóstico ya pagada', valor: `− ${formatoSoles(desglose.descuentoVisita)}` })
  }
  if (desglose.kit > 0) filas.push({ etiqueta: 'Kit de limpieza', valor: formatoSoles(desglose.kit) })
  if (desglose.materiales > 0) filas.push({ etiqueta: 'Materiales', valor: formatoSoles(desglose.materiales) })
  if (desglose.movilidad > 0) filas.push({ etiqueta: 'Movilidad', valor: formatoSoles(desglose.movilidad) })
  if (desglose.otros > 0) filas.push({ etiqueta: 'Otros cargos', valor: formatoSoles(desglose.otros) })

  return (
    <div className="rounded-xl bg-neutral-50 px-4 py-3 text-sm">
      {titulo && <p className="mb-1 font-medium text-neutral-800">{titulo}</p>}
      <dl className="flex flex-col gap-1">
        {filas.map((f) => (
          <div key={f.etiqueta} className="flex items-start justify-between gap-3 text-neutral-600">
            <dt>{f.etiqueta}</dt>
            <dd className="shrink-0 tabular-nums">{f.valor}</dd>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between border-t border-neutral-200 pt-2 text-base font-semibold text-neutral-900">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatoSoles(desglose.total)}</dd>
        </div>
      </dl>
    </div>
  )
}
