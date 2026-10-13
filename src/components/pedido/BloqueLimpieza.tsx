import { AMBIENTES, TAREA_REORGANIZAR } from '../../lib/sinonimos'
import {
  AVISO_HORAS_LIMPIEZA,
  ETIQUETA_ALCANCE,
  ETIQUETA_ESTADO,
  ETIQUETA_TAMANO,
  tareasSugeridas,
  type AlcanceLimpieza,
  type DatosLimpieza,
  type EstadoLimpieza,
  type TamanoLimpieza,
} from '../../lib/flujoLimpieza'
import type { ModalidadPrecio } from '../../lib/modalidades'
import type { EspacioLimpieza } from '../../lib/sinonimos'

const ESPACIOS: { valor: EspacioLimpieza; etiqueta: string }[] = [
  { valor: 'hogar', etiqueta: 'Casa o departamento' },
  { valor: 'oficina', etiqueta: 'Oficina o local' },
  { valor: 'alojamiento', etiqueta: 'Alojamiento o Airbnb' },
  { valor: 'evento', etiqueta: 'Después de una fiesta' },
  { valor: 'obra', etiqueta: 'Después de una obra' },
]

function Chip({ activo, onClick, children, numero }: { activo: boolean; onClick: () => void; children: React.ReactNode; numero?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-full border px-3 py-2 text-left text-sm ${
        activo ? 'border-teal-700 bg-teal-50 font-semibold text-teal-900' : 'border-neutral-300 bg-white text-neutral-700'
      }`}
    >
      {numero ? <span className="mr-1.5 inline-block h-5 w-5 rounded-full bg-teal-700 text-center text-xs leading-5 text-white">{numero}</span> : null}
      {children}
    </button>
  )
}

/**
 * Limpieza sin "básica / profunda": se describe qué se quiere limpiar.
 * Solo se pregunta tamaño y estado cuando se va a preparar una propuesta por alcance.
 */
export function BloqueLimpieza({
  datos,
  modalidad,
  onChange,
  onCambiarEspacio,
}: {
  datos: DatosLimpieza
  modalidad: ModalidadPrecio
  onChange: (d: DatosLimpieza) => void
  /** Cambiar el tipo de espacio puede cambiar la clasificación (p. ej. obra usa otro flujo). */
  onCambiarEspacio: (e: EspacioLimpieza) => void
}) {
  // Reorganizar se pide con su propia casilla (siempre expreso), no como una tarea más.
  const sugeridas = tareasSugeridas(datos).filter((t) => t !== TAREA_REORGANIZAR)
  const porAlcance = modalidad === 'cotizacion'

  function alternarAmbiente(a: string) {
    const ambientes = datos.ambientes.includes(a) ? datos.ambientes.filter((x) => x !== a) : [...datos.ambientes, a]
    onChange({ ...datos, ambientes, tareas: datos.tareas.filter((t) => tareasSugeridas({ ...datos, ambientes }).includes(t)) })
  }
  function alternarTarea(t: string) {
    onChange({ ...datos, tareas: datos.tareas.includes(t) ? datos.tareas.filter((x) => x !== t) : [...datos.tareas, t] })
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-neutral-700">¿Dónde es la limpieza?</legend>
        <div className="flex flex-wrap gap-2">
          {ESPACIOS.map((e) => (
            <Chip key={e.valor} activo={datos.espacio === e.valor} onClick={() => onCambiarEspacio(e.valor)}>
              {e.etiqueta}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-neutral-700">¿Qué quieres limpiar?</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(ETIQUETA_ALCANCE) as AlcanceLimpieza[]).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={datos.alcance === a}
              onClick={() => onChange({ ...datos, alcance: a, tareas: [] })}
              className={`min-h-14 rounded-xl border px-2 py-2 text-sm ${
                datos.alcance === a ? 'border-teal-700 bg-teal-50 font-semibold text-teal-900' : 'border-neutral-300 bg-white text-neutral-700'
              }`}
            >
              {ETIQUETA_ALCANCE[a]}
            </button>
          ))}
        </div>
      </fieldset>

      {datos.alcance === 'ambientes' && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-neutral-700">¿Qué ambientes?</legend>
          <div className="flex flex-wrap gap-2">
            {AMBIENTES.map((a) => (
              <Chip key={a.etiqueta} activo={datos.ambientes.includes(a.etiqueta)} onClick={() => alternarAmbiente(a.etiqueta)}>
                {a.etiqueta}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      {datos.alcance === 'puntual' && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-neutral-700">¿Qué quieres limpiar exactamente?</span>
          <textarea
            value={datos.puntual}
            onChange={(e) => onChange({ ...datos, puntual: e.target.value })}
            className="input min-h-20"
            placeholder="Ej. la alfombra de la sala y el sofá"
          />
        </label>
      )}

      {!porAlcance && sugeridas.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium text-neutral-700">¿Qué es lo más importante? (opcional)</legend>
          <p className="mb-2 text-xs text-neutral-500">Toca en el orden en que quieres que lo hagan.</p>
          <div className="flex flex-wrap gap-2">
            {sugeridas.map((t) => {
              const pos = datos.tareas.indexOf(t)
              return (
                <Chip key={t} activo={pos >= 0} numero={pos >= 0 ? pos + 1 : undefined} onClick={() => alternarTarea(t)}>
                  {t}
                </Chip>
              )
            })}
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{AVISO_HORAS_LIMPIEZA}</p>
        </fieldset>
      )}

      {porAlcance && (
        <>
          {datos.alcance !== 'puntual' && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-neutral-700">Tamaño aproximado</span>
              <select
                value={datos.tamano ?? ''}
                onChange={(e) => onChange({ ...datos, tamano: (e.target.value || undefined) as TamanoLimpieza | undefined })}
                className="input"
              >
                <option value="">Elige una opción</option>
                {(Object.keys(ETIQUETA_TAMANO) as TamanoLimpieza[]).map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TAMANO[t]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-neutral-700">¿Cómo está el lugar?</legend>
            <div className="flex flex-col gap-2">
              {(Object.keys(ETIQUETA_ESTADO) as EstadoLimpieza[]).map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="radio"
                    name="estado_limpieza"
                    checked={(datos.estado ?? 'normal') === e}
                    onChange={() => onChange({ ...datos, estado: e })}
                    className="h-4 w-4 accent-teal-700"
                  />
                  {ETIQUETA_ESTADO[e]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
            Los profesionales te enviarán una propuesta de precio con lo que incluye. No mostramos un precio estimado antes de eso.
          </p>
        </>
      )}

      <label className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={datos.reorganizar}
          onChange={(e) => onChange({ ...datos, reorganizar: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-teal-700"
        />
        <span>
          <span className="font-medium">También quiero que reorganicen mis pertenencias</span>
          <span className="block text-xs text-neutral-500">Sacar y volver a acomodar lo de cajones, closets o alacenas. Solo si lo pides aquí.</span>
        </span>
      </label>
    </div>
  )
}
