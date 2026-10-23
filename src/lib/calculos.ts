export function calcularTotal(tarifaHora: number, horas: number, recargoMateriales: number): number {
  return tarifaHora * horas + recargoMateriales
}

export function calcularComision(subtotalServicio: number, comisionPct: number, recargoMateriales: number) {
  // Del recargo por materiales (S/18 cuando la trabajadora trae su kit),
  // S/13 son fijos para ella y S/5 fijos para YAVI: la comisión por
  // porcentaje solo aplica sobre el servicio (tarifa × horas), no sobre ese
  // recargo.
  const comisionServicio = (subtotalServicio * comisionPct) / 100
  const comisionMateriales = recargoMateriales > 0 ? 5 : 0
  const netoMateriales = recargoMateriales > 0 ? 13 : 0
  return {
    comisionLimpi: comisionServicio + comisionMateriales,
    netoTrabajadora: subtotalServicio - comisionServicio + netoMateriales,
  }
}

export function seSolapan(
  fecha1: string,
  hora1: string,
  horas1: number,
  fecha2: string,
  hora2: string,
  horas2: number,
  margenTrasladoMinutos = 0,
): boolean {
  const margenMs = margenTrasladoMinutos * 60_000
  const inicio1 = new Date(`${fecha1}T${hora1}`).getTime() - margenMs
  const fin1 = new Date(`${fecha1}T${hora1}`).getTime() + horas1 * 3600_000 + margenMs
  const inicio2 = new Date(`${fecha2}T${hora2}`).getTime()
  const fin2 = inicio2 + horas2 * 3600_000
  return inicio1 < fin2 && inicio2 < fin1
}
