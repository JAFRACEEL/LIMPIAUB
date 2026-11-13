// Compila la app que corresponde a ESTE proyecto de Vercel y la deja en `dist` (la carpeta que Vercel publica).
// Cada proyecto de Vercel define la variable YAVI_APP: cliente (por defecto), profesional o admin.
// Así un solo repo y un solo vercel.json sirven a los tres proyectos, sin copias ni ajustes a mano en el panel.
import { spawnSync } from 'node:child_process'
import { cpSync, rmSync } from 'node:fs'

const app = process.env.YAVI_APP || 'cliente'
if (!['cliente', 'profesional', 'admin'].includes(app)) {
  console.error(`YAVI_APP debe ser cliente, profesional o admin (llegó "${app}").`)
  process.exit(1)
}

function ejecutar(comando, args) {
  const r = spawnSync(comando, args, { stdio: 'inherit', shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log(`Compilando la app "${app}"…`)
ejecutar('npx', ['tsc', '-b'])
ejecutar('npx', ['vite', 'build', ...(app === 'cliente' ? [] : ['--mode', app])])
if (app !== 'cliente') {
  rmSync('dist', { recursive: true, force: true })
  cpSync(`dist-${app}`, 'dist', { recursive: true })
}
