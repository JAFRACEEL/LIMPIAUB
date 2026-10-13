/** Hora de Perú (UTC-5, sin horario de verano). Funciones puras para poder probarlas con una hora fija. */

const LIMA_OFFSET_MS = -5 * 3600_000

function partesLima(instante: Date) {
  const lima = new Date(instante.getTime() + LIMA_OFFSET_MS)
  const dos = (n: number) => String(n).padStart(2, '0')
  return {
    fecha: `${lima.getUTCFullYear()}-${dos(lima.getUTCMonth() + 1)}-${dos(lima.getUTCDate())}`,
    hora: `${dos(lima.getUTCHours())}:${dos(lima.getUTCMinutes())}`,
  }
}

/** Instante exacto de una fecha y hora escritas en hora de Lima. */
export function instanteLima(fecha: string, hora: string): Date {
  return new Date(`${fecha}T${hora.slice(0, 5)}:00-05:00`)
}

/** "Lo antes posible": ahora + margen, redondeado hacia arriba a 5 minutos. */
export function lomasPronto(ahora: Date, margenMin = 30): { fecha: string; hora: string } {
  const cincoMin = 5 * 60_000
  const redondeado = new Date(Math.ceil((ahora.getTime() + margenMin * 60_000) / cincoMin) * cincoMin)
  return partesLima(redondeado)
}

/** ¿La fecha/hora elegida está al menos `minMin` minutos en el futuro? */
export function esFuturo(fecha: string, hora: string, ahora: Date, minMin = 30): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}/.test(hora)) return false
  return instanteLima(fecha, hora).getTime() >= ahora.getTime() + minMin * 60_000
}

export function hoyLima(ahora: Date): string {
  return partesLima(ahora).fecha
}
