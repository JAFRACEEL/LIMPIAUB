# Pruebas de integración real (migración 0015)

## Estado
**Pendiente de ejecutar.** En la máquina de desarrollo la CLI de Supabase está instalada (2.117.0), pero no hay Docker, no hay ninguna distribución de WSL y la virtualización está desactivada en el firmware. La organización de Supabase está en el plan gratuito (sin ramas de base de datos) y el único proyecto de Limpi es el de producción, que no se usa para pruebas.
Hasta que `supabase/tests/integracion-real.mjs` pase, el cierre definitivo de la experiencia del cliente sigue abierto.

## Qué verifica y qué no
| Capa | Qué se comprueba | Cómo | Estado |
|---|---|---|---|
| Reglas de la base (triggers, funciones, RLS, permisos, reservas antiguas y nuevas) | contratación, pagos, modalidades, propiedad de propuestas, `fn_enviar_push` | `node supabase/tests/migracion-0015.mjs` (PGlite) | **Verificado: 161 de 161** |
| API real: sesiones (JWT de GoTrue), permisos de PostgREST, RLS vía API, migración sobre datos viejos | los mismos flujos, pero por la API de Supabase | `integracion-real.mjs` | **No ejecutado** |
| Trigger → `pg_net` → HTTP | que los avisos llegan como llamada HTTP con el secreto compartido | `integracion-real.mjs` con `TEST_PUSH_CAPTURE_HOST` | **No ejecutado** |
| Edge Function `send-push` procesando el aviso y firmándolo con VAPID | que la función acepta el aviso y llama al servicio push | prueba aparte con `supabase functions serve` | **No existe todavía** |
| **Entrega real** al navegador o celular (servicio push de Google/Apple, service worker, notificación visible) | que a la persona le aparece el aviso | manual, en un dispositivo | **No verificado nunca en esta etapa** |

La integración distingue de forma explícita: lo que prueba es *trigger → pg_net → HTTP*. **No prueba la entrega de push.** Un resultado verde de la integración no debe leerse como "las notificaciones llegan".

## Ruta A: entorno local con Docker (recomendada, no cuesta nada)
1. **Activar la virtualización** en el BIOS/UEFI (Intel VT-x / AMD SVM). Hoy `VirtualizationFirmwareEnabled` es `False`.
2. **WSL 2** (PowerShell como administrador): `wsl --install`, reiniciar.
3. **Docker Desktop**: `winget install -e --id Docker.DockerDesktop`, abrirlo y esperar a "Engine running". Comprobar: `docker info`.
4. Desde la raíz del repositorio: `pwsh supabase\tests\entorno-local.ps1`
   Esto, en este orden: arma `.supabase-test\` (ignorado por git, proyecto `limpia-test`, puertos 544xx), levanta el stack local, aplica `schema.sql` y las migraciones 0001–0014, **siembra reservas antiguas**, aplica la **0015 encima**, ejecuta la verificación y apaga el stack (`-Conservar` lo deja encendido).
5. `pwsh supabase\tests\entorno-local.ps1 -SoloPreparar` arma el directorio sin Docker (sirve para revisar qué se va a aplicar).

## Ruta B: proyecto de pruebas en la nube
1. En el panel de Supabase crear un proyecto NUEVO (por ejemplo `limpia-test`). La organización gratuita admite dos proyectos activos: habrá que pausar uno (por ejemplo el que no es de Limpi) o usar otra organización. **No usar `LIMPIA`.**
2. En el SQL Editor del proyecto nuevo: `schema.sql` y las migraciones 0001 a 0014, en orden.
3. Crear el archivo `.env.test.local` en la raíz (queda ignorado por git por `*.local`; **no pegar las claves en el chat ni en commits**) con:
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
   En la nube no hay forma de que la base alcance un servidor local, así que la parte de captura de avisos queda **omitida** (y se reporta como no verificada).

El script se niega a correr contra `ztlxmdeviurdhqyabhvb` (producción) o sin `TEST_CONFIRMO_ENTORNO_DE_PRUEBAS=si`.

## Qué falta para cerrar el tema de notificaciones
- Ejecutar la integración con captura (Ruta A).
- Probar `send-push` por separado (aceptar el aviso, firmar con VAPID).
- Prueba manual en un celular Android real con la app instalada: activar avisos, crear un pedido directo, ver la notificación.
