# Pruebas de integración real (migración 0015)

## Estado
**Pendiente de ejecutar.** En la máquina de desarrollo la CLI de Supabase está instalada (2.117.0), pero no hay Docker, no hay ninguna distribución de WSL y la virtualización está desactivada en el firmware. La organización de Supabase está en el plan gratuito (sin ramas de base de datos) y el único proyecto de Limpi es el de producción (`LIMPIA`), que no se usa para pruebas y no se ha pausado ni modificado.
Hasta que `supabase/tests/integracion-real.mjs` pase, el cierre definitivo de la experiencia del cliente sigue abierto.

## Qué se verificó y qué no
| Capa | Qué se comprueba | Cómo | Estado |
|---|---|---|---|
| Reglas de la base: triggers, funciones, RLS, permisos, flujos de contratación y pago, reservas antiguas y nuevas | contratación, pagos, modalidades, propiedad de propuestas, columnas protegidas, hora validada, `fn_enviar_push` | `node supabase/tests/migracion-0015.mjs` (PGlite) | **Verificado: 182 de 182** |
| Cadena de migraciones en el orden que usará la CLI | `schema.sql` + 0001–0014 (con datos antiguos de todos los estados) + 0015; las columnas originales de las reservas antiguas no cambian; sin estructuras duplicadas; cada archivo se puede aplicar dos veces seguidas | `node supabase/tests/cadena.mjs` (PGlite, tras `entorno-local.ps1 -SoloPreparar`) | **Verificado: 30 de 30** |
| Edge Function `send-push` aislada: autorización, entradas inválidas, suscripciones vencidas, errores del proveedor | el código real de la función con la librería `web-push` real contra un servicio push **simulado** local | `node supabase/tests/send-push.mjs` | **Verificado: 49 de 49** |
| Postgres real (no PGlite), API real: sesiones (JWT de GoTrue), permisos de PostgREST, RLS vía API, `pg_net` | los mismos flujos por la API de Supabase | `integracion-real.mjs` | **No ejecutado** |
| Trigger → `pg_net` → HTTP | que los avisos llegan como llamada HTTP con el secreto compartido | `integracion-real.mjs` con `TEST_PUSH_CAPTURE_HOST` | **No ejecutado** |
| Función `send-push` desplegada en Supabase (Deno, imports `npm:`, variables, límites de tiempo) | que la versión desplegada responde igual | `supabase functions serve` / despliegue | **No ejecutado; la versión desplegada sigue siendo la anterior** |
| Aceptación de las claves VAPID por Google/Apple/Mozilla y **entrega real** a un navegador o celular | que a la persona le aparece el aviso | manual, en un dispositivo | **No verificado nunca** |

Las pruebas en PGlite y la de `send-push` son comprobaciones de lógica con simulaciones; **no sustituyen** a la integración real. En particular, el servicio push de `send-push.mjs` es un servidor local que imita las respuestas de un proveedor (201, 404, 410, 429, 5xx…): demuestra que la función reacciona bien a ellas, no que un proveedor real las produzca igual ni que acepte nuestras claves.

## Lo que `send-push.mjs` cubre
- **Autorización**: método distinto de POST → 405; sin secreto, secreto equivocado, de más o de menos, o vacío → 401 sin tocar la base ni llamar al proveedor; sin secreto configurado en el servidor nadie entra; sin VAPID → 500.
- **Entradas inválidas**: JSON mal formado, `null`, número, texto o lista → 400 (con `null` la versión anterior lanzaba un error no controlado); título o cuerpo que no son texto → 400; `user_ids` vacío, no lista, sin forma de uuid, objetos o números → 200 sin enviar y sin llegar a la base.
- **Suscripciones vencidas**: 404 y 410 del proveedor borran la suscripción; 400, 401, 403, 413, 429, 5xx, caída de red, claves de suscripción inválidas y proveedor que no responde **no** la borran y se cuentan como fallidas (con registro que no expone la ruta secreta del endpoint).
- **Petición al proveedor**: cifrada (`aes128gcm`), con autorización VAPID cuyo JWT apunta al origen del servicio y al contacto configurado, y con TTL.
- Cambios hechos a la función a raíz de esto (**no desplegados**): 400 en cuerpos que no son objeto, validación de `user_ids` y de texto, comparación del secreto sin atajos por longitud, `timeout` hacia el proveedor (`PUSH_TIMEOUT_MS`, 10 s por defecto), registro de los fallos y `fallidos` en la respuesta, y la URL del aviso solo puede ser una ruta de la propia app.

## Ruta A: entorno local con Docker (recomendada, no cuesta nada)
1. **Activar la virtualización** en el BIOS/UEFI (Intel VT-x / AMD SVM). Hoy `VirtualizationFirmwareEnabled` es `False`.
2. **WSL 2** (PowerShell como administrador): `wsl --install`, reiniciar.
3. **Docker Desktop**: `winget install -e --id Docker.DockerDesktop`, abrirlo y esperar a "Engine running". Comprobar: `docker info`.
4. Desde la raíz del repositorio: `pwsh supabase\tests\entorno-local.ps1`
   Arma `.supabase-test\` (ignorado por git, proyecto `limpia-test`, puertos 544xx), levanta el stack local, aplica `schema.sql` y 0001–0014, **siembra reservas antiguas**, aplica la **0015 encima**, verifica y apaga (`-Conservar` lo deja encendido).
5. `pwsh supabase\tests\entorno-local.ps1 -SoloPreparar` arma el directorio sin Docker (sirve para revisar qué se va a aplicar y para `cadena.mjs`).

## Ruta B: proyecto de pruebas en la nube
1. En el panel de Supabase crear un proyecto NUEVO (por ejemplo `limpia-test`). La organización gratuita admite dos proyectos activos: habrá que pausar uno que no sea de Limpi, o usar otra organización. **No usar `LIMPIA`. Nada de esto lo hace el asistente: pausar o crear proyectos es decisión del dueño.**
2. En el SQL Editor del proyecto nuevo: `schema.sql` y las migraciones 0001 a 0014, en orden.
3. Crear `.env.test.local` en la raíz (queda ignorado por git por `*.local`; **no pegar las claves en el chat ni en commits**):
   ```
   TEST_SUPABASE_URL=https://<ref-del-proyecto-de-pruebas>.supabase.co
   TEST_SUPABASE_ANON_KEY=...
   TEST_SUPABASE_SERVICE_KEY=...
   TEST_CONFIRMO_ENTORNO_DE_PRUEBAS=si
   ```
   Las claves salen de Project Settings → API del proyecto de pruebas. La `service_role` da control total de ESE proyecto: úsala solo ahí.
4. `node --env-file=.env.test.local supabase/tests/integracion-real.mjs sembrar`
5. En el SQL Editor: migración 0015.
6. `node --env-file=.env.test.local supabase/tests/integracion-real.mjs verificar`
   En la nube la base no alcanza un servidor local, así que la captura de avisos queda **omitida** (y se reporta como no verificada).

El script se niega a correr contra `ztlxmdeviurdhqyabhvb` (producción) o sin `TEST_CONFIRMO_ENTORNO_DE_PRUEBAS=si`.

## Qué falta para cerrar el tema de notificaciones
1. Ejecutar la integración con captura (Ruta A): trigger → `pg_net` → HTTP.
2. **Desplegar** la versión endurecida de `send-push` (`supabase functions deploy send-push --no-verify-jwt`, acción del dueño) y probarla en `supabase functions serve` o en un proyecto de pruebas.
3. Probar con claves VAPID reales contra un proveedor real (una suscripción de prueba de un navegador).
4. Prueba manual en un celular Android real con la app instalada: activar avisos, crear un pedido directo, ver la notificación.
