import { buscarServicioPorNombre } from './catalogoServicios'
import { calcularComision } from './calculos'

/** Iniciales (máx. 2) para el avatar cuando no hay foto o no carga. */
export function iniciales(nombre: string | null | undefined): string {
  const palabras = (nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return '?'
  const primera = palabras[0][0]
  const segunda = palabras.length > 1 ? palabras[1][0] : ''
  return (primera + segunda).toLocaleUpperCase('es-PE')
}

/** Especialidad que se muestra en la tarjeta del perfil: el primer servicio y cuántos más ofrece. */
export function especialidad(servicios: string[]): string {
  if (servicios.length === 0) return 'Aún no elegiste servicios'
  if (servicios.length === 1) return servicios[0]
  const otros = servicios.length - 1
  return `${servicios[0]} y ${otros} ${otros === 1 ? 'servicio más' : 'servicios más'}`
}

/**
 * "Mi kit de limpieza" solo tiene sentido si ofrece algún servicio de limpieza por horas que
 * pida materiales (misma regla que usa el pedido del cliente: sección limpieza y `pideMateriales !== false`).
 */
export function ofreceKitDeLimpieza(servicios: string[]): boolean {
  return servicios.some((nombre) => {
    const s = buscarServicioPorNombre(nombre)
    return !!s && s.seccion === 'limpieza' && s.pideMateriales !== false
  })
}

export type VistaPanel = 'inicio' | 'servicios' | 'ganancias' | 'ajustes'

/** Rutas del panel del profesional; cada pestaña de la barra inferior es una de ellas. */
export const RUTAS_PANEL: Record<VistaPanel, string> = {
  inicio: '/panel',
  servicios: '/panel/servicios',
  ganancias: '/panel/ganancias',
  ajustes: '/panel/ajustes',
}

/** Vista que corresponde a una ruta; null si no es una ruta del panel (se redirige a Inicio). */
export function vistaDePanel(pathname: string): VistaPanel | null {
  const limpia = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  for (const vista of Object.keys(RUTAS_PANEL) as VistaPanel[]) {
    if (RUTAS_PANEL[vista] === limpia) return vista
  }
  return null
}

interface ReservaProxima {
  estado: string
  fecha: string
  hora: string
}

/** Trabajos ya contratados que siguen vigentes (no incluye pedidos sin respuesta ni terminados). */
export function esTrabajoVigente(estado: string): boolean {
  return estado === 'aceptada' || estado === 'en_camino' || estado === 'en_curso'
}

/** El trabajo vigente más cercano en el tiempo (fecha y hora), o null si no hay ninguno. */
export function proximoTrabajo<T extends ReservaProxima>(reservas: T[]): T | null {
  let mejor: T | null = null
  for (const r of reservas) {
    if (!esTrabajoVigente(r.estado)) continue
    if (!mejor || `${r.fecha} ${r.hora}` < `${mejor.fecha} ${mejor.hora}`) mejor = r
  }
  return mejor
}

/** Ganancia neta de una reserva completada; null si todavía no tiene total (no se cuenta como cero). */
export function netoDeReserva(r: { total: number | null; comision_pct: number; recargo_materiales: number }): number | null {
  if (r.total == null) return null
  return calcularComision(r.total - r.recargo_materiales, r.comision_pct, r.recargo_materiales).netoTrabajadora
}

/** Texto discreto de calificación: "4.8 ★ · 3 reseñas" o "Sin reseñas". */
export function resumenCalificacion(promedio: number, cantidad: number): string {
  if (cantidad <= 0) return 'Sin reseñas'
  return `${promedio.toFixed(1)} ★ · ${cantidad} ${cantidad === 1 ? 'reseña' : 'reseñas'}`
}
