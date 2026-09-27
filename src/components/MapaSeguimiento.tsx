import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Iconos como emoji en un divIcon: evita el problema clásico de Leaflet +
// bundlers donde las imágenes por defecto del marcador (marker-icon.png)
// no se resuelven con la ruta correcta y el pin sale roto.
function iconoEmoji(emoji: string, tamano: number) {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:${tamano}px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">${emoji}</div>`,
    iconSize: [tamano, tamano],
    iconAnchor: [tamano / 2, tamano / 2],
  })
}

export default function MapaSeguimiento({ lat, lng, nombre }: { lat: number; lng: number; nombre: string }) {
  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<L.Map | null>(null)
  const marcadorTrabajadoraRef = useRef<L.Marker | null>(null)
  const marcadorClienteRef = useRef<L.Marker | null>(null)

  // Crea el mapa una sola vez.
  useEffect(() => {
    if (!contenedorRef.current) return
    const mapa = L.map(contenedorRef.current, { attributionControl: false }).setView([lat, lng], 15)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
    }).addTo(mapa)
    L.control.attribution({ prefix: false }).addTo(mapa).addAttribution('© OpenStreetMap')
    mapaRef.current = mapa

    // bindPopup interpreta un string como HTML: si le pasáramos el nombre
    // directo (`${nombre} va en camino`), un nombre de trabajadora con HTML
    // (p. ej. un <img onerror=...>) se ejecutaría en el navegador de la
    // clienta. Se arma como nodo de texto para que se muestre literal.
    const popup = document.createElement('span')
    popup.textContent = `${nombre} va en camino`
    marcadorTrabajadoraRef.current = L.marker([lat, lng], { icon: iconoEmoji('🧹', 30) })
      .addTo(mapa)
      .bindPopup(popup)

    // Mejor esfuerzo: si el navegador del cliente da permiso, mostramos
    // también su propia ubicación para que el mapa se sienta como el de un
    // taxi (las dos partes en el mismo mapa). Si no hay permiso, el mapa
    // igual funciona mostrando solo a la trabajadora.
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (posicion) => {
          if (!mapaRef.current || !marcadorTrabajadoraRef.current) return
          marcadorClienteRef.current = L.marker([posicion.coords.latitude, posicion.coords.longitude], {
            icon: iconoEmoji('📍', 26),
          })
            .addTo(mapaRef.current)
            .bindPopup('Tú estás aquí')
          const grupo = L.featureGroup([marcadorTrabajadoraRef.current, marcadorClienteRef.current])
          mapaRef.current.fitBounds(grupo.getBounds().pad(0.35))
        },
        () => {
          // Sin permiso o sin señal: el mapa sigue mostrando a la trabajadora igual.
        },
        { enableHighAccuracy: false, timeout: 8000 },
      )
    }

    return () => {
      mapa.remove()
      mapaRef.current = null
    }
    // Solo se crea una vez; las actualizaciones de posición las maneja el
    // otro efecto moviendo el marcador ya existente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mueve el marcador (sin recrear el mapa) cada vez que llega una posición nueva.
  useEffect(() => {
    if (!marcadorTrabajadoraRef.current) return
    marcadorTrabajadoraRef.current.setLatLng([lat, lng])
    if (!marcadorClienteRef.current) {
      mapaRef.current?.panTo([lat, lng])
    }
  }, [lat, lng])

  // isolate: los panes/controles internos de Leaflet usan z-index hasta
  // 1000. Sin un contexto de apilamiento propio, se dibujarían por encima
  // de la barra de navegación fija y los toasts de la página.
  return <div ref={contenedorRef} className="isolate h-56 w-full overflow-hidden rounded-xl" />
}
