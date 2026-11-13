/** Ruta interna a la que volver después de iniciar sesión; ignora cualquier cosa que no sea una ruta propia. */
export function volverSeguro(valor: string | null): string | null {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//') || valor.includes('\\')) return null
  return valor
}
