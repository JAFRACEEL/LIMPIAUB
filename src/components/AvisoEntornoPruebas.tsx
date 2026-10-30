// Aviso visible solo en las vistas previas de pruebas (se compila con VITE_ENTORNO_PRUEBAS=si).
// En el build normal no se muestra nada.
export const ES_ENTORNO_PRUEBAS = import.meta.env.VITE_ENTORNO_PRUEBAS === 'si'

/** Alto fijo de la franja (h-8): la barra superior se pega justo debajo (ver Navbar). */
export const CLASE_ALTO_AVISO = 'top-8'

export default function AvisoEntornoPruebas() {
  if (!ES_ENTORNO_PRUEBAS) return null
  return (
    <div
      role="status"
      className="sticky top-0 z-[60] flex h-8 items-center justify-center bg-amber-400 px-3 text-center text-xs font-bold tracking-wide text-black"
    >
      <span className="truncate">
        ENTORNO DE PRUEBAS · Datos ficticios
        <span className="sr-only"> · no se cobra ni se atiende ningún pedido</span>
      </span>
    </div>
  )
}
