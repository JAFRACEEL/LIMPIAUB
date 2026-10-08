import type { PreguntaServicio } from '../lib/catalogoServicios'

/** Campo genérico para una pregunta propia del servicio (opción, multi, texto o cantidad). */
export function PreguntaCampo({
  pregunta,
  valor,
  onChange,
}: {
  pregunta: PreguntaServicio
  valor: string | string[] | undefined
  onChange: (valor: string | string[]) => void
}) {
  const etiqueta = (
    <span className="text-sm font-medium text-neutral-700">
      {pregunta.etiqueta}
      {pregunta.obligatoria && <span aria-hidden="true"> *</span>}
    </span>
  )

  if (pregunta.tipo === 'opcion') {
    return (
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1">{etiqueta}</legend>
        {(pregunta.opciones ?? []).map((opcion) => (
          <label key={opcion} className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="radio"
              name={pregunta.id}
              checked={valor === opcion}
              onChange={() => onChange(opcion)}
              className="mt-0.5 h-4 w-4 accent-teal-700"
            />
            <span>{opcion}</span>
          </label>
        ))}
      </fieldset>
    )
  }

  if (pregunta.tipo === 'multi') {
    const seleccion = Array.isArray(valor) ? valor : []
    return (
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1">{etiqueta}</legend>
        {(pregunta.opciones ?? []).map((opcion) => (
          <label key={opcion} className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={seleccion.includes(opcion)}
              onChange={(e) =>
                onChange(e.target.checked ? [...seleccion, opcion] : seleccion.filter((o) => o !== opcion))
              }
              className="mt-0.5 h-4 w-4 accent-teal-700"
            />
            <span>{opcion}</span>
          </label>
        ))}
      </fieldset>
    )
  }

  if (pregunta.tipo === 'cantidad') {
    return (
      <label className="flex flex-col gap-1">
        {etiqueta}
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={typeof valor === 'string' ? valor : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={pregunta.placeholder}
          className="input"
        />
      </label>
    )
  }

  return (
    <label className="flex flex-col gap-1">
      {etiqueta}
      {pregunta.multilinea ? (
        <textarea
          value={typeof valor === 'string' ? valor : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={pregunta.placeholder}
          className="input min-h-16"
        />
      ) : (
        <input
          type="text"
          inputMode={pregunta.id === 'contacto_recojo' ? 'tel' : undefined}
          value={typeof valor === 'string' ? valor : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={pregunta.placeholder}
          className="input"
        />
      )}
    </label>
  )
}
