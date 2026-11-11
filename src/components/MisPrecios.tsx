import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Boton } from './ui'
import { traducirError } from '../lib/errores'
import { formatoSoles } from '../lib/precios'
import { ETIQUETA_MODALIDAD } from '../lib/modalidades'
import {
  lineasDeTexto,
  montoDeTexto,
  ranurasDePrecio,
  validarPrecio,
  type BorradorPrecio,
  type PrecioProfesional,
  type RanuraPrecio,
} from '../lib/preciosProfesional'

const AYUDA: Record<RanuraPrecio['modalidad'], string> = {
  fijo: 'Un precio por el trabajo completo (o por unidad, como "por punto de luz"). El cliente lo ve antes de contratar.',
  diagnostico: 'Lo que cobras por ir a revisar. La reparación se presupuesta aparte y el cliente la acepta antes.',
}

function aBorrador(p?: PrecioProfesional): BorradorPrecio {
  return {
    monto: p ? String(p.monto) : '',
    unidad: p?.unidad ?? 'trabajo',
    alcance: p?.alcance ?? '',
    incluye: p?.incluye.join('\n') ?? '',
    noIncluye: p?.no_incluye.join('\n') ?? '',
  }
}

export function MisPrecios({ trabajadorId, servicios, onCambio }: { trabajadorId: string; servicios: string[]; onCambio?: () => void }) {
  const ranuras = useMemo(() => ranurasDePrecio(servicios), [servicios])
  const [precios, setPrecios] = useState<PrecioProfesional[] | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    const { data, error } = await supabase
      .from('precios_profesional')
      .select('id, servicio, modalidad, monto, unidad, alcance, incluye, no_incluye, activo')
      .eq('trabajador_id', trabajadorId)
    if (error) {
      setErrorCarga(traducirError(error))
      return
    }
    setPrecios((data ?? []) as PrecioProfesional[])
  }, [trabajadorId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Recarga local y avisa al panel, para que los pedidos entrantes usen los precios recién guardados.
  const alCambiar = useCallback(async () => {
    await cargar()
    onCambio?.()
  }, [cargar, onCambio])

  if (ranuras.length === 0) {
    return (
      <p className="yavi-tarjeta p-4 text-sm leading-snug text-neutral-700">
        Tus servicios actuales se cobran por horas con tu tarifa. Si agregas oficios como electricidad o gasfitería, aquí fijarás tus precios.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-sm leading-snug text-neutral-700">
        Tú pones tus precios. Sin precio configurado no se te ofrecen pedidos de ese servicio.
      </p>
      {errorCarga && (
        <div role="alert" className="yavi-aviso" data-tipo="error">
          {errorCarga}{' '}
          <button type="button" onClick={() => void cargar()} className="font-bold underline">
            Reintentar
          </button>
        </div>
      )}
      {precios === null && !errorCarga && <p className="px-1 text-sm text-neutral-600">Cargando…</p>}
      {precios &&
        ranuras.map((r) => {
          const clave = `${r.servicio}|${r.modalidad}`
          const actual = precios.find((p) => p.servicio === r.servicio && p.modalidad === r.modalidad)
          return (
            <FilaPrecio
              key={clave}
              ranura={r}
              actual={actual}
              trabajadorId={trabajadorId}
              abierta={abierta === clave}
              onAbrir={(v) => setAbierta(v ? clave : null)}
              onCambio={alCambiar}
            />
          )
        })}
    </div>
  )
}

function FilaPrecio({
  ranura,
  actual,
  trabajadorId,
  abierta,
  onAbrir,
  onCambio,
}: {
  ranura: RanuraPrecio
  actual?: PrecioProfesional
  trabajadorId: string
  abierta: boolean
  onAbrir: (abrir: boolean) => void
  onCambio: () => Promise<void>
}) {
  const [b, setB] = useState<BorradorPrecio>(aBorrador(actual))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (abierta) setB(aBorrador(actual))
    setError(null)
  }, [abierta, actual])

  async function guardar() {
    const problema = validarPrecio(b)
    if (problema) return setError(problema)
    setGuardando(true)
    setError(null)
    const { error: e } = await supabase.from('precios_profesional').upsert(
      {
        trabajador_id: trabajadorId,
        servicio: ranura.servicio,
        modalidad: ranura.modalidad,
        monto: montoDeTexto(b.monto),
        unidad: ranura.modalidad === 'fijo' ? b.unidad : 'trabajo',
        alcance: b.alcance.trim(),
        incluye: lineasDeTexto(b.incluye),
        no_incluye: lineasDeTexto(b.noIncluye),
        activo: true,
      },
      { onConflict: 'trabajador_id,servicio,modalidad' },
    )
    setGuardando(false)
    if (e) return setError(traducirError(e))
    await onCambio()
    onAbrir(false)
  }

  async function alternarActivo() {
    if (!actual) return
    setGuardando(true)
    const { error: e } = await supabase.from('precios_profesional').update({ activo: !actual.activo }).eq('id', actual.id)
    setGuardando(false)
    if (e) return setError(traducirError(e))
    await onCambio()
  }

  async function quitar() {
    if (!actual || !window.confirm('¿Quitar este precio? Dejarás de recibir pedidos de este servicio con esta forma de cobro.')) return
    setGuardando(true)
    const { error: e } = await supabase.from('precios_profesional').delete().eq('id', actual.id)
    setGuardando(false)
    if (e) return setError(traducirError(e))
    await onCambio()
    onAbrir(false)
  }

  const sufijo = actual?.modalidad === 'fijo' && actual.unidad === 'unidad' ? ' por unidad' : ''

  return (
    <div className="yavi-tarjeta p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-base font-extrabold text-neutral-900">{ranura.servicio}</p>
          <p className="text-sm text-neutral-600">{ETIQUETA_MODALIDAD[ranura.modalidad]}</p>
        </div>
        <div className="shrink-0 text-right">
          {actual ? (
            <>
              <p className="text-lg font-extrabold text-neutral-900">
                {formatoSoles(actual.monto)}
                <span className="text-sm font-semibold text-neutral-600">{sufijo}</span>
              </p>
              <p className={`text-xs font-bold ${actual.activo ? 'text-emerald-700' : 'text-neutral-500'}`}>
                {actual.activo ? 'Activo' : 'Pausado'}
              </p>
            </>
          ) : (
            <p className="text-sm font-bold text-amber-700">Sin configurar</p>
          )}
        </div>
      </div>

      {!abierta && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => onAbrir(true)} className="rounded-2xl border-2 border-brand-600 bg-white px-4 py-2.5 text-sm font-bold text-brand-700">
            {actual ? 'Editar' : 'Configurar precio'}
          </button>
          {actual && (
            <button
              type="button"
              disabled={guardando}
              onClick={() => void alternarActivo()}
              className="rounded-2xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-bold text-navy-800 disabled:opacity-60"
            >
              {actual.activo ? 'Pausar' : 'Activar'}
            </button>
          )}
        </div>
      )}

      {abierta && (
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(ev) => {
            ev.preventDefault()
            void guardar()
          }}
        >
          <p className="text-sm leading-snug text-neutral-700">{AYUDA[ranura.modalidad]}</p>
          <label className="flex flex-col gap-1 text-sm font-semibold text-neutral-800">
            Precio (S/)
            <input
              inputMode="decimal"
              value={b.monto}
              onChange={(e) => setB({ ...b, monto: e.target.value })}
              placeholder="Ej. 40"
              className="input"
            />
          </label>
          {ranura.modalidad === 'fijo' && (
            <label className="flex flex-col gap-1 text-sm font-semibold text-neutral-800">
              Se cobra
              <select value={b.unidad} onChange={(e) => setB({ ...b, unidad: e.target.value as 'trabajo' | 'unidad' })} className="input">
                <option value="trabajo">Por el trabajo completo</option>
                <option value="unidad">Por unidad (punto, pieza, ventana…)</option>
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm font-semibold text-neutral-800">
            ¿Qué incluye tu trabajo?
            <textarea
              value={b.alcance}
              onChange={(e) => setB({ ...b, alcance: e.target.value })}
              maxLength={500}
              className="input min-h-20"
              placeholder="Ej. Cambio de tomacorriente o interruptor, con revisión del punto."
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-neutral-800">
            Incluye (una línea por ítem, opcional)
            <textarea value={b.incluye} onChange={(e) => setB({ ...b, incluye: e.target.value })} className="input min-h-16" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-neutral-800">
            No incluye (una línea por ítem, opcional)
            <textarea
              value={b.noIncluye}
              onChange={(e) => setB({ ...b, noIncluye: e.target.value })}
              className="input min-h-16"
              placeholder="Ej. Materiales, cableado nuevo"
            />
          </label>
          {error && (
            <p role="alert" className="yavi-aviso" data-tipo="error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Boton type="submit" disabled={guardando} className="flex-1 text-white">
              {guardando ? 'Guardando…' : 'Guardar precio'}
            </Boton>
            <button type="button" disabled={guardando} onClick={() => onAbrir(false)} className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-base font-bold text-navy-800">
              Cancelar
            </button>
          </div>
          {actual && (
            <button type="button" disabled={guardando} onClick={() => void quitar()} className="self-start text-sm font-bold text-red-700 underline">
              Quitar este precio
            </button>
          )}
        </form>
      )}
      {!abierta && error && (
        <p role="alert" className="yavi-aviso mt-2" data-tipo="error">
          {error}
        </p>
      )}
    </div>
  )
}
