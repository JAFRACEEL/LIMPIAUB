// Service worker mínimo: deja instalar YAVI como app y sirve el shell desde
// caché cuando la conexión es mala (común en celulares de gama baja).
// Bump manual de CACHE cuando cambie algo importante del shell.
const CACHE = 'limpi-v2'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/brand/icon-192.png']

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

// Notificaciones push: el payload lo arma la Edge Function `send-push`
// como { titulo, cuerpo, url }.
self.addEventListener('push', (event) => {
  let datos = { titulo: 'YAVI', cuerpo: 'Tienes una novedad en YAVI.', url: '/' }
  try {
    if (event.data) datos = { ...datos, ...event.data.json() }
  } catch {
    // Payload no era JSON: nos quedamos con el texto por defecto.
  }
  event.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: '/brand/icon-192.png',
      badge: '/brand/favicon-64.png',
      vibrate: [200, 100, 200],
      data: { url: datos.url },
    }),
  )
})

// Al tocar la notificación: si ya hay una pestaña de YAVI abierta, la
// enfoca y navega ahí (evita abrir una pestaña nueva encima de otra); si no,
// abre una.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((listaClientes) => {
      for (const cliente of listaClientes) {
        if ('focus' in cliente) {
          cliente.postMessage({ tipo: 'limpi-navegar', url: destino })
          return cliente.focus()
        }
      }
      return self.clients.openWindow(destino)
    }),
  )
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
