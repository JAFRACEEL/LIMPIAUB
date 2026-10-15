# Inspección de metadatos de LIMPIA (solo lectura) — 2026-10-14

Alcance autorizado por el dueño: únicamente las consultas de `supabase/tests/consultas-esquema-solo-lectura.sql`, cada una dentro de `begin read only; … rollback;`. Sin modificaciones, sin datos de negocio, sin secretos, sin consultas adicionales. No se corrigió nada en producción.
Solo salen nombres, tipos, firmas, permisos y huellas md5 (ninguna definición en claro). No se leyeron `auth.*`, `storage.*`, `vault.*`, `app_config` ni filas de tablas de la app.

## Resultado: producción coincide con `schema.sql` + 0001–0014; la 0015 no está aplicada
| Elemento | Esperado (0001–0014) | Producción | Resultado |
|---|---|---|---|
| Columnas de tablas (tipo, nulabilidad, generada, huella del valor por defecto) | 112 | 112 | Igual |
| Vistas (nombres y columnas en orden) | 6 | 6 | Igual |
| Funciones (nombre, argumentos, security definer, volatilidad, parámetros de config) | 22 | 22 | Igual |
| Triggers | 15 | 15 | Igual |
| Políticas RLS (nombre, comando, huellas de las condiciones) | 23 | 23 | Igual |
| Restricciones (nombre, tipo, huella) | 42 | 42 | Igual |
| RLS activa | 9 tablas | 9 tablas | Igual |
| Permisos EXECUTE de anon/authenticated/PUBLIC | 60 | 60 | Igual |
| Realtime | reservas, trabajadores, candidaturas, prestamos_kit | los mismos 4 | Igual |
| Extensiones | — | pg_net, pgcrypto, plpgsql, supabase_vault, uuid-ossp, pg_stat_statements | pg_net (necesaria para push) presente |
| `supabase_migrations.schema_migrations` | — | **no existe** | Las migraciones se aplicaron a mano; no hay registro oficial |

**No se encontró ninguna diferencia estructural.** Ninguno de los objetos que crea la 0015 existe en producción (18 funciones, `propuestas`, `pagos`, `precios_profesional`, `servicio_modalidades`, columnas nuevas de `reservas`, `app_config.propuestas_activas`).

## Límite de esta comparación (importante)
Los **cuerpos** de las funciones no quedaron verificados: solo 3 de 22 huellas coinciden con las de la simulación. La simulación usa PostgreSQL 18 (PGlite) y producción 17, y los archivos del repositorio tienen saltos de línea de Windows; ambas cosas cambian el texto del que se calcula el md5. Lo que sí está verificado es la estructura y los permisos. Para comparar cuerpos hay que correr la misma consulta en `limpia-test` (mismo PostgreSQL 17, con los mismos archivos) y comparar huellas. Eso queda pendiente del proyecto de pruebas.

## Qué de lo encontrado afecta a la 0015
1. **`total` es columna calculada** (`generada = 's'`): la 0015 la convierte en columna normal (`drop expression`); el estado actual es el que la migración espera (la rama condicional se ejecutará).
2. **Base limpia para la 0015**: ninguna tabla, columna, trigger ni política de la 0015 existe, así que no hay conflicto con objetos previos. Las vistas `v_pedidos_abiertos` y `v_mis_postulaciones` tienen exactamente las columnas que la 0015 espera ampliar.
3. **`fn_enviar_push` es hoy ejecutable por `anon` y `authenticated` en producción** (permiso heredado de los privilegios por defecto de Supabase; la 0013 solo la revocó a `PUBLIC`). La 0015 la cierra para ambos. Hasta que se aplique, cualquier visitante con la clave pública puede pedirle a la base que envíe una notificación push con título y texto arbitrarios a cualquier usuario. Es una exposición existente hoy, no introducida por la 0015.
4. `postularme_a_reserva` y `elegir_candidata` son ejecutables por `anon` (la 0015 les quita ese permiso; ambas ya validan `auth.uid()`). `emitir_prestamo_kit` también lo es, pero valida internamente que quien llama sea admin (0008). `puede_ver_foto_referencia` y `trabajador_disponible_en` también y la 0015 no las toca.
5. Los roles `anon` y `authenticated` tienen todos los privilegios de tabla (incluido `TRUNCATE`/`TRIGGER`) sobre las tablas, como dan por defecto los proyectos Supabase; la protección es RLS (activa en las 9 tablas). Es un endurecimiento posible, no relacionado con la 0015.

## Qué significa que `fn_enviar_push` "queda sin acceso para nadie"
Significa **ningún rol de la API** (`anon`, `authenticated`, `PUBLIC`) puede llamarla por RPC. No significa que nadie pueda enviar:
- Los avisos legítimos los envían los **triggers** (`fn_push_*`) y las funciones internas de la 0015, todos `SECURITY DEFINER`: corren con los permisos de su dueño, que conserva EXECUTE sobre `fn_enviar_push` (un `REVOKE` a otros roles no se lo quita al dueño). Por eso un cliente que crea un pedido sigue generando el aviso al profesional.
- Comprobado **en simulación** (PGlite, `rollback-0015.mjs`): con la función cerrada para `authenticated`, un pedido directo creado por un cliente genera la llamada HTTP al servicio push, antes y después de la reversa. Limitación: en PGlite el dueño es superusuario, así que no reproduce exactamente el dueño `postgres` de Supabase.
- **Pendiente en real**: en `limpia-test` con captura de `pg_net` (`integracion-real.mjs` con `TEST_PUSH_CAPTURE_HOST`) y, después, la entrega a un dispositivo (que nunca se ha verificado).

## Qué sigue siendo simulado
Todas las pruebas del frontend antiguo (`ae7a510`, versión candidata del publicado, no identificación exacta) contra la base migrada, la reversa `0015_rollback.sql` y la comparación de valores y permisos son **simulaciones en PGlite**, no integración real. La integración real, la prueba en navegador del frontend antiguo y la reversa real siguen pendientes de `limpia-test`.
