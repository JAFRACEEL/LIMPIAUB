-- Limpi: revalida elegibilidad al asignar, agrega contacto del cliente para
-- la trabajadora (WhatsApp simétrico tras confirmar), y permite deshacer un
-- registro pendiente que falló a medio completar.
-- Idempotente.

-- ---------- Revalida elegibilidad también al aceptar una solicitud
-- directa (elegir_candidata ya lo valida antes de asignar, pero el "Aceptar"
-- de una solicitud directa solo pasaba por este mismo trigger sin chequear
-- habilitado_trabajar ni kit_propio). ----------
create or replace function fn_validar_solapamiento() returns trigger language plpgsql as $$
declare
  v_trabajador trabajadores%rowtype;
begin
  if new.estado = 'aceptada' and new.modo = 'directo'
     and new.ventana_cierra_en is not null and new.ventana_cierra_en < now()
     and old.estado is distinct from new.estado then
    raise exception 'Esta solicitud directa ya venció; pídele a la clienta que reserve de nuevo';
  end if;

  if new.estado = 'aceptada' and new.trabajador_id is not null
     and (old.estado is distinct from new.estado or old.trabajador_id is distinct from new.trabajador_id) then
    select * into v_trabajador from trabajadores where id = new.trabajador_id;
    if not found or not v_trabajador.habilitado_trabajar then
      raise exception 'No estás habilitada para aceptar este servicio';
    end if;
    if new.con_materiales and not v_trabajador.kit_propio then
      raise exception 'Este pedido requiere que lleves tu propio kit de limpieza';
    end if;

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

-- ---------- Permite borrar el propio perfil (o el de un admin), para poder
-- deshacer un alta que quedó a medias cuando falla la parte de trabajadores.
drop policy if exists perfiles_delete on perfiles;
create policy perfiles_delete on perfiles for delete using (auth.uid() = id or mi_rol() = 'admin');

-- ---------- Vista de contacto del cliente para la trabajadora asignada
-- (simétrica a v_trabajador_contacto), para el botón de WhatsApp que ambas
-- partes deben tener tras confirmar la reserva. ----------
create or replace view v_cliente_contacto as
select p.id, p.nombre, p.telefono
from perfiles p
where exists (select 1 from reservas r where r.cliente_id = p.id and r.trabajador_id = auth.uid());

-- ---------- elegir_candidata: revalida que la trabajadora siga habilitada
-- (por si un admin le quitó la verificación o rechazó su estatus migratorio
-- después de que se postuló, mientras la clienta todavía no elegía). ----------
create or replace function elegir_candidata(p_reserva_id uuid, p_trabajador_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reserva reservas%rowtype;
  v_trabajador trabajadores%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;

  select * into v_reserva from reservas where id = p_reserva_id for update;
  if not found or v_reserva.cliente_id is distinct from auth.uid() then
    raise exception 'No tienes permiso para elegir en esta reserva';
  end if;
  if v_reserva.estado <> 'solicitada' or v_reserva.trabajador_id is not null then
    raise exception 'Esta reserva ya fue asignada';
  end if;

  if not exists (
    select 1 from candidaturas where reserva_id = p_reserva_id
      and trabajador_id = p_trabajador_id and estado = 'pendiente'
  ) then
    raise exception 'Esa candidatura ya no está disponible';
  end if;

  select * into v_trabajador from trabajadores where id = p_trabajador_id;
  if not found or not v_trabajador.habilitado_trabajar then
    raise exception 'Esa trabajadora ya no está habilitada para tomar este servicio';
  end if;
  if v_reserva.con_materiales and not v_trabajador.kit_propio then
    raise exception 'Esa trabajadora ya no ofrece llevar su propio kit de limpieza';
  end if;

  update reservas set trabajador_id = p_trabajador_id, tarifa_hora = v_trabajador.tarifa_hora, estado = 'aceptada'
    where id = p_reserva_id;

  update candidaturas set estado = 'elegida'
    where reserva_id = p_reserva_id and trabajador_id = p_trabajador_id;
  update candidaturas set estado = 'liberada'
    where reserva_id = p_reserva_id and trabajador_id <> p_trabajador_id and estado = 'pendiente';
end $$;

revoke all on function elegir_candidata(uuid, uuid) from public;
grant execute on function elegir_candidata(uuid, uuid) to authenticated;

-- ---------- v_pedidos_abiertos: ya no ofrecer "Acepto" en pedidos que ya
-- llegaron a las 3 candidaturas (fn_limitar_candidaturas los va a rechazar
-- igual, pero mejor no mostrarlos como disponibles). ----------
create or replace view v_pedidos_abiertos as
select r.id, r.servicio, r.zona, r.fecha, r.hora, r.horas, r.con_materiales,
       r.recargo_materiales, r.comision_pct, r.ventana_cierra_en, r.zona_ampliada, r.creado_en
from reservas r
join trabajadores t on t.id = auth.uid()
where r.estado = 'solicitada'
  and r.modo = 'abierto'
  and r.trabajador_id is null
  and (r.ventana_cierra_en is null or r.ventana_cierra_en > now())
  and t.disponible_ahora
  and t.habilitado_trabajar
  and r.servicio = any(t.servicios)
  and (r.zona = any(t.zonas) or r.zona_ampliada)
  and (not r.con_materiales or t.kit_propio)
  and not exists (select 1 from candidaturas c where c.reserva_id = r.id and c.trabajador_id = auth.uid())
  and (select count(*) from candidaturas c2 where c2.reserva_id = r.id and c2.estado = 'pendiente') < 3;
