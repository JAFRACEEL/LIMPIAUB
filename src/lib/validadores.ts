export function esDniValido(dni: string): boolean {
  return /^\d{8}$/.test(dni.trim())
}

export function esCelularValido(celular: string): boolean {
  return /^9\d{8}$/.test(celular.trim())
}

export function esTarifaValida(tarifa: number): boolean {
  return Number.isFinite(tarifa) && tarifa >= 5 && tarifa <= 100
}

export function esNumeroDocumentoValido(tipoDocumento: string, numero: string): boolean {
  if (tipoDocumento === 'dni') return esDniValido(numero)
  return numero.trim().length >= 5
}

export function sonZonasValidas(zonas: string[], maximo: number): boolean {
  return zonas.length >= 1 && zonas.length <= maximo
}

export function esFechaFuturaValida(fecha: string): boolean {
  if (!fecha) return false
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const valor = new Date(`${fecha}T00:00:00`)
  return !Number.isNaN(valor.getTime()) && valor > hoy
}
