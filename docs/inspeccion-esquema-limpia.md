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

## Límite de esta comparación (importante): 17 diferencias de funciones SIN explicación demostrada
La estructura y los permisos coinciden, pero los **cuerpos** de las funciones **no quedaron verificados**. Las huellas originales (md5 de `pg_get_functiondef`) de LIMPIA coinciden con las de la simulación en solo 3 de 22 funciones (`fn_proteger_reserva`, `fn_validar_solapamiento`, `trabajador_disponible_en`): **19 difieren**.

Qué se ha podido explicar y qué no (todo con la simulación local, sin consultar producción de nuevo):
- Solo **2** funciones tienen retornos de carro (`\r`) dentro del cuerpo en la simulación: `puede_ver_foto_referencia` y `fn_proteger_detalles_servicio`. Quitarlos hace coincidir **2 más** (5 de 22). Es un apoyo, no una prueba: un `\r` dentro de un literal también cambia el texto, y no se sabe si LIMPIA tiene esos retornos.
- Quedan **17 diferencias sin explicación demostrada.** No se atribuyen a PostgreSQL 17 frente a 18 ni a otra causa: es una hipótesis no comprobada. Pueden ser diferencias de representación (cabecera de `pg_get_functiondef` según versión) o **cambios reales** (una función editada a mano en producción, una versión distinta de una migración).
- Las huellas originales se conservan tal como salieron; **no se sustituyen por huellas normalizadas**. Normalizar todos los espacios no demuestra equivalencia: puede ocultar un cambio dentro de un literal de texto. Las comparaciones normalizadas solo orientan dónde mirar primero.

Cómo se resolverá (nada de esto se ha ejecutado en LIMPIA; las consultas nuevas requieren una autorización nueva y específica):
1. En `limpia-test` (mismo motor que producción), aplicar `schema.sql` + 0001–0014 con los mismos archivos y correr `supabase/tests/consultas-huellas-funciones.sql`. Aísla el efecto de la versión: si las huellas originales de `limpia-test` coinciden con las de LIMPIA, no hay cambio; si no, es el texto.
2. `huella_cuerpo` (md5 de `prosrc`, sin cabecera) no depende de la versión del motor: solo si coincide, el cuerpo es idéntico. Si LIMPIA y `limpia-test` difieren ahí, hay un cambio real en el texto.
3. `supabase/tests/comparar-huellas.mjs` clasifica cada función: `IGUAL` (única categoría que prueba equivalencia), `CABECERA_DISTINTA`, `SOLO_FIN_DE_LINEA`, `SOLO_ESPACIOS` (no demostrado), `DISTINTA`, `SOLO_EN_UNO`. Su prueba local (`comparar-huellas.prueba.mjs`, 5/5) comprueba que un cambio de espacios dentro de un literal sale como `SOLO_ESPACIOS` y nunca como `IGUAL`.
4. Para toda función clasificada distinta de `IGUAL` se pedirá autorización puntual para revisar su texto; hasta entonces el despliegue de cualquier migración que reemplace una de ellas (`postularme_a_reserva`, `elegir_candidata`, `fn_push_reservas_insert`) no debe darse por seguro.

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
