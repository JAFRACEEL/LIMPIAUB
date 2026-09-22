export function esDniValido(dni: string): boolean {
  return /^\d{8}$/.test(dni.trim())
}

export function esCelularValido(celular: string): boolean {
  return /^9\d{8}$/.test(celular.trim())
}

export function esTarifaValida(tarifa: number): boolean {
  return Number.isFinite(tarifa) && tarifa >= 5 && tarifa <= 100
}
