-- Limpi: cierra fugas de datos personales y corrige condiciones de carrera /
-- reglas de negocio encontradas en revisión de código.
-- Idempotente.

-- ---------- 1) perfiles: ya no es público. Antes cualquiera (incluso sin
-- sesión) podía leer nombre, celular y dirección de cualquier persona. ----------
drop policy if exists perfiles_select on perfiles;
create policy perfiles_select on perfiles for select
  using (auth.uid() = id or mi_rol() = 'admin');

-- ---------- 2) trabajadores: una vez verificada, exponía TODAS sus columnas
-- por la API pública (DNI/pasaporte, estatus migratorio, celulares de sus
-- referencias, etc.). Ahora solo la propia persona y un admin. La búsqueda y
-- el perfil público siguen funcionando porque v_trabajadores_publicos /
-- v_pedidos_abiertos corren con permisos del dueño de la vista y filtran a
-- mano las columnas seguras. ----------
drop policy if exists trab_select on trabajadores;
create policy trab_select on trabajadores for select
  using (auth.uid() = id or mi_rol() = 'admin');

-- ---------- Vista: datos de contacto de una trabajadora, solo visibles para
-- la clienta que tiene (o tuvo) una reserva o candidatura con ella. Reemplaza
-- los embeds directos contra `trabajadores`/`perfiles` que dejaban de
-- funcionar al cerrar las políticas de arriba. ----------
create or replace view v_trabajador_contacto as
select t.id, p.nombre, p.telefono, p.foto_url, t.rating_avg, t.rating_n,
       t.tarifa_hora, t.trabajos_completados
from trabajadores t
join perfiles p on p.id = t.id
where exists (select 1 from reservas r where r.trabajador_id = t.id and r.cliente_id = auth.uid())
   or exists (
        select 1 from candidaturas c join reservas r on r.id = c.reserva_id
        where c.trabajador_id = t.id and r.cliente_id = auth.uid()
      );

-- ---------- Vista: calificaciones con el nombre de quien calificó, sin
-- exponer el resto de su perfil (celular, dirección). ----------
create or replace view v_calificaciones_publicas as
select c.id, c.reserva_id, c.para_id, c.estrellas, c.comentario, c.creado_en, p.nombre as de_nombre
from calificaciones c
join perfiles p on p.id = c.de_id;

-- ---------- 3) Condición de carrera: dos clientas podían elegir a la misma
-- trabajadora para horarios cruzados al mismo tiempo, porque cada validación
-- de solapamiento solo bloqueaba su propia fila. Un lock por trabajadora
-- serializa cualquier intento simultáneo de confirmarla. ----------
create or replace function fn_validar_solapamiento() returns trigger language plpgsql as $$
begin
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

-- ---------- 4) Nadie debe poder postularse (ni seguir viendo el pedido)
-- después de que cerró la ventana de 10 minutos. ----------
create or replace function postularme_a_reserva(p_reserva_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_trabajador trabajadores%rowtype;
  v_reserva reservas%rowtype;
begin
  if auth.uid() is null or mi_rol() is distinct from 'trabajador' then
    raise exception 'Solo una trabajadora puede postularse';
  end if;

  select * into v_trabajador from trabajadores where id = auth.uid();
  if not found or not v_trabajador.habilitado_trabajar or not v_trabajador.disponible_ahora then
    raise exception 'Debes estar habilitada y disponible para postularte';
  end if;

  select * into v_reserva from reservas where id = p_reserva_id
    for update;
  if not found or v_reserva.estado <> 'solicitada' or v_reserva.modo <> 'abierto'
     or v_reserva.trabajador_id is not null then
    raise exception 'Esta reserva ya no está disponible';
  end if;

  if v_reserva.ventana_cierra_en is not null and v_reserva.ventana_cierra_en < now() then
    raise exception 'La ventana para postularse a este pedido ya cerró';
  end if;

  if not (v_reserva.servicio = any(v_trabajador.servicios)) then
    raise exception 'No ofreces ese servicio';
  end if;
  if not (v_reserva.zona = any(v_trabajador.zonas) or v_reserva.zona_ampliada) then
    raise exception 'Esa zona no es una de tus zonas de atención';
  end if;
  if v_reserva.con_materiales and not v_trabajador.kit_propio then
    raise exception 'Este pedido requiere que lleves tu propio kit de limpieza';
  end if;

  insert into candidaturas (reserva_id, trabajador_id) values (p_reserva_id, auth.uid());
end $$;

revoke all on function postularme_a_reserva(uuid) from public;
grant execute on function postularme_a_reserva(uuid) to authenticated;

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
  and not exists (select 1 from candidaturas c where c.reserva_id = r.id and c.trabajador_id = auth.uid());
