import { ZONAS } from '../../lib/constantes'
import { hoyLima } from '../../lib/horario'
import type { PedidoBorrador } from '../../lib/borrador'
import type { TrabajadorPublico } from '../../types'

type Cambio = Partial<PedidoBorrador>

/** Paso 2: dónde y cuándo. Dirección precargada y editable; se escribe a mano, sin GPS. */
export function PasoLugarHorario({
  b,
  actualizar,
  directo,
  disponibleDirecto,
  verificando,
  onPasarAAbierto,
  recojo,
  sinProfesionalesEnZona,
}: {
  b: PedidoBorrador
  actualizar: (c: Cambio) => void
  directo: TrabajadorPublico | null
  disponibleDirecto: boolean | null
  verificando: boolean
  onPasarAAbierto: () => void
  /** Lavado con recojo: los textos hablan de recojo. */
  recojo: boolean
  /** Nombre del servicio si en la zona elegida no hay profesionales habilitados. */
  sinProfesionalesEnZona: string | null
}) {
  const noDisponible = !!directo && disponibleDirecto === false
  const noEstaAhora = !!directo && b.programacion === 'ahora' && !directo.disponible_ahora

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">¿Dónde y cuándo?</h1>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-neutral-700">{recojo ? 'Dirección de recojo' : 'Dirección'}</span>
        <input
          value={b.direccion}
          onChange={(e) => actualizar({ direccion: e.target.value })}
          autoComplete="street-address"
          className="input"
          placeholder="Jirón / calle, número, referencia"
        />
        <span className="text-xs text-neutral-500">Escríbela a mano. No necesitas activar el GPS.</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-neutral-700">Zona</span>
        <select value={b.zona} onChange={(e) => actualizar({ zona: e.target.value })} className="input">
          <option value="">Elige tu zona</option>
          {ZONAS.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </label>

      {sinProfesionalesEnZona && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Todavía no hay profesionales de {sinProfesionalesEnZona} en {b.zona}. Prueba con otra zona; no podemos enviar tu pedido a nadie en esta.
        </p>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-neutral-700">{recojo ? '¿Cuándo recogemos?' : '¿Cuándo?'}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { v: 'ahora', t: 'Lo antes posible', d: 'En unos 30 min' },
              { v: 'programada', t: 'Programar', d: 'Elijo día y hora' },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              aria-pressed={b.programacion === o.v}
              onClick={() => actualizar({ programacion: o.v })}
              className={`rounded-xl border px-3 py-3 text-left ${
                b.programacion === o.v ? 'border-teal-700 bg-teal-50' : 'border-neutral-300 bg-white'
              }`}
            >
              <span className="block text-sm font-semibold text-neutral-900">{o.t}</span>
              <span className="block text-xs text-neutral-500">{o.d}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {b.programacion === 'programada' ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">{recojo ? 'Día de recojo' : 'Día'}</span>
            <input type="date" min={hoyLima(new Date())} value={b.fecha} onChange={(e) => actualizar({ fecha: e.target.value })} className="input" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">{recojo ? 'Hora de recojo' : 'Hora'}</span>
            <input type="time" value={b.hora} onChange={(e) => actualizar({ hora: e.target.value })} className="input" />
          </label>
        </div>
      ) : (
        <p className="rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
          Avisamos a los profesionales que están disponibles ahora. Si nadie acepta en unos minutos, podrás elegir otra hora.
        </p>
      )}

      {directo && verificando && <p className="text-xs text-neutral-500">Revisando la agenda de {directo.nombre.split(' ')[0]}…</p>}
      {(noDisponible || noEstaAhora) && directo && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">
            {directo.nombre.split(' ')[0]} {noEstaAhora ? 'no está disponible ahora' : 'no está libre en ese horario'}.
          </p>
          <p className="mt-1">Cambia el horario o envía tu pedido a otros profesionales.</p>
          <button type="button" onClick={onPasarAAbierto} className="mt-2 rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white">
            Enviar a otros profesionales
          </button>
        </div>
      )}

      <details className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-teal-800">Agregar una nota (opcional)</summary>
        <textarea
          value={b.notas}
          onChange={(e) => actualizar({ notas: e.target.value })}
          maxLength={500}
          className="input mt-2 min-h-20 w-full"
          placeholder="Ej. Tocar el timbre dos veces"
        />
      </details>
    </div>
  )
}
