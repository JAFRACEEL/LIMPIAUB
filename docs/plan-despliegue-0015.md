# Plan de validación y despliegue de la 0015 (borrador, NADA ejecutado)

Estado: la migración 0015 NO está aplicada en LIMPIA, no hay push y no hay deploy. Producción corre el frontend del commit `ae7a510` con las migraciones hasta la 0014.
La integración real (`supabase/tests/integracion-real.mjs`) NO se ha ejecutado nunca. Este bloque NO está listo para producción.

## 1. Revisión Codex de los commits 222d8bb y a061623
Pendiente. Solo el usuario puede lanzarla (`/codex:review --background`, sobre `ae7a510..HEAD`). Resultado: ninguno todavía.

## 2. Entorno aislado
Pendiente. Esta PC no puede correr Docker (virtualización apagada en el BIOS, sin WSL) y la organización Supabase gratuita no tiene ramas. Opciones (detalle en `docs/pruebas-integracion.md`):
- Ruta A: activar la virtualización en el BIOS, instalar WSL 2 y Docker, y correr `pwsh supabase\tests\entorno-local.ps1`.
- Ruta B: proyecto Supabase NUEVO de pruebas (decisión y cuenta del dueño; nunca LIMPIA).
Hasta ejecutar y pasar `integracion-real.mjs`, lo único verificado son simulaciones (PGlite: 182/182 y 30/30; `send-push` con proveedor simulado: 49/49; Vitest: 167/167).

## 3. Compatibilidad: análisis estático (NO sustituye la ejecución real)
Frontend publicado (`ae7a510`) contra la base con la 0015 aplicada:

| Punto | Qué pasa | Riesgo |
|---|---|---|
| `reservas.total` deja de ser columna generada (`drop expression`) | Los valores existentes se conservan. Para pedidos abiertos, `total` queda en NULL hasta que se elige candidata (`elegir_candidata`, reemplazada). Ganancias y panel antiguos suman `total`: hay que comprobar en real que `elegir_candidata` lo deja relleno. | Medio |
| Insert del frontend antiguo | Manda `tarifa_hora`, `ventana_cierra_en`, `recargo_materiales`: el trigger los ignora y los recalcula. Efecto: en pedidos programados con menos de ~30 min de margen el insert ahora se rechaza ("Elige una hora que falte al menos 30 minutos"). | Bajo (cambio de comportamiento) |
| Updates directos del panel antiguo (estado, `hora_llegada`, ubicación, cancelar, dirección) | `fn_proteger_economia` solo bloquea columnas económicas y de contratación; esos updates no las tocan. Falta confirmarlo contra Postgres real con sesiones reales. | Medio hasta probarlo |
| Vistas `v_pedidos_abiertos` / `v_mis_postulaciones` | Se reemplazan añadiendo columnas; `v_pedidos_abiertos` ahora solo muestra modalidad por horas y exige disponibilidad real. Las trabajadoras con la UI antigua verían menos pedidos, no más. | Bajo |
| `postularme_a_reserva`, `elegir_candidata` | Misma firma; reglas más estrictas. | Bajo |
| Reservas antiguas | Columnas nuevas con valores por defecto (`horas`, 1 persona, `programada`); `total_cliente = total`. Probado solo en PGlite con datos sembrados. | Bajo, sin probar en real |
| Sin cambios destructivos de datos | No hay `drop column`/`drop table`/`delete`. El único cambio de estructura sobre datos existentes es `total`. | — |

Aun así, ninguna fila indica que la base real de LIMPIA coincida exactamente con 0001–0014 (algunas se aplicaron a mano). Antes de cualquier ejecución hay que comparar el esquema real con el esperado (solo lectura; requiere autorización del usuario).

## 4. Respaldo y recuperación (propuesta)
Antes de tocar LIMPIA (cuando se autorice):
1. Verificar en el panel de Supabase si el plan incluye respaldos; en plan gratuito normalmente no hay restauración. Si no los hay, hacer un volcado propio (`supabase db dump` o `pg_dump`, esquema y datos) y guardarlo fuera de la PC.
2. Anotar la URL del deploy actual de Vercel (para `vercel rollback`/promover ese deploy en segundos).
3. Elegir una ventana de bajo uso.

Si falla la migración: se ejecuta en una sola transacción (`begin; … commit;`), por lo que un error revierte todo. No se corrige a ciegas en producción.
Si falla después de aplicada:
- Frontend: promover el deploy anterior en Vercel (no toca la base).
- Base: script `0015_rollback.sql` que restaure las funciones y vistas a las definiciones de 0005/0006/0010/0014, elimine triggers nuevos (`trg_proteger_economia`, `trg_preparar_reserva_nueva`, `trg_oferta_directa`, `trg_cerrar_propuestas`, `trg_propuesta_inmutable`) y deje las tablas y columnas nuevas sin usar. Restaurar `total` como columna generada exige borrar y recrear la columna: se guardaría el volcado previo. **Este script todavía no existe**; se escribirá y se probará en el entorno aislado antes de aprobar cualquier ejecución.

## 4b. Estado de la reversa y de las pruebas (actualizado)
Archivos preparados, **ninguno ejecutado en un proyecto Supabase**:
| Archivo | Qué es | Estado |
|---|---|---|
| `supabase/rollback/0015_rollback.sql` | Reversa "hacia adelante": restaura funciones y vistas anteriores (literales de 0006/0010/0013/0014), quita `trg_oferta_directa`, apaga `propuestas_activas`, mantiene `total` como columna normal con fórmula antigua solo para reservas del modelo antiguo, reafirma permisos. No borra filas, tablas ni columnas. | **Pendiente de validación real** |
| `supabase/tests/rollback-0015.mjs` | Simulación en PGlite: frontend antiguo contra base migrada, valores y permisos antes/después, aislamiento, envío interno de avisos con `fn_enviar_push` cerrada, idempotencia. Resultado: 56/56 (y detecta 2 reversas defectuosas a propósito). | Simulación; no sustituye a la real |
| `supabase/tests/compat-reversa-real.mjs` | Lo mismo por la API real (modos `antiguo`, `aislamiento`, `foto`, `comparar`). | **Escrito, no ejecutado** |
| `supabase/tests/consultas-esquema-solo-lectura.sql` | Inspección de metadatos con huellas md5; informa si falta `schema_migrations` sin abortar. | **Ejecutado en LIMPIA el 2026-10-14 (solo lectura, autorizado)**; resultados en `docs/inspeccion-esquema-limpia.md`: estructura y permisos = 0001–0014, 0015 no aplicada; cuerpos de funciones sin verificar (falta `limpia-test`) |

Hallazgos de la simulación (no confirmados en real):
- Antes de la 0015 `fn_enviar_push` era ejecutable por `authenticated` (`true/true/false`); la reversa deja `false/false/false`. Volver a las definiciones antiguas con sus GRANT originales habría reabierto ese acceso.
- El frontend antiguo (candidato `ae7a510`) funciona contra la base migrada en las operaciones probadas: insert abierto y directo, postularse, elegir candidata, ciclo de estados, cancelar. Los totales quedan bien (93 y 90 en los casos probados).
- Único cambio visible para el frontend antiguo: un pedido programado con menos de ~30 min de margen se rechaza.
- Una fórmula antigua aplicada a ciegas pisaría importes nuevos (2 personas, propuestas aceptadas); por eso el trigger de compatibilidad solo actúa sobre reservas del modelo antiguo y la prueba lo verifica.

## 4c. Prueba funcional del frontend antiguo en el navegador (pendiente del proyecto de pruebas)
1. Worktree de `ae7a510` (ya creado en el scratchpad de la sesión): `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` del proyecto de pruebas en su `.env`, `npx vite build`, servir `dist/`.
2. Con Playwright: registro de cliente y profesional sintéticos, pedido abierto, postulación, elección, ciclo de estados, ganancias, kit a crédito, cancelación.
3. Repetir tras la reversa.
`ae7a510` es la versión candidata del publicado, no una identificación exacta.

## 4d. Hallazgos de la inspección de LIMPIA y trabajo derivado
- Estructura y permisos de LIMPIA = 0001–0014; la 0015 no está aplicada (`docs/inspeccion-esquema-limpia.md`).
- **17 diferencias en cuerpos de funciones sin explicación demostrada.** Se resolverán en `limpia-test` con `supabase/tests/consultas-huellas-funciones.sql` y `comparar-huellas.mjs` (solo la categoría `IGUAL` prueba equivalencia). Afecta a la 0015 porque reemplaza `postularme_a_reserva`, `elegir_candidata` y `fn_push_reservas_insert`.
- **`fn_enviar_push` hoy es ejecutable por `anon` y `authenticated` en LIMPIA.** Parche mínimo independiente de la 0015 en `supabase/hotfix/` (`docs/hotfix-fn-enviar-push.md`): probado solo en simulación (37/37), **no ejecutado** en ningún proyecto.

## 4e. Cambio de entorno (2026-10-17) y estado
- El dueño declaró LIMPIA un piloto con datos de prueba y eligió usarla en vez de `limpia-test`. Esto cambia el riesgo de datos, **no** las autorizaciones: aplicar la 0015, la reversa o el parche en LIMPIA requiere una instrucción explícita para esa acción.
- Hecho: respaldo interno `respaldo_pre0015`, cuentas y reservas sintéticas, comprobación real de que `fn_enviar_push` está abierta a `anon`. Falta un volcado externo (la CLI no tiene sesión).
- **Rechazado por el dueño:** el envío de la 0015 a LIMPIA. Pendiente de nueva instrucción.
- La 0015 ganó la sección 10 (quita `fn_total_compat` y su trigger si existen) para poder reaplicarla tras la reversa. `reaplicar-0015.mjs`: 2/2 en simulación. Pruebas re-ejecutadas sin fallos: migración 182/182, reversa 56/56, cadena 30/30, Vitest 167/167.
- Vista previa: la app muestra "ENTORNO DE PRUEBAS" solo si se compila con `VITE_ENTORNO_PRUEBAS=si`. Sin publicar.

## 5. Condiciones para volver a pedir autorización
1. Revisión Codex hecha y hallazgos aprobados corregidos.
2. `integracion-real.mjs` pasando en entorno aislado (incluida la parte de `pg_net`).
3. Prueba de compatibilidad: frontend `ae7a510` contra la base con 0015 en ese entorno.
4. `0015_rollback.sql` probado en ese entorno.
5. Comparación de esquema real vs esperado y respaldo confirmados.
6. Las 17 diferencias de funciones clasificadas en `limpia-test`; toda función distinta de `IGUAL` revisada con autorización puntual.
7. Decisión aparte sobre el parche de `fn_enviar_push` (puede aplicarse antes que la 0015, tras probarlo en `limpia-test`).
