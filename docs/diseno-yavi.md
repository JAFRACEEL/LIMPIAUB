# Identidad y sistema de diseño YAVI

La app se presenta como **YAVI — «Servicios a tu alcance»**. Conecta clientes con personas que ofrecen servicios (limpieza, gasfitería, electricidad, pintura, mantenimiento, traslado de objetos y más). Que la marca sea amplia **no habilita** categorías nuevas: lo contratable sigue decidiéndolo `estadoServicio` (flags y cobertura).

## Marca
- Originales intactos: `brand/originales/yavi-logo-original.jpg` y `yavi-icono-original.jpg`. No se redibujan ni se recortan.
- Copias de trabajo servidas por la web: `public/brand/` (`yavi-logo.jpg`, `yavi-icono.jpg`) y los íconos de la app generados solo por reescalado (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-64.png`).
- Componente `src/components/Logo.tsx` (`variante="completo" | "icono"`). Lleva `width`/`height` reales para que nunca se deforme y `mix-blend-multiply` para fundir el blanco del archivo con el fondo.
- Textos visibles: «YAVI». Se conservaron identificadores internos (`limpi-v2` del service worker, claves de almacenamiento, variables de entorno, tablas y RPC).

## Tokens (`src/index.css`, bloque `@theme`)
- `brand-50…950`: naranja YAVI. `brand-700` (#c2410c) es el color de texto/enlace sobre fondo claro (5.2:1). `brand-500` es el naranja del logo para acentos. `brand-ink` (#3b0f03) es la tinta oscura cálida para texto sobre el naranja claro.
- `navy-50…950`: azul profundo (títulos de apoyo, avisos informativos, pantalla de llamada).
- `neutral-*`: neutros cálidos (piedra). El fondo de página es `--yavi-lienzo`.
- `rounded-lg…3xl` y `shadow-xs…xl` redefinidos: radios generosos, sombra difusa tibia y reflejo interior superior (claymorphism moderado).
- Como la app ya usaba esas clases, el estilo llega a todas las pantallas sin tocarlas una por una.

## Piezas compartidas
- CSS: `.yavi-tarjeta`, `.yavi-categoria` + `.yavi-burbuja` (la pieza más expresiva), `.yavi-boton-secundario`, `.yavi-aviso[data-tipo]`, `.yavi-esqueleto`. Todo elemento con `bg-brand-700` toma el naranja cálido de arcilla (degradado #ff8a2b → #ec5f10) con texto `brand-ink`.
- React: `src/components/ui.tsx` (`Boton`, `Aviso`, `EstadoVacio`, `Cargando`), `Logo.tsx`, `IconoServicio.tsx` (íconos de línea con el mismo trazo; `tonoServicio` alterna naranja/azul).
- Estados: foco visible (`:focus-visible`), pulsación (`:active`), deshabilitado (`:disabled`), selección con borde y fondo `brand`. `prefers-reduced-motion` desactiva animaciones y transiciones.

## Qué no cambió
Reglas de negocio, validaciones, permisos, flujos, flags (`VITE_PROPUESTAS_ACTIVAS`, `ES_ENTORNO_PRUEBAS`), migraciones, backend ni despliegues. Los textos de las notificaciones push los arma el backend (funciones SQL / Edge Function): no se tocaron (ver sección «Textos Limpi que quedan»).

## Contraste (WCAG 2.1 AA)
Medido con un auditor sobre el DOM renderizado (390 px; fondo = peor tramo del degradado):

| Elemento | Texto / fondo | Relación | Mínimo |
|---|---|---|---|
| Botón principal, tramo claro | #3b0f03 sobre #ff8a2b | 7.11:1 | 4.5 |
| Botón principal, tramo oscuro | #3b0f03 sobre #ec5f10 | 4.95:1 | 4.5 |
| Pantalla de llamada (arriba / centro / abajo) | #3b0f03 sobre #ffa04a / #ff7a1a / #e8590c | 8.27 / 6.41 / 4.67:1 | 4.5 |
| «Acepto» (llamada) | #c2410c sobre blanco | 5.18:1 | 4.5 |
| Enlaces y texto de acento | #c2410c sobre blanco / sobre #fff5ec | 5.18:1 / 4.81:1 | 4.5 |
| Botones verdes (WhatsApp, confirmar) | blanco sobre #15803d | 5.02:1 | 4.5 |
| Texto secundario | #706860 sobre blanco / sobre las tarjetas crema más oscuras | 5.47:1 / 4.83:1 (mínimo medido) | 4.5 |

El blanco sobre el naranja cálido solo daba 2.4–3.4:1, por eso el texto de esos botones es la tinta oscura (no se usa sombra para compensar). Resultado del auditor: 0 textos bajo AA en inicio, ingreso, registro, pedido, búsqueda, mis servicios (con propuestas, presupuesto, adicional y calificación), cuenta, panel de la técnica y del oficio, llamada y admin. Las únicas relaciones por debajo de 4.5 son las estrellas de calificación (3.2:1): son un gráfico, no texto, y exigen 3:1; la calificación siempre va también escrita.

## Instalaciones existentes
Probado en un navegador con una instalación anterior (service worker `limpi-v1`, sesión iniciada y un pedido a medio escribir) que recibe el build nuevo en el mismo origen: el service worker pasa a `limpi-v2`, borra solo el caché viejo, el manifest sirve «YAVI — Servicios a tu alcance» con los íconos nuevos y el título y el favicon cambian tras una recarga. La sesión de Supabase y el borrador siguen presentes. En un iPhone, el nombre y el ícono de una app ya agregada a la pantalla de inicio los fija iOS al instalarla: hay que quitar el acceso directo y volver a agregarlo.

## Textos «Limpi» que quedan (y por qué)
- Frontend: ninguno visible. Quedan identificadores internos: paquete `limpi`, `limpi-v2`, `limpi.pedido.v1`, `limpi_*` (almacenamiento), el mensaje `limpi-navegar` entre service worker y app.
- Backend (no se tocó): `supabase/functions/send-push/index.ts` línea 1 (solo comentario) y `supabase/migrations/0015_experiencia_cliente.sql` línea 321, mensaje de error «Ese dato lo calcula Limpi y no se puede cambiar desde la app» (visible para quien intente alterar un importe). Cambiarlo exige una migración nueva que redefina `fn_proteger_economia()`, aplicada en LIMPIA y luego en producción. También `VAPID_SUBJECT=mailto:soporte@limpi.pe` (README) es un contacto técnico, no un texto visible.
- Otras guías: `CLAUDE.md`, `docs/pruebas-integracion.md` y `docs/experiencia-cliente.md` nombran «Limpi» como producto; los PDF de `docs/` también.

## Vista previa para el iPhone
`scripts/preview-yavi.ps1` (simulacro por defecto: valida, corre tsc y pruebas, compila en una carpeta temporal y muestra el comando; solo con `-Publicar` despliega). Usa solo `.env.test.local` (LIMPIA; rechaza otro proyecto), publica como vista previa de Vercel (nunca `--prod`) y apunta el alias `yavi-pruebas.vercel.app`, sin tocar `limpi-pruebas.vercel.app`. Mantiene las banderas actuales de la vista previa (`VITE_ENTORNO_PRUEBAS=si`, `VITE_PROPUESTAS_ACTIVAS=1`); no activa nada nuevo.

## Pantalla de inicio (splash) y entrada
- Vive en `index.html` (HTML y CSS en línea, se ve antes de que cargue la app): el ícono oficial con entrada elástica, resplandor, ondas, chispas, estrellitas y un destello que se repite. La app la oculta con `ocultarSplash()` (`src/lib/splash.ts`): permanece al menos 3,8 s (0,5 s con «reducir movimiento»), con un seguro de 12 s si la app no arranca.
- Al terminar, una persona sin sesión que entró por `/` cae en **Iniciar sesión** (una sola vez por carga, `src/App.tsx`). Tocar el logo lleva al Inicio para explorar; otras rutas (p. ej. `/pedir`) no se redirigen; quien tiene sesión no pasa por el login.
- Capturas: `docs/capturas-yavi/`.

## Publicación
- Vista previa de pruebas: `yavi-pruebas.vercel.app` (ver arriba).
- Producción: `limpi-fawn.vercel.app` (`vercel deploy --prod`, 2026-10-23). Usa el mismo proyecto Supabase del piloto (LIMPIA, con la 0015), sin `VITE_ENTORNO_PRUEBAS` ni `VITE_PROPUESTAS_ACTIVAS`, y conserva su `VITE_VAPID_PUBLIC_KEY`.
