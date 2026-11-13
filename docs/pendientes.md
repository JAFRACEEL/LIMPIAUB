# Pendientes del proyecto

## Billetera YAVI (futuro, NO implementar todavía)
El usuario quiere implementar posteriormente una billetera YAVI con una experiencia similar a Yape, para pagar a personas y negocios, no solamente los servicios de YAVI. El alcance previsto contempla enviar y recibir dinero, pagar mediante QR y consultar saldo y movimientos. Requiere definir la integración de pagos y su operación antes de implementarla.

Reglas mientras tanto:
- La pestaña del panel del profesional se llama "Ganancias" y así debe seguir.
- Las ganancias acumuladas no se presentan como dinero disponible para gastar.
- No se construyen cobros, recargas, transferencias ni retiros.

## Otros pendientes (ver también `docs/experiencia-cliente.md` y `docs/plan-despliegue-0015.md`)
- Pantalla de tarifas por servicio (`precios_profesional`) y de propuestas para el profesional.
- Datos reales de cobro (`DATOS_PAGO`: Yape, Plin, banco).
- KYC con Didit, disponibilidad configurable, penalidades por cancelación.
- Pruebas reales contra Postgres, revisión Codex y respaldo antes de producción.

## Confirmación de correo (código listo, falta activarla en Supabase)
Ver `docs/confirmacion-de-correo.md`: flujo, orden de configuración en Supabase (SMTP propio, Redirect URLs por app, plantillas, *Confirm email*) y qué probar en la vista previa.

Estado (2026-11-13): la confirmación ya está activa en LIMPIA con SMTP propio (Resend, `mail.frdinnovacion.com`) y plantillas en español; apps de clientes y profesional en vista previa. Tras la revisión de Codex se añadieron límites de nombre/dirección, «Completa tus datos» (cuenta confirmada sin perfil) y la reactivación única de avisos push para quien tenía suscripciones anteriores a la 0017. Falta: probar en vista previa, publicar `send-push` y las URL en `app_config`, y repetir SMTP/Redirect URLs/plantillas en el Supabase de producción.

## Despliegue en Vercel (tres proyectos, un repo)
- Cada proyecto de Vercel compila su app con `scripts/build-vercel.mjs` (lo llama `vercel.json`) según la variable `YAVI_APP` (`cliente` por defecto, `profesional`, `admin`) y publica `dist`. Proyecto `limpi` = cliente; proyecto `yavi-pro` = profesional (`YAVI_APP=profesional`).
- El build **falla con un mensaje claro** si falta `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` o `VITE_VAPID_PUBLIC_KEY` (sin la clave de push la app queda sin poder activar notificaciones). Se comprueba en `vite.config.ts`.
- Variables en Vercel: `limpi` Production = las de producción (no tocar); `limpi` Preview y `yavi-pro` Production/Preview = LIMPIA (piloto) + `VITE_ENTORNO_PRUEBAS=si` + `VITE_PROPUESTAS_ACTIVAS=1`. Cuando exista el proyecto Supabase de producción para la app Profesional, cambiar las de Production de `yavi-pro` (y quitar `VITE_ENTORNO_PRUEBAS`).
- `limpi-pruebas.vercel.app` redirige (302) a `yavi-pruebas.vercel.app` (`deploy/limpi-pruebas-redirect/`), para que nadie se suscriba a avisos desde el origen viejo.
