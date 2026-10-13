import { ETIQUETA_MODALIDAD, type ModalidadPrecio } from '../../lib/modalidades'
import { TEXTO_MODALIDAD_LIMPIEZA } from '../../lib/flujoLimpieza'

const DETALLE: Record<ModalidadPrecio, string> = {
  horas: 'Pagas por el tiempo de trabajo. Ves el precio de cada profesional antes de contratar.',
  fijo: 'Un precio por el trabajo, con el alcance definido por el profesional.',
  diagnostico: 'Pagas una visita con precio conocido. La reparación se presupuesta aparte y tú decides.',
  cotizacion: 'El profesional evalúa tu caso y te envía una propuesta de precio.',
}

/** Cómo quiere contratar. Solo aparecen las formas que hoy se pueden contratar de verdad. */
export function SelectorModalidad({
  disponibles,
  valor,
  limpieza,
  onChange,
}: {
  disponibles: ModalidadPrecio[]
  valor: ModalidadPrecio
  limpieza: boolean
  onChange: (m: ModalidadPrecio) => void
}) {
  if (disponibles.length < 2) return null
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-neutral-700">¿Cómo quieres contratar?</legend>
      <div className="flex flex-col gap-2">
        {disponibles.map((m) => {
          const texto =
            limpieza && (m === 'horas' || m === 'cotizacion')
              ? TEXTO_MODALIDAD_LIMPIEZA[m]
              : { titulo: ETIQUETA_MODALIDAD[m], detalle: DETALLE[m] }
          return (
            <label
              key={m}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${
                valor === m ? 'border-teal-700 bg-teal-50' : 'border-neutral-300 bg-white'
              }`}
            >
              <input
                type="radio"
                name="modalidad"
                checked={valor === m}
                onChange={() => onChange(m)}
                className="mt-1 h-4 w-4 accent-teal-700"
              />
              <span>
                <span className="block text-sm font-semibold text-neutral-900">{texto.titulo}</span>
                <span className="block text-xs text-neutral-600">{texto.detalle}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
