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
