# Limpi — instrucciones para Claude Code

Construye una web app tipo Uber para limpieza doméstica por horas en Iquitos, Perú. Dos lados: **clientes** buscan y reservan; **trabajadores** se inscriben, activan "Disponible ahora" y aceptan trabajos. Un **admin** verifica trabajadores.

## Stack (no cambiar)
- Frontend: Vite + React + TypeScript + Tailwind. PWA (manifest + service worker) para instalar en celular.
- Backend: Supabase (Auth, Postgres, Realtime, Storage). El esquema ya existe en `supabase/schema.sql`: úsalo tal cual, no lo rediseñes. Si necesitas un cambio, agrégalo como migración nueva en `supabase/migrations/`.
- Deploy: estático (Vercel o Netlify). Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Idioma de toda la UI: español peruano coloquial. Moneda S/. Zona horaria America/Lima.
- Mobile-first. La mayoría de usuarios entra desde celular Android de gama baja: bundle liviano, sin librerías pesadas de mapas (usar lista + filtro por zona; mapa es fase 2).

## Roles y flujos

### Registro / login
- Supabase Auth email + contraseña. Al registrarse elige rol: Cliente o Trabajador. Crear fila en `perfiles` (y en `trabajadores` si aplica) en la misma transacción lógica.
- Campos cliente: nombre, celular, zona (select), dirección.
- Campos trabajador: nombre, celular, DNI (8 dígitos), zona, servicios (multi), tarifa por hora (S/ 5-100), experiencia, antecedentes (vigente / en trámite / no), 2 referencias, foto (Storage bucket `fotos`, público de lectura), aceptación de verificación.
- Zonas fijas: Iquitos centro, Punchana, Belén, San Juan Bautista, Moronacocha, Versalles / Sachachorro, Nanay / Bellavista, Quistococha, Otra.
- Servicios fijos: Casas y departamentos, Oficinas y comercios, Hospedajes / Airbnb, Limpieza profunda / post fiesta, Lavado y planchado, Post construcción.

### Cliente
1. **Buscar** (`/buscar`): lista de `v_trabajadores_publicos` con filtros zona, servicio, "solo disponibles ahora", orden por rating_avg desc y luego trabajos_completados. Tarjeta: foto, nombre, zona, rating (estrellas + n), tarifa/h, chip "Disponible ahora" verde, servicios.
2. **Perfil trabajador** (`/t/:id`): datos públicos + últimas 5 calificaciones con comentario.
3. **Reservar**: servicio, fecha, hora, horas (2-12), dirección, zona, notas, método de pago (Yape / Plin / efectivo). Pregunta "¿Tu espacio tiene materiales de limpieza?" → Sí / No. Si No: opción A "La trabajadora trae su kit" (+S/ 18; solo se muestran trabajadoras con `kit_propio = true`) u opción B "Quiero comprar un kit que quede en mi casa" (muestra lista de kit básico y texto "Coordinamos la entrega por WhatsApp"; sin cobro en la app). Campos nuevos por migración: `trabajadores.kit_propio boolean default false`, `reservas.con_materiales boolean`, `reservas.recargo_materiales numeric default 0`. Del recargo, S/ 13 van a la trabajadora y S/ 5 a Limpi (reflejar en Ganancias). Mostrar total = tarifa × horas + recargo. Limpi no maneja inventario ni local.
   - **Kit a crédito (opción C)**: tabla `prestamos_kit (id, trabajador_id, monto numeric, saldo numeric, codigo_retiro text unique, bodega text, estado: emitido|retirado|pagado|perdida, creado_en)`. Admin emite la orden desde `/admin` (genera `codigo_retiro` de 8 caracteres y lo muestra como QR); solo si el trabajador tiene `verificado=true`, `trabajos_completados >= 2` y `rating_avg >= 4.5`; máximo 10 préstamos con estado emitido/retirado en total. Al completar una reserva, un trigger descuenta del `saldo` S/ 13 si `con_materiales` o S/ 10 si no, hasta llegar a 0 (entonces estado `pagado`). El panel de Ganancias del trabajador muestra el saldo pendiente y cuánto se descontó en cada servicio. Inserta en `reservas` con `estado='solicitada'` y `tarifa_hora` copiada del trabajador.
4. **Mis reservas** (`/reservas`): lista por estado con acciones: cancelar (solo si solicitada/aceptada), calificar (solo si completada y aún no calificó).
5. Notificación: al cambiar estado de una reserva (Realtime), toast en pantalla. Botón "Escribir por WhatsApp" a la trabajadora usando `wa.me/51<celular>` una vez aceptada.

### Trabajador
1. **Panel** (`/panel`): toggle grande "Disponible ahora" (actualiza `trabajadores.disponible_ahora` y `ultima_actividad`). Si el trabajador no está verificado, mostrar aviso "Tu perfil está en revisión" y ocultar el toggle.
2. **Solicitudes**: reservas `solicitada` en tiempo real (Realtime en `reservas` filtrado por `trabajador_id`). Acciones: Aceptar → `aceptada`; Rechazar → `rechazada`. Sonido/vibración al llegar una nueva.
3. **Control del servicio (tipo taxi)**: estados `aceptada` → `en_camino` → `en_curso` → `completada`. En camino → `en_camino_en` + activa GPS real (lat/lng, solo mientras dure este estado, sin mapa propio: se usa link externo a Google Maps); "Ya llegué" → `hora_llegada`; Iniciar servicio → `en_curso` + `inicio_real` + `fin_estimado` (calculado server-side); alertas en pantalla (no push) 15 min antes y al llegar a `fin_estimado`; Finalizar → `completada` + `fin_real`. Luego puede calificar al cliente.
4. **Ganancias**: suma de `total` de completadas por semana y mes, y neto = total × (1 − comision_pct/100).
5. **Mi perfil**: editar tarifa, servicios, descripción, foto.

### Admin (`/admin`, solo rol admin)
- Lista de trabajadores con `verificado=false`: ver todos los datos, botón Verificar / Rechazar. Rol admin se asigna a mano en Supabase (`update perfiles set rol='admin' where id=...`).
- Métricas simples: trabajadores verificados, disponibles ahora, reservas por estado esta semana, tasa de aceptación, ingreso por comisión.

## Asignación de trabajos (flujo principal, tipo Uber híbrido)
La trabajadora acepta primero; el cliente elige entre las que aceptaron.

1. Cliente crea pedido (`reservas.estado='solicitada'`, `trabajador_id` NULL, `modo='abierto'`). Migración: hacer `trabajador_id` nullable y agregar `modo text check (modo in ('abierto','directo'))`, `elegir_por_mi boolean default false`, `ventana_cierra_en timestamptz`.
2. Tabla nueva `candidaturas (id, reserva_id, trabajador_id, creado_en, estado: pendiente|elegida|liberada, unique(reserva_id, trabajador_id))`. Realtime: toda trabajadora con `disponible_ahora`, `verificado`, misma zona (o vecina) y el servicio en `servicios` ve el pedido en su panel con: zona, servicio, horas, con_materiales y **pago neto** (tarifa_hora propia × horas − comisión + S/ 13 si con_materiales). NO ve dirección ni nombre del cliente.
3. "Acepto" inserta candidatura. Máximo 3 candidaturas `pendiente` por reserva (validar con trigger); la ventana cierra a los 10 min (`ventana_cierra_en`) o al llegar a 3.
4. Cliente ve candidatas (foto, rating, trabajos, tarifa, distancia por zona) y elige → `reservas.trabajador_id`, `tarifa_hora` copiada de la elegida, `estado='aceptada'`, candidatura `elegida`, las demás `liberada`. Si `elegir_por_mi=true`, una Edge Function asigna automáticamente a la primera candidata con mejor `rating_avg`.
5. Confirmada: ambos ven dirección y botón WhatsApp.
6. Sin candidatas a los 10 min: reenviar a todas las zonas (flag `zona_ampliada`); a los 20 min mostrar al cliente "Nadie disponible ahora, ¿programamos para otra hora?".
7. Modo `directo`: el cliente manda el pedido a una trabajadora específica desde su perfil; ella acepta/rechaza en 15 min; si no responde, ofrecer pasar a modo abierto.
8. Cancelaciones: trabajadora que cancela una reserva `aceptada` suma en `trabajadores.cancelaciones_30d`; al llegar a 3 → `pausado_hasta = now() + 7 días` (no aparece en búsquedas). Cliente que cancela con estado `en_camino` (nuevo estado) genera cargo de S/ 10 registrado en la reserva como `penalidad_cliente`.
9. Rechazar o ignorar un pedido abierto no penaliza.

## Reglas de negocio
- Un trabajador no puede aceptar dos reservas que se solapen en fecha/hora (validar en cliente y con constraint o trigger en migración nueva).
- `disponible_ahora` se apaga automáticamente si `ultima_actividad` tiene más de 8 horas (hacerlo en el query de búsqueda: `disponible_ahora and ultima_actividad > now() - interval '8 hours'`).
- Los precios los fija cada trabajador. La plataforma no impone tarifa ni horario (importante legalmente en Perú).
- Comisión 20% por defecto, configurable por reserva desde admin.
- Pago en el piloto: manual (Yape/Plin/efectivo). Admin marca `pago_confirmado`.

## Calidad
- Sin librerías de UI pesadas. Componentes propios con Tailwind.
- Estados vacíos con texto útil ("Aún no hay trabajadoras en Belén. Prueba con Iquitos centro").
- Errores de Supabase traducidos al español.
- Tests mínimos con Vitest: cálculo de total, validación de DNI/celular, solapamiento de reservas.
- README con: crear proyecto Supabase, correr `schema.sql`, crear bucket `fotos`, configurar `.env`, `npm run dev`, deploy en Vercel.

## Fuera de alcance (no construir)
Pasarela de pago, mapa propio/interactivo (con librerías pesadas), chat interno, notificaciones push, app nativa.

Excepción explícita: sí está en alcance capturar la ubicación GPS real (lat/lng) del trabajador mientras el estado de una reserva es `en_camino`, para trazabilidad y para que el cliente vea que va en camino. Esto no es "mapa propio": no se agrega ninguna librería de mapas, la ubicación se muestra como texto ("actualizado hace X min") y opcionalmente un link externo a Google Maps.
