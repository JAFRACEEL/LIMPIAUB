import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { traducirError } from '../lib/errores'

export function FormularioCalificacion({
  reservaId,
  paraId,
  deId,
  onCalificado,
}: {
  reservaId: string
  paraId: string
  deId: string
  onCalificado: () => void
}) {
  const [estrellas, setEstrellas] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    if (estrellas < 1) {
      setError('Elige de 1 a 5 estrellas.')
      return
    }
    setEnviando(true)
    setError(null)
    const { error: errorInsert } = await supabase.from('calificaciones').insert({
      reserva_id: reservaId,
      de_id: deId,
      para_id: paraId,
      estrellas,
      comentario: comentario.trim() || null,
    })
    if (errorInsert) {
      setError(traducirError(errorInsert))
      setEnviando(false)
      return
    }
    setEnviando(false)
    onCalificado()
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="mb-2 text-sm font-medium">Califica este servicio</p>
      <div className="mb-2 flex gap-1 text-2xl text-amber-500">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setEstrellas(n)}
            aria-label={`${n} estrellas`}
            className="leading-none"
          >
            {n <= estrellas ? '★' : '☆'}
          </button>
        ))}
      </div>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        className="input min-h-16"
        placeholder="Comentario (opcional)"
      />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <button
        type="button"
        disabled={enviando}
        onClick={enviar}
        className="mt-2 w-full rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {enviando ? 'Enviando…' : 'Enviar calificación'}
      </button>
    </div>
  )
}
