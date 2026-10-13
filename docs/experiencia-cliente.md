# Experiencia del cliente (migración 0015)

## Recorrido
`/` (inicio, sin cuenta) → `/pedir` (3 pasos: necesidad, dirección y horario, resumen) → login solo al enviar → `/reservas` ("Mis servicios": propuestas, contratar, pago) → calificar.
Navegación del cliente: Inicio, Mis servicios (`/reservas`: la ruta se mantiene porque los push apuntan ahí) y Cuenta (`/cuenta`).
`/reservar` redirige a `/pedir` conservando `?trabajador=<id>`.

## Dónde vive cada regla
| Regla | Archivo |
|---|---|
| Sinónimos y reglas de interpretación (editable) | `src/lib/sinonimos.ts`, motor en `src/lib/interpretar.ts` |
| Limpieza por casa / ambientes / algo puntual | `src/lib/flujoLimpieza.ts` |
| Qué forma de cobro admite cada servicio | `MODALIDADES_POR_SERVICIO` en `src/lib/catalogoServicios.ts` **y** tabla `servicio_modalidades` (0015); una prueba verifica que coincidan |
| Qué se puede contratar hoy (forma de cobro + cobertura) | `src/lib/disponibilidad.ts` |
| Cálculos y desglose | `src/lib/precios.ts` (espejo de la migración) |
| Estado del pago, separado del estado del servicio | `src/lib/estadoPago.ts` |
| Validación por pasos, fila a insertar, pedido directo | `src/lib/pasosPedido.ts`, `solicitud.ts` |
| Precios, propuestas, pagos, protección, modalidades | `supabase/migrations/0015_experiencia_cliente.sql` |

## Qué decide el servidor (la interfaz no es la barrera)
- **Modalidades**: al insertar una reserva el servidor exige que la forma de cobro esté en `servicio_modalidades` para ese servicio, y que, si no es "por horas", `app_config.propuestas_activas` sea `true`. Arranca en `false`. Se activa con `update app_config set propuestas_activas = true;` (solo desde el SQL Editor o un admin). `postularme_a_reserva`, `fn_crear_oferta` y `enviar_propuesta` también lo comprueban.
- **`VITE_PROPUESTAS_ACTIVAS` solo cambia la interfaz.** Para activar de verdad hay que cambiar las DOS cosas (variable de Vercel y `app_config`). Si solo se enciende la variable, el servidor rechaza el pedido con un mensaje en español; si solo se enciende el servidor, la interfaz sigue sin ofrecerlo.
- **Precios**: el servidor fija tarifa, totales, comisión (20%) y kit (S/18 = S/13 + S/5). Un servicio sin `precios_profesional` configurado NO recibe oferta (error, nunca un precio inventado ni horas de reemplazo).
- **Propiedad y aceptación**: contratar y responder propuestas exigen ser el cliente de esa reserva; las propuestas aceptadas no se editan; `pago_confirmado` solo lo marca `confirmar_pago` (admin).
- **Permisos**: las funciones internas (`fn_*`) no son invocables desde la app. `fn_enviar_push` (0013) quedó solo para triggers y funciones del servidor: antes cualquier usuario con sesión podía enviar avisos a otros.

## Qué se puede contratar hoy y qué se muestra
- Hoy solo "por horas" es operativo, y únicamente en servicios donde cobrar por tiempo tiene sentido (limpieza, lavado, organización, reparaciones generales).
- **Electricidad, Gasfitería, Aire acondicionado, Cerrajería, Pintura, Albañilería, Carpintería y Vidriería no se contratan "por horas" como reemplazo.** Se muestran como "Aún no disponible" y se explica por qué; no hay botón para continuar. Se habilitan cuando `propuestas_activas` esté en `true`, el panel del profesional exista y haya precios configurados.
- **Cobertura** (`v_cobertura_servicios`, solo conteos, legible sin cuenta): un servicio sin profesionales habilitados se muestra pero no se puede contratar, y en el paso 2 se avisa si no hay profesionales en la zona elegida. **Aire acondicionado hoy no tiene ninguno.** Su ficha de alcance es provisional (está marcada en el código): revisarla con técnicos reales antes de abrirlo.

## Borrador del pedido
- **Dónde**: `sessionStorage` del navegador, clave `limpi.pedido.v1` (`src/lib/borrador.ts`). No se envía al servidor hasta que el cliente confirma el pedido.
- **Qué conserva**: el texto libre con que describió su problema (puede contener información privada, por eso la pantalla le pide no escribir DNI, claves ni datos de pago), el servicio, las opciones elegidas, día y hora, zona y el profesional elegido.
- **Qué NO conserva**: dirección, notas, respuestas privadas del recojo de ropa (nombre, celular, dirección de entrega) ni fotos. La dirección se vuelve a precargar desde la cuenta.
- **Cuándo se elimina**: al enviar el pedido, al tocar "Descartar este pedido" en el inicio, al cerrar sesión, a las 2 horas (al leerlo vencido) o al cerrar la pestaña.

## Componentes eliminados (`Reservar.tsx`, `SelectorServicio.tsx`): qué se conservó
| Antes | Ahora |
|---|---|
| Servicios filtrados al elegir a un profesional | Lista de "Cambiar" filtrada y aviso con opción "Enviar a otros profesionales" (`validarDirecto`) |
| Kit solo si el profesional lo ofrece | Opción deshabilitada, `validarDirecto` y el servidor |
| Disponibilidad del profesional en ese horario | Se mantiene (`trabajador_disponible_en`) |
| Preguntas por servicio (`preguntas`, `visibleSi`, `aviso`, `privada`) | Intactas (`PreguntaCampo`, `preguntasDelPedido`) |
| Fotos obligatorias de post obra / máximo de fotos | Intactas |
| Lavado con recojo: "Fecha/Dirección de recojo" y entrega estimada | Restaurado (`esRecojo`, `entregaEstimada`, resumen y detalles) |
| Descripción del servicio, "Qué incluye / no incluye / notas", condiciones | Visibles y desplegables en el paso 1 y en el resumen |
| Casilla "He leído y entiendo el alcance" | **Reemplazada** por aceptación explícita: "Pedir a X por S/ …" (directo) o "Contratar por S/ …" tras ver precio, alcance y condiciones (abierto). No hay casilla aparte. |
| Pago elegido al reservar | Pasó a después de contratar (`PagoReserva`), como evidencia pendiente de verificación |
| Total estimado solo con profesional directo | Igual: nunca se publica un precio sin datos reales |

## Qué prueba cada cosa (no confundirlas)
| Tipo | Qué cubre | Qué NO demuestra |
|---|---|---|
| **Unitarias** (`npm test`, Vitest) | Reglas puras: interpretación, precios, pasos, borrador, disponibilidad, restricción de "Reparaciones generales", paridad catálogo ↔ migración | Nada de la base ni del navegador |
| **Comprobaciones SQL** (`supabase/tests/migracion-0015.mjs`, Postgres real en memoria con PGlite, 0001 a 0015, reservas anteriores y nuevas, roles simulados) | Triggers, funciones, RLS, permisos, contratación, pagos, y que los triggers *invocan* el envío de avisos | PostgREST, GoTrue, JWT reales, Realtime, Storage, `pg_net` |
| **Capturas con red interceptada** (Playwright) | Presentación en 390 px | El recorrido completo: la red está simulada |
| **Integración real** (`integracion-real.mjs`) | Sesiones reales, permisos y RLS por la API, migración sobre datos viejos, trigger → `pg_net` → HTTP | **Escrita, NO ejecutada** (ver `docs/pruebas-integracion.md`) |
| **Entrega de push** | — | Nunca verificada en esta etapa: ninguna de las pruebas anteriores la demuestra |

`npm i --no-save @electric-sql/pglite && node supabase/tests/migracion-0015.mjs` repite las comprobaciones SQL sin tocar ninguna base.

## "Reparaciones generales" no es un atajo
Se cobra por horas, así que se delimitó: solo colgar cuadros, accesorios livianos y ajustes menores. Un texto que nombre electricidad, gasfitería, cerrajería, aire acondicionado, pintura, albañilería, carpintería o vidriería se rechaza en la interfaz (lista amplia, `oficiosFueraDeGenerales`) y en el servidor (lista corta de palabras claras, `fn_oficio_en_texto`), con un botón para pedirlo en el servicio que corresponde. El servidor no entiende el texto: corta los casos obvios; una descripción deliberadamente disfrazada puede pasar y la revisa quien acepta el trabajo.

## Dependencias de la etapa del profesional
- Pantalla para configurar `precios_profesional` y para enviar propuestas (`enviar_propuesta`); leer `v_pedidos_abiertos_todas`.
- Un panel que consulte la lista de pedidos sin depender de "disponible ahora" (ya corregido para "programados"); los avisos push de pedidos programados siguen yendo solo a quienes están disponibles ahora.
- Datos reales de cobro (Yape, Plin, banco) en `DATOS_PAGO`.
- Profesionales de Aire acondicionado registrados.
