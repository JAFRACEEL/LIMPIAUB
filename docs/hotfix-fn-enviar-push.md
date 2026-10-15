# Parche mínimo: cerrar la ejecución directa de `fn_enviar_push` (borrador para revisión)

**Estado: preparado y probado SOLO en simulación (PGlite, 37/37). No se ha ejecutado en LIMPIA ni en ningún proyecto.** El éxito en PGlite no cierra la validación real. Es independiente de la migración 0015 (la 0015 incluye el mismo cierre; aplicar este parche antes no la afecta).

## Qué corrige
En LIMPIA, `anon` y `authenticated` pueden ejecutar `public.fn_enviar_push(uuid[], text, text, text)` (inspección del 2026-10-14). Cualquiera con la clave pública podría hacer que la base mande una notificación push con texto arbitrario a cualquier usuario. La 0013 solo la revocó a `PUBLIC`; el permiso viene de los privilegios por defecto de Supabase.

## Qué NO hace
No cambia otras funciones, tablas, vistas ni políticas; no toca `service_role` ni `postgres`; no cambia los privilegios por defecto (una función nueva volverá a nacer ejecutable por `anon`/`authenticated` y habrá que revocarla igual); no modifica cuerpos de funciones.

## Archivos (`supabase/hotfix/`)
| Archivo | Para qué |
|---|---|
| `fn_enviar_push_verificar_antes.sql` | Solo lectura. A: sobrecargas con dueño, SECURITY DEFINER/INVOKER y configuración. B: ACL explícito. C: quién puede ejecutarla. D: llamadores con dueño, tipo de seguridad y huella de cuerpo. E: triggers. |
| `fn_enviar_push_cerrar_api.sql` | El parche. Un único bloque `DO` (atómico, sin `BEGIN/COMMIT` explícitos). |
| `fn_enviar_push_verificar_despues.sql` | Una consulta de solo lectura; cada fila es una comprobación y **todas deben dar `ok = true`**. |
| `fn_enviar_push_recuperar_envio.sql` | Contingencia: da EXECUTE solo al dueño de un llamador que lo haya perdido. |
| `supabase/tests/hotfix-fn-enviar-push.mjs` | Prueba en simulación con dueño no superusuario. |
| `supabase/tests/fn-enviar-push-api.mjs` | Prueba por la API real con lista vacía (sin efectos). Escrita, no ejecutada. |

## Firma y sobrecargas
Por la inspección: una sola función `fn_enviar_push(p_user_ids uuid[], p_titulo text, p_cuerpo text, p_url text)` en `public`, SECURITY DEFINER con `search_path` fijado. **Sin verificar todavía**: el dueño real y sobrecargas en otros esquemas (las consultas A y D lo darán, con autorización nueva). El parche cierra **todas** las sobrecargas de `public`.

## Mecanismos internos que la llaman
Los seis `fn_push_*` de la 0013 (`fn_push_reservas_insert/update`, `fn_push_candidaturas_insert/update`, `fn_push_trabajadores_insert/update`), todos SECURITY DEFINER en LIMPIA. Corren con los permisos de su dueño, que conserva EXECUTE (revocar a otros roles no se lo quita al dueño). **El parche lo comprueba antes de confirmar** y **aborta sin cambiar nada** si: un llamador es SECURITY INVOKER; el dueño de un llamador no puede ejecutarla; el dueño de la función perdería el permiso; o `anon`/`authenticated` conservarían EXECUTE por un permiso otorgado por otro rol. Aborta también si hubiera una sobrecarga de otro dueño que los llamadores perdieran (comportamiento conservador, probado en S5b).

## Orden de ejecución (cuando el dueño lo autorice, primero en `limpia-test`)
1. `fn_enviar_push_verificar_antes.sql`, consulta por consulta dentro de `begin read only; … rollback;`. Guardar la consulta D (huellas de cuerpo). Esperado: una sola sobrecarga; 6 llamadores SECURITY DEFINER; `mismo_dueno_que_fn_enviar_push = true` y `su_dueno_puede_ejecutarla = true` en todos.
2. (Opcional, sin efectos) `node --env-file=.env.test.local supabase/tests/fn-enviar-push-api.mjs abierto`. Con lista vacía la función retorna sin enviar nada.
3. `fn_enviar_push_cerrar_api.sql`.
4. `fn_enviar_push_verificar_despues.sql`: todas las filas `ok = true`, y las huellas de cuerpo iguales a las del paso 1.
5. `fn-enviar-push-api.mjs cerrado`: `anon` recibe 401/403/404 (permission denied).
6. Comprobar que el envío legítimo sigue: provocar un aviso en `limpia-test` (p. ej. un pedido directo) con `pg_net` apuntando a un receptor de captura. **No se hace en LIMPIA**: dispararía un aviso real. El paso 4 comprueba el permiso del dueño sin enviar nada.

## Si algo falla
- **El parche aborta**: no cambió nada. Leer el mensaje (nombra la función y el dueño). Si falta el permiso al dueño de un llamador, concederlo explícitamente a ese dueño (`grant execute on function public.fn_enviar_push(uuid[], text, text, text) to <dueño>;`) y repetir. Nunca a `PUBLIC`, `anon` ni `authenticated`.
- **Tras aplicarlo, los avisos dejan de salir** (p. ej. crear un pedido da `permission denied for function fn_enviar_push`): ejecutar `fn_enviar_push_recuperar_envio.sql`. Concede EXECUTE solo al dueño de cada llamador SECURITY DEFINER que no pueda ejecutarla y se niega a reabrir `anon`/`authenticated`. Un llamador SECURITY INVOKER requiere decisión manual (convertirlo cambia su semántica de seguridad). Verificar con el paso 4.
- **No existe una reversión que reabra el acceso público**, a propósito: restauraría el riesgo.
- Efecto de un fallo no detectado: un permiso faltante hace fallar el trigger y por tanto la operación que lo dispara (crear o cambiar un pedido). Por eso el paso 6 se hace en pruebas antes de producción.

## Resultado en simulación (no es validación real)
37/37: caso normal (antes: un anónimo dispara un aviso; después: `permission denied` para `anon` y `authenticated`, también con lista vacía; el envío legítimo por trigger con dueño no superusuario sigue funcionando; solo cambia el permiso de esa función; los cuerpos de los llamadores no cambian; idempotente), dueño de llamador sin permiso (aborta sin cambios; con el permiso previo se aplica), contingencia y recuperación, llamador SECURITY INVOKER (aborta), y sobrecargas (misma propiedad se cierran todas; de otro dueño aborta).
**Correcciones hechas durante la prueba**: el parche usaba `BEGIN/COMMIT` explícitos, que dejaban la sesión en transacción abortada tras un fallo; ahora es un único bloque `DO` atómico. Cuatro fallos eran expectativas erróneas de la propia prueba (firma textual, ausencia de `PUBLIC` en el ACL —como en LIMPIA, donde la 0013 lo revocó—, y un permiso de montaje que falseaba los escenarios S2/S3), corregidas.
