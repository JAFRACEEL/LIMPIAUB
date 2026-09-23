// Service worker mínimo: deja instalar Limpi como app y sirve el shell desde
// caché cuando la conexión es mala (común en celulares de gama baja).
// Bump manual de CACHE cuando cambie algo importante del shell.
const CACHE = 'limpi-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Nunca interceptar Supabase (auth, datos, realtime) ni métodos que no
  // sean GET: ese tráfico siempre debe ir a la red.
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  // Es una SPA: una ruta como /panel o /reservas nunca se cacheó tal cual
  // (el ruteo es del lado del cliente). Si la red falla al navegar a
  // cualquier ruta, servimos el shell (index.html) en vez de intentar
  // cachear esa URL exacta, que solo existiría offline si ya la habían
  // visitado antes.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')))
    return
  }

  event.respondWith(
    caches.match(request).then((cacheada) => {
      const enRed = fetch(request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copia))
          }
          return respuesta
        })
        .catch(() => cacheada)
      return cacheada || enRed
    }),
  )
})
