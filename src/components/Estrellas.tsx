export function Estrellas({ promedio, cantidad }: { promedio: number; cantidad: number }) {
  const llenas = Math.round(promedio)
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span className="text-amber-500">
        {'★'.repeat(llenas)}
        {'☆'.repeat(5 - llenas)}
      </span>
      <span className="text-neutral-500">
        {cantidad > 0 ? `${promedio.toFixed(1)} (${cantidad})` : 'Sin calificar aún'}
      </span>
    </span>
  )
}
