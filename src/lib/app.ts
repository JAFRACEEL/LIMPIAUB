// Qué app es este build: 'cliente' (YAVI), 'profesional' (YAVI Profesional) o 'admin'.
// __APP__ lo fija vite.config.ts al compilar (vite build [--mode profesional|admin]).
export type TipoApp = 'cliente' | 'profesional' | 'admin'

export const APP: TipoApp = __APP__

export const NOMBRE_APP: Record<TipoApp, string> = {
  cliente: 'YAVI',
  profesional: 'YAVI Profesional',
  admin: 'YAVI Admin',
}

/** Pantalla principal de cada app (a donde se llega tras entrar o activar notificaciones). */
export const INICIO_APP: Record<TipoApp, string> = {
  cliente: '/',
  profesional: '/panel',
  admin: '/admin',
}
