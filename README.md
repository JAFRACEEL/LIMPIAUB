# Limpi — arranque

1. Crear proyecto en https://supabase.com (gratis). Región: South America (São Paulo).
2. SQL Editor > pegar supabase/schema.sql > Run.
3. Storage > New bucket "fotos" > Public.
4. Project Settings > API: copiar Project URL y anon key.
5. Crear archivo .env en esta carpeta:
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   VITE_VAPID_PUBLIC_KEY=... (ver sección "Notificaciones push" abajo)
6. Abrir terminal en esta carpeta y correr: claude
7. Pegar el contenido de PRIMER-PROMPT.txt.

## Notificaciones push (Web Push / VAPID)

Para que las trabajadoras y clientas reciban avisos aunque tengan la app
cerrada. Todas las migraciones (`supabase/migrations/*.sql`, incluida
`0013_notificaciones_push.sql`) ya deben estar corridas antes de este paso.

1. **Llaves VAPID**: ya vienen generadas (una vez) y puestas en `.env` como
   `VITE_VAPID_PUBLIC_KEY`. Si necesitas generar un par nuevo:
   ```js
   node -e "
   const { generateKeyPairSync } = require('crypto');
   const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
   const pubJwk = publicKey.export({ format: 'jwk' });
   const privJwk = privateKey.export({ format: 'jwk' });
   const pub = Buffer.concat([Buffer.from([4]), Buffer.from(pubJwk.x, 'base64url'), Buffer.from(pubJwk.y, 'base64url')]).toString('base64url');
   console.log('VITE_VAPID_PUBLIC_KEY=' + pub);
   console.log('VAPID_PRIVATE_KEY=' + privJwk.d);
   "
   ```
2. **Desplegar la Edge Function** (requiere el Supabase CLI instalado y
   `supabase login` / `supabase link` ya hechos):
   ```
   supabase functions deploy send-push --no-verify-jwt
   ```
   `--no-verify-jwt` es necesario: `fn_enviar_push` llama a la función con un
   secreto propio (`x-push-secret`), no con un JWT de Supabase, así que con
   la verificación por defecto Supabase rechazaría cada llamada del trigger
   antes de que llegue al código y ningún push se enviaría.
3. **Secrets de la función** (Project Settings > Edge Functions > Secrets, o
   por CLI):
   ```
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:soporte@limpi.pe PUSH_TRIGGER_SECRET=...
   ```
   `PUSH_TRIGGER_SECRET` es un valor cualquiera que tú inventes (ej. una
   cadena aleatoria larga) — solo tiene que coincidir con el que pongas en el
   paso 4.
4. **Conectar Postgres con la función**: en el SQL Editor de Supabase,
   ```sql
   update app_config set
     push_function_url = 'https://<tu-project-ref>.supabase.co/functions/v1/send-push',
     push_function_secret = '<el mismo PUSH_TRIGGER_SECRET del paso 3>';
   ```
   Mientras `push_function_url` esté vacío, el resto de la app funciona
   normal — simplemente no se envía ningún push.
5. Prueba: entra como trabajadora, activa las notificaciones cuando la app lo
   pida (o desde el ícono 🔔 en la barra), y pide que alguien te mande un
   pedido directo. Debería sonar/vibrar y llegar la notificación aunque la
   app esté cerrada (en iPhone, solo si instalaste Limpi en la pantalla de
   inicio).
