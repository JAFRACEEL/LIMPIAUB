// Aviso visible solo en las vistas previas de pruebas (se compila con VITE_ENTORNO_PRUEBAS=si).
// En el build normal no se muestra nada.
export const ES_ENTORNO_PRUEBAS = import.meta.env.VITE_ENTORNO_PRUEBAS === 'si'

export default function AvisoEntornoPruebas() {
  if (!ES_ENTORNO_PRUEBAS) return null
  return (
    <>
      <div role="status" className="bg-amber-400 px-4 py-1.5 text-center text-xs font-bold tracking-wide text-black">
        ENTORNO DE PRUEBAS · datos ficticios · no se cobra ni se atiende ningún pedido
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-2 top-2 z-[60] rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-black shadow"
      >
        PRUEBAS
      </div>
    </>
  )
}
