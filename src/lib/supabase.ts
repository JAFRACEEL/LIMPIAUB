import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('xxxx')) {
  console.warn(
    'Limpi: faltan las variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en tu archivo .env. ' +
      'Copia los valores desde Supabase > Project Settings > API.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
