# YAVI — arranque

**YAVI — «Servicios a tu alcance»** conecta clientes con personas que ofrecen servicios del hogar en Iquitos (limpieza, gasfitería, electricidad, pintura y más). La app se llamó «Limpi» al inicio: por eso algunos identificadores internos conservan ese nombre (paquete `limpi`, caché `limpi-v2` del service worker, claves de almacenamiento `limpi.*` y `limpi_*`, tablas y funciones de Supabase). No se renombran para no romper instalaciones ni datos. Identidad y sistema de diseño: [docs/diseno-yavi.md](docs/diseno-yavi.md).

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
   app esté cerrada (en iPhone, solo si instalaste YAVI en la pantalla de
   inicio).

## Marca e íconos de la app

- Archivos oficiales (no se modifican): `brand/originales/yavi-logo-original.jpg` y `yavi-icono-original.jpg`.
- Copias de trabajo que sirve la web: `public/brand/`. Los íconos `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` y `favicon-64.png` son solo reescalados del ícono oficial.
- Nombre y colores de la app instalada: `public/manifest.webmanifest` y `index.html`.

### Actualizar una instalación existente

El service worker (`public/sw.js`) cambió de caché (`limpi-v1` → `limpi-v2`) y, al activarse, borra solo los cachés anteriores del shell. No toca la sesión, los borradores ni los datos de la persona (la sesión de Supabase vive en `localStorage`, el borrador del pedido en `sessionStorage` y lo demás en Supabase). En el navegador, la nueva marca aparece al abrir la app dos veces. **En el iPhone, el nombre y el ícono de una app ya agregada a la pantalla de inicio los fija iOS al instalarla**: para ver «YAVI» y el nuevo ícono hay que quitar el acceso directo y volver a agregarlo (Compartir > Agregar a pantalla de inicio). La sesión sigue abierta si se vuelve a entrar desde el mismo navegador.

## Vista previa de pruebas (datos ficticios)

`scripts/preview-yavi.ps1` compila con las variables de `.env.test.local` (proyecto de pruebas LIMPIA, nunca producción) y deja listo el despliegue de vista previa. Por defecto **solo compila y muestra el comando**; para publicar hay que pasar `-Publicar` (es una vista previa, nunca `--prod`). Detalles en [docs/diseno-yavi.md](docs/diseno-yavi.md#vista-previa-para-el-iphone).
