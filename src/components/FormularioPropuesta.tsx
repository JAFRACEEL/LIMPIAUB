import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'
import { formatoSoles } from '../lib/precios'
import { lineasDeTexto, montoDeTexto, totalPropuesta, validarPropuesta, type BorradorPropuesta } from '../lib/preciosProfesional'
import { Boton } from './ui'

const VACIO: BorradorPropuesta = { manoObra: '', materiales: '', movilidad: '', otros: '', alcance: '', incluye: '', noIncluye: '' }

/** Propuesta de precio del profesional para un pedido en cotización al que ya se postuló. */
export function FormularioPropuesta({ reservaId }: { reservaId: string }) {
  const [enviada, setEnviada] = useState<number | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [b, setB] = useState<BorradorPropuesta>(VACIO)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Si ya envió una propuesta vigente, se muestra su total en vez del formulario vacío.
  useEffect(() => {
    let vivo = true
    void supabase
      .from('propuestas')
      .select('total_propuesta')
      .eq('reserva_id', reservaId)
      .eq('tipo', 'servicio')
      .eq('estado', 'ofrecida')
      .maybeSingle()
      .then(({ data }) => {
        if (vivo && data) setEnviada(Number(data.total_propuesta))
      })
    return () => {
      vivo = false
    }
  }, [reservaId])

  async function enviar() {
    const problema = validarPropuesta(b)
    if (problema) return setError(problema)
    setEnviando(true)
    setError(null)
    const { error: e } = await supabase.rpc('enviar_propuesta', {
      p_reserva_id: reservaId,
      p_tipo: 'servicio',
      p_mano_obra: montoDeTexto(b.manoObra),
      p_materiales: b.materiales.trim() ? montoDeTexto(b.materiales) : 0,
      p_movilidad: b.movilidad.trim() ? montoDeTexto(b.movilidad) : 0,
      p_otros: b.otros.trim() ? montoDeTexto(b.otros) : 0,
      p_alcance: b.alcance.trim(),
      p_incluye: lineasDeTexto(b.incluye),
      p_no_incluye: lineasDeTexto(b.noIncluye),
      p_condiciones: [],
      p_validez_horas: 48,
    })
    setEnviando(false)
    if (e) return setError(traducirError(e))
    setEnviada(totalPropuesta(b))
    setAbierto(false)
  }

  if (enviada != null && !abierto) {
    return (
      <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <p className="font-bold">Propuesta enviada: {formatoSoles(enviada)}</p>
        <p>El cliente la verá y elegirá. Puedes enviar una nueva versión si cambias de idea.</p>
        <button type="button" onClick={() => setAbierto(true)} className="mt-1 font-bold underline">
          Cambiar mi propuesta
        </button>
      </div>
    )
  }

  if (!abierto) {
    return (
      <Boton type="button" onClick={() => setAbierto(true)} className="mt-2 text-white">
        Enviar mi propuesta
      </Boton>
    )
  }

  const campo = (clave: 'manoObra' | 'materiales' | 'movilidad' | 'otros', etiqueta: string, ayuda?: string) => (
    <label className="flex flex-col gap-1 text-sm font-semibold text-neutral-800">
      {etiqueta}
      <input
        inputMode="decimal"
        value={b[clave]}
        onChange={(ev) => setB({ ...b, [clave]: ev.target.value })}
        placeholder={ayuda ?? '0'}
        className="input"
      />
    </label>
  )

  return (
    <form
      className="mt-2 flex flex-col gap-3"
      onSubmit={(ev) => {
        ev.preventDefault()
        void enviar()
      }}
    >
      {campo('manoObra', 'Mano de obra (S/)', 'Lo que cobras por trabajar')}
      {campo('materiales', 'Materiales (S/, opcional)')}
      {campo('movilidad', 'Movilidad (S/, opcional)')}
      {campo('otros', 'Otros (S/, opcional)')}
      <label className="flex flex-col gap-1 text-sm font-semibold text-neutral-800">
        ¿Qué vas a hacer?
        <textarea value={b.alcance} onChange={(ev) => setB({ ...b, alcance: ev.target.value })} maxLength={500} className="input min-h-20" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-neutral-800">
        Incluye (una línea por ítem, opcional)
        <textarea value={b.incluye} onChange={(ev) => setB({ ...b, incluye: ev.target.value })} className="input min-h-16" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-neutral-800">
        No incluye (una línea por ítem, opcional)
        <textarea value={b.noIncluye} onChange={(ev) => setB({ ...b, noIncluye: ev.target.value })} className="input min-h-16" />
      </label>
      <p className="text-sm font-bold text-neutral-900">Total para el cliente: {formatoSoles(totalPropuesta(b))}</p>
      {error && (
        <p role="alert" className="yavi-aviso" data-tipo="error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Boton type="submit" disabled={enviando} className="flex-1 text-white">
          {enviando ? 'Enviando…' : 'Enviar propuesta'}
        </Boton>
        <button
          type="button"
          disabled={enviando}
          onClick={() => setAbierto(false)}
          className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-base font-bold text-navy-800"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
