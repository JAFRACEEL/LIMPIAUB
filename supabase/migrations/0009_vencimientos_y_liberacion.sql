-- Limpi: hace cumplir el vencimiento de las solicitudes directas (15 min) y
-- libera las candidaturas pendientes cuando una reserva abierta se cancela o
-- rechaza, para que no queden "colgadas" en el panel de la trabajadora.
-- Idempotente.

create or replace function fn_validar_solapamiento() returns trigger language plpgsql as $$
begin
  if new.estado = 'aceptada' and new.modo = 'directo'
     and new.ventana_cierra_en is not null and new.ventana_cierra_en < now()
     and old.estado is distinct from new.estado then
    raise exception 'Esta solicitud directa ya venció; pídele a la clienta que reserve de nuevo';
  end if;

  if new.estado = 'aceptada' and new.trabajador_id is not null
     and (old.estado is distinct from new.estado or old.trabajador_id is distinct from new.trabajador_id) then
    perform pg_advisory_xact_lock(hashtext(new.trabajador_id::text));
    if exists (
      select 1 from reservas r2
      where r2.trabajador_id = new.trabajador_id
        and r2.id <> new.id
        and r2.estado in ('aceptada','en_curso')
        and ((r2.fecha + r2.hora)::timestamp, (r2.fecha + r2.hora)::timestamp + (r2.horas || ' hours')::interval)
          overlaps
            ((new.fecha + new.hora)::timestamp, (new.fecha + new.hora)::timestamp + (new.horas || ' hours')::interval)
    ) then
      raise exception 'Esa trabajadora ya tiene una reserva que se cruza con este horario';
    end if;
  end if;
  return new;
end $$;

-- ---------- Libera candidaturas pendientes cuando la reserva ya no sigue abierta ----------
-- security definer: quien cancela normalmente es la clienta, que no tiene
-- permiso de UPDATE sobre candidaturas (solo se tocan vía funciones). Sin
-- esto, el UPDATE de abajo no afecta ninguna fila por RLS, sin ni siquiera
-- avisar del error.
create or replace function fn_liberar_candidaturas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado in ('cancelada','rechazada') and old.estado is distinct from new.estado then
    update candidaturas set estado = 'liberada'
      where reserva_id = new.id and estado = 'pendiente';
  end if;
  return new;
end $$;

drop trigger if exists trg_liberar_candidaturas on reservas;
create trigger trg_liberar_candidaturas after update on reservas
  for each row execute function fn_liberar_candidaturas();

-- v_mis_postulaciones filtra por candidaturas.estado = 'pendiente' (no por el
-- estado de la reserva), así que con el trigger de arriba liberándolas al
-- cancelar/rechazar, una reserva cancelada desaparece sola de esa vista sin
-- tener que recrearla. v_pedidos_abiertos ya filtraba por reservas.estado.
