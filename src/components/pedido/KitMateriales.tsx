import { RECARGO_KIT, formatoSoles } from '../../lib/precios'
import type { PedidoBorrador } from '../../lib/borrador'

/** "¿Tu espacio tiene materiales de limpieza?" Solo para limpieza por horas. El kit sigue en S/18 (S/13 profesional + S/5 YAVI). */
export function KitMateriales({
  b,
  onChange,
  puedeTraerKit = true,
}: {
  b: PedidoBorrador
  onChange: (cambio: Partial<PedidoBorrador>) => void
  puedeTraerKit?: boolean
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-neutral-700">¿Tu espacio tiene materiales de limpieza?</legend>
      <div className="grid grid-cols-2 gap-2">
        {(['si', 'no'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={b.materiales === v}
            onClick={() => onChange({ materiales: v, opcionSinMateriales: '' })}
            className={`rounded-xl border px-3 py-3 text-sm font-medium ${
              b.materiales === v ? 'border-brand-700 bg-brand-50 text-brand-900' : 'border-neutral-300 bg-white text-neutral-700'
            }`}
          >
            {v === 'si' ? 'Sí, tengo' : 'No tengo'}
          </button>
        ))}
      </div>

      {b.materiales === 'no' && (
        <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
          <label className={`flex items-start gap-2 ${!puedeTraerKit ? 'opacity-40' : ''}`}>
            <input
              type="radio"
              name="opcionMateriales"
              disabled={!puedeTraerKit}
              checked={b.opcionSinMateriales === 'trae_kit'}
              onChange={() => onChange({ opcionSinMateriales: 'trae_kit' })}
              className="mt-0.5 h-4 w-4 accent-brand-700"
            />
            <span>
              El profesional trae su kit (+{formatoSoles(RECARGO_KIT)})
              {!puedeTraerKit && ' — no disponible con este profesional'}
              <span className="block text-xs text-neutral-500">Solo verás a quienes ofrecen traer su kit.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="opcionMateriales"
              checked={b.opcionSinMateriales === 'compra_kit'}
              onChange={() => onChange({ opcionSinMateriales: 'compra_kit' })}
              className="mt-0.5 h-4 w-4 accent-brand-700"
            />
            <span>Quiero comprar un kit que quede en mi casa</span>
          </label>
          {b.opcionSinMateriales === 'compra_kit' && (
            <div className="rounded-lg bg-neutral-100 p-3 text-neutral-600">
              <p className="mb-1 font-medium">Kit básico sugerido</p>
              <p>Escoba, recogedor, trapeador, balde, guantes, detergente y desinfectante multiuso.</p>
              <p className="mt-2">Coordinamos la entrega por WhatsApp. Este kit no se cobra en la app.</p>
            </div>
          )}
        </div>
      )}
    </fieldset>
  )
}
