/** Qué incluye / qué queda fuera / condiciones, siempre desplegable para no saturar la pantalla. */
export function AlcanceServicio({
  incluye,
  noIncluye,
  condiciones,
  titulo = 'Qué incluye y qué queda fuera',
  abierto = false,
}: {
  incluye: string[]
  noIncluye: string[]
  condiciones?: string[]
  titulo?: string
  abierto?: boolean
}) {
  if (incluye.length === 0 && noIncluye.length === 0 && !(condiciones && condiciones.length > 0)) return null
  return (
    <details open={abierto} className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-brand-800">{titulo}</summary>
      {incluye.length > 0 && (
        <>
          <p className="mt-3 font-medium text-neutral-700">Incluye</p>
          <ul className="mt-1 list-inside list-disc text-neutral-600">
            {incluye.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </>
      )}
      {noIncluye.length > 0 && (
        <>
          <p className="mt-3 font-medium text-neutral-700">No incluye</p>
          <ul className="mt-1 list-inside list-disc text-neutral-600">
            {noIncluye.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </>
      )}
      {condiciones && condiciones.length > 0 && (
        <>
          <p className="mt-3 font-medium text-neutral-700">Condiciones</p>
          <ul className="mt-1 list-inside list-disc text-neutral-600">
            {condiciones.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </>
      )}
    </details>
  )
}
