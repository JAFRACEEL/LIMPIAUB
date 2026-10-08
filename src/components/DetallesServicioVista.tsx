import type { DetallesServicio } from '../lib/preguntasServicio'

/**
 * Muestra las respuestas del cliente a las preguntas propias del servicio y
 * los botones para abrir cada foto. `claro` es para fondos oscuros (overlay).
 */
export function DetallesServicioVista({
  detalles,
  fotoLegado,
  onVerFoto,
  claro = false,
}: {
  detalles: DetallesServicio | null
  /** foto_referencia_ruta de reservas antiguas, sin lista de fotos. */
  fotoLegado?: string | null
  onVerFoto: (ruta: string | null) => void
  claro?: boolean
}) {
  const fotos = detalles?.fotos?.length ? detalles.fotos : fotoLegado ? [fotoLegado] : []
  const respuestas = [...(detalles?.respuestas ?? []), ...(detalles?.privado ?? [])]
  if (respuestas.length === 0 && fotos.length === 0) return null

  const textoSecundario = claro ? 'text-teal-100' : 'text-neutral-500'
  const textoValor = claro ? 'text-white' : 'text-neutral-700'
  const enlace = claro ? 'text-white' : 'text-teal-700'

  return (
    <div className="mt-1 text-sm">
      {respuestas.length > 0 && (
        <ul className="flex flex-col gap-1">
          {respuestas.map((r) => (
            <li key={r.etiqueta}>
              <span className={`block text-xs ${textoSecundario}`}>{r.etiqueta}</span>
              <span className={textoValor}>{r.valor}</span>
            </li>
          ))}
        </ul>
      )}
      {fotos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {fotos.map((ruta, i) => (
            <button
              key={ruta}
              type="button"
              onClick={() => onVerFoto(ruta)}
              className={`text-xs font-medium underline ${enlace}`}
            >
              {fotos.length === 1 ? 'Ver foto de referencia' : `Ver foto ${i + 1}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
