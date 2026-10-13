/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** '1' habilita precio fijo, diagnóstico y cotización (requiere el panel de propuestas del profesional). */
  readonly VITE_PROPUESTAS_ACTIVAS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
