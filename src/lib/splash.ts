// Pantalla de inicio de YAVI (vive en index.html). Se oculta cuando la app ya sabe quién es la persona
// y la animación tuvo tiempo de verse completa.
const MIN_MS = 3800
const MIN_MS_MOVIMIENTO_REDUCIDO = 500

export function ocultarSplash() {
  const el = document.getElementById('yavi-splash')
  if (!el) return
  const reducido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  // performance.now() cuenta desde que empezó a cargar la página: el mínimo no se suma a la carga.
  const espera = Math.max(0, (reducido ? MIN_MS_MOVIMIENTO_REDUCIDO : MIN_MS) - performance.now())
  window.setTimeout(() => {
    el.classList.add('salir')
    window.setTimeout(() => el.remove(), 450)
  }, espera)
}
