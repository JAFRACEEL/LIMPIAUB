# Limpi — arranque

1. Crear proyecto en https://supabase.com (gratis). Región: South America (São Paulo).
2. SQL Editor > pegar supabase/schema.sql > Run.
3. Storage > New bucket "fotos" > Public.
4. Project Settings > API: copiar Project URL y anon key.
5. Crear archivo .env en esta carpeta:
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
6. Abrir terminal en esta carpeta y correr: claude
7. Pegar el contenido de PRIMER-PROMPT.txt.
