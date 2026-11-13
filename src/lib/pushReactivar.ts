// Reactivación de avisos push tras separar las apps (migración 0017). Lógica pura (sin red) para poder probarla.
//
// Las suscripciones anteriores a la 0017 tienen app = NULL y el envío ya no les manda nada. Para que esas personas no pierdan los
// avisos sin enterarse, la app les ofrece reactivarlos UNA vez. No se marca nada en la base: al reactivar, la suscripción de esta
// app se guarda con su `app` y las viejas de ese mismo dispositivo se eliminan.

export interface FilaSuscripcion {
  id: string
  user_id: string
  endpoint: string
  app: string | null
  user_agent: string | null
}

/**
 * ¿Mostrar el aviso de reactivación? Solo si la persona tuvo avisos activados antes (alguna suscripción sin app), todavía no tiene
 * una de esta app y no decidió ya (activar o "Ahora no"). Quien nunca activó nada no ve este aviso.
 */
export function debeOfrecerReactivacion(subs: Pick<FilaSuscripcion, 'app'>[], app: string, yaDecidido: boolean): boolean {
  if (yaDecidido) return false
  if (subs.some((s) => s.app === app)) return false
  return subs.some((s) => s.app == null)
}

/**
 * Suscripciones viejas que se pueden borrar al reactivar. Deben cumplir TODO: ser de esta misma persona, tener app vacía (NULL),
 * ser del mismo navegador (user agent) y tener otro endpoint (el mismo endpoint ya se actualiza en su sitio al guardar la nueva).
 * Una fila que ya tiene app NUNCA se borra, aunque coincida el user agent (p. ej. dos equipos iguales de la misma persona).
 */
export function idsViejosDelMismoDispositivo(subs: FilaSuscripcion[], userId: string, endpointActual: string, userAgent: string): string[] {
  return subs
    .filter((s) => s.user_id === userId && s.app == null && s.endpoint !== endpointActual && !!s.user_agent && s.user_agent === userAgent)
    .map((s) => s.id)
}
