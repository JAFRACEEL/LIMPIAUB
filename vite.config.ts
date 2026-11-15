import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Un mismo repo, tres apps: `vite build` = cliente, `--mode profesional`, `--mode admin`.
// __APP__ se reemplaza al compilar, así el código de las otras apps no entra al bundle.
type TipoApp = 'cliente' | 'profesional' | 'admin'

const MARCAS: Record<TipoApp, { nombre: string; corto: string; titulo: string; color: string }> = {
  cliente: { nombre: 'YAVI', corto: 'YAVI', titulo: 'YAVI — Servicios a tu alcance', color: '#ff7414' },
  profesional: { nombre: 'YAVI Profesional', corto: 'YAVI Pro', titulo: 'YAVI Profesional — Trabaja con YAVI', color: '#0f766e' },
  admin: { nombre: 'YAVI Admin', corto: 'YAVI Admin', titulo: 'YAVI Admin', color: '#5b21b6' },
}

function htmlPorApp(app: TipoApp): Plugin {
  const m = MARCAS[app]
  return {
    name: 'yavi-html-por-app',
    transformIndexHtml(html) {
      return html
        .replaceAll('%APP_BRAND%', app === 'cliente' ? '/brand' : `/brand/${app}`)
        .replace('%APP_ID%', app)
        .replace('%APP_MANIFEST%', `/manifest-${app}.webmanifest`)
        .replace('%APP_TITULO%', m.titulo)
        .replace('%APP_CORTO%', m.corto)
        .replace('%APP_COLOR%', m.color)
        .replace('%APP_COLOR%', m.color)
    },
  }
}

// Variables obligatorias al COMPILAR. Se leen en el build (quedan dentro del bundle): si falta una, la app saldría rota sin avisar
// (p. ej. sin la clave pública de push, "Activar notificaciones" queda deshabilitado). Es mejor que el build falle y lo diga.
const VARIABLES_OBLIGATORIAS: Record<string, string> = {
  VITE_SUPABASE_URL: 'dirección del proyecto de Supabase',
  VITE_SUPABASE_ANON_KEY: 'clave pública (anon) de Supabase',
  VITE_VAPID_PUBLIC_KEY: 'clave pública de las notificaciones push',
}

function exigirVariables(env: Record<string, string>, mode: string) {
  const faltan = Object.keys(VARIABLES_OBLIGATORIAS).filter((k) => !env[k]?.trim())
  if (faltan.length === 0) return
  const detalle = faltan.map((k) => `  - ${k}: ${VARIABLES_OBLIGATORIAS[k]}`).join('\n')
  throw new Error(
    `\n\nFALTAN VARIABLES VITE_ PARA COMPILAR (modo "${mode}"):\n${detalle}\n\n` +
      'Defínelas en el archivo .env (local) o como variables del proyecto en Vercel (Production y Preview) y vuelve a compilar.\n',
  )
}

export default defineConfig(({ mode, command }) => {
  if (command === 'build') exigirVariables(loadEnv(mode, '.', 'VITE_'), mode)
  const app: TipoApp = mode === 'profesional' || mode === 'admin' ? mode : 'cliente'
  return {
    plugins: [react(), tailwindcss(), htmlPorApp(app)],
    define: { __APP__: JSON.stringify(app) },
    build: { outDir: app === 'cliente' ? 'dist' : `dist-${app}` },
    server: { host: true },
  }
})
