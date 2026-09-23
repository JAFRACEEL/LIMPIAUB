-- Limpi: permite que el panel de la trabajadora recupere sus postulaciones
-- pendientes al recargar la página (antes solo vivían en memoria del
-- componente y desaparecían, junto con el pedido, hasta que se resolvían).
-- Idempotente.

create or replace view v_mis_postulaciones as
select r.id, r.servicio, r.zona, r.fecha, r.hora, r.horas, r.con_materiales,
       r.recargo_materiales, r.comision_pct, r.ventana_cierra_en, r.zona_ampliada, r.creado_en,
       c.creado_en as postulado_en
from candidaturas c
join reservas r on r.id = c.reserva_id
where c.trabajador_id = auth.uid() and c.estado = 'pendiente';
