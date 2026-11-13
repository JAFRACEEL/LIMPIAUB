import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Un mismo repo, tres apps: `vite build` = cliente, `--mode profesional`, `--mode admin`.
// __APP__ se reemplaza al compilar, así el código de las otras apps no entra al bundle.
type TipoApp = 'cliente' | 'profesional' | 'admin'

const MARCAS: Record<TipoApp, { nombre: string; corto: string; titulo: string; color: string }> = {
  cliente: { nombre: 'YAVI', corto: 'YAVI', titulo: 'YAVI — Servicios a tu alcance', color: '#ff7414' },
  profesional: { nombre: 'YAVI Profesional', corto: 'YAVI Pro', titulo: 'YAVI Profesional — Trabaja con YAVI', color: '#ff7414' },
  admin: { nombre: 'YAVI Admin', corto: 'YAVI Admin', titulo: 'YAVI Admin', color: '#1e293b' },
}

function htmlPorApp(app: TipoApp): Plugin {
  const m = MARCAS[app]
  return {
    name: 'yavi-html-por-app',
    transformIndexHtml(html) {
      return html
        .replace('%APP_MANIFEST%', `/manifest-${app}.webmanifest`)
        .replace('%APP_TITULO%', m.titulo)
        .replace('%APP_CORTO%', m.corto)
        .replace('%APP_COLOR%', m.color)
        .replace('%APP_COLOR%', m.color)
    },
  }
}

export default defineConfig(({ mode }) => {
  const app: TipoApp = mode === 'profesional' || mode === 'admin' ? mode : 'cliente'
  return {
    plugins: [react(), tailwindcss(), htmlPorApp(app)],
    define: { __APP__: JSON.stringify(app) },
    build: { outDir: app === 'cliente' ? 'dist' : `dist-${app}` },
    server: { host: true },
  }
})
