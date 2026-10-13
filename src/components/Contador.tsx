/** Selector numérico con botones grandes (−/+), pensado para el dedo en el celular. */
export function Contador({
  etiqueta,
  valor,
  min,
  max,
  onChange,
  unidad,
  ayuda,
}: {
  etiqueta: string
  valor: number
  min: number
  max: number
  onChange: (v: number) => void
  unidad?: string
  ayuda?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-neutral-700">{etiqueta}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Menos ${etiqueta.toLowerCase()}`}
          disabled={valor <= min}
          onClick={() => onChange(Math.max(min, valor - 1))}
          className="h-12 w-12 rounded-xl border border-neutral-300 bg-white text-2xl font-semibold text-neutral-700 disabled:opacity-30"
        >
          −
        </button>
        <span className="min-w-20 text-center text-lg font-semibold" aria-live="polite">
          {valor}
          {unidad ? ` ${unidad}` : ''}
        </span>
        <button
          type="button"
          aria-label={`Más ${etiqueta.toLowerCase()}`}
          disabled={valor >= max}
          onClick={() => onChange(Math.min(max, valor + 1))}
          className="h-12 w-12 rounded-xl border border-neutral-300 bg-white text-2xl font-semibold text-neutral-700 disabled:opacity-30"
        >
          +
        </button>
      </div>
      {ayuda && <span className="text-xs text-neutral-500">{ayuda}</span>}
    </div>
  )
}
