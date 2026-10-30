import { buscarServicioPorNombre } from './catalogoServicios'

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
