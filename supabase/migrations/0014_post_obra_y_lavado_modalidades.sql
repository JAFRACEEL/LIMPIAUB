-- Limpi: "Limpieza post obra" (modalidades pesada / fina) y "Lavado y
-- planchado" (en domicilio / recojo y entrega). Las respuestas a las
-- preguntas propias de cada servicio y las fotos de referencia viajan en
-- reservas.detalles_servicio (jsonb):
--   { "respuestas": [{ "etiqueta": "...", "valor": "..." }], "fotos": ["<ruta>", ...] }
-- Idempotente.

alter table reservas add column if not exists detalles_servicio jsonb;

-- ---------- Remapeo: "Limpieza postobra pesada" pasa a ser "Limpieza post
-- obra" (con dos modalidades). Sin esto, las trabajadoras que ya tenían el
-- servicio elegido dejarían de calzar con los pedidos nuevos (el cruce es
-- por nombre exacto). ----------
update trabajadores
   set servicios = array_replace(servicios, 'Limpieza postobra pesada', 'Limpieza post obra')
 where 'Limpieza postobra pesada' = any(servicios);

update reservas
   set servicio = 'Limpieza post obra'
 where servicio = 'Limpieza postobra pesada';

-- ---------- Vistas de la trabajadora: mismas columnas de 0012 / 0011 y
-- detalles_servicio al final (CREATE OR REPLACE VIEW no admite insertar
-- columnas en medio). Se excluye la clave 'privado' (nombre, celular y
-- dirección de entrega del recojo): son datos personales que solo ve la
-- trabajadora ya asignada, igual que la dirección y el nombre del cliente. ----------
create or replace view v_pedidos_abiertos as
select r.id, r.servicio, r.zona, r.fecha, r.hora, r.horas, r.con_materiales,
       r.recargo_materiales, r.comision_pct, r.ventana_cierra_en, r.zona_ampliada, r.creado_en,
       r.subtipo_servicio, r.descripcion_trabajo, r.foto_referencia_ruta,
       r.detalles_servicio - 'privado' as detalles_servicio
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

create or replace view v_mis_postulaciones as
select r.id, r.servicio, r.zona, r.fecha, r.hora, r.horas, r.con_materiales,
       r.recargo_materiales, r.comision_pct, r.ventana_cierra_en, r.zona_ampliada, r.creado_en,
       c.creado_en as postulado_en,
       r.subtipo_servicio, r.descripcion_trabajo, r.foto_referencia_ruta,
       r.detalles_servicio - 'privado' as detalles_servicio
from candidaturas c
join reservas r on r.id = c.reserva_id
where c.trabajador_id = auth.uid() and c.estado = 'pendiente';

-- ---------- Storage: la misma autorización de 0011 (definición vigente),
-- ahora también para las fotos adicionales guardadas en
-- detalles_servicio->'fotos'. Se mantiene la validación de que la ruta esté
-- dentro de la carpeta de la propia clienta de esa reserva. ----------
create or replace function puede_ver_foto_referencia(p_ruta text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_reserva reservas%rowtype;
begin
  if p_ruta is null or auth.uid() is null then
    return false;
  end if;

  select * into v_reserva
  from reservas
  where foto_referencia_ruta = p_ruta
     or (jsonb_typeof(detalles_servicio->'fotos') = 'array'
         and jsonb_exists(detalles_servicio->'fotos', p_ruta))
  limit 1;
  if not found then
    return false;
  end if;

  if (string_to_array(p_ruta, '/'))[1] is distinct from v_reserva.cliente_id::text then
    return false;
  end if;

  if v_reserva.cliente_id = auth.uid() or v_reserva.trabajador_id = auth.uid() or mi_rol() = 'admin' then
    return true;
  end if;

  if exists (select 1 from candidaturas c where c.reserva_id = v_reserva.id and c.trabajador_id = auth.uid()) then
    return true;
  end if;

  if v_reserva.estado = 'solicitada' and v_reserva.modo = 'abierto' and v_reserva.trabajador_id is null then
    return exists (
      select 1 from trabajadores t
      where t.id = auth.uid()
        and t.disponible_ahora and t.habilitado_trabajar
        and v_reserva.servicio = any(t.servicios)
        and (v_reserva.zona = any(t.zonas) or v_reserva.zona_ampliada)
    );
  end if;

  return false;
end $$;

revoke all on function puede_ver_foto_referencia(text) from public;
grant execute on function puede_ver_foto_referencia(text) to authenticated;

-- ---------- Solo la clienta (o un admin) puede cambiar detalles_servicio.
-- Trigger aparte para no reemplazar fn_proteger_reserva (migración 0012,
-- máquina de estados). Sin esto, la trabajadora asignada podría reescribir
-- las respuestas o la lista de fotos de la reserva. ----------
create or replace function fn_proteger_detalles_servicio() returns trigger language plpgsql as $$
begin
  if new.detalles_servicio is distinct from old.detalles_servicio
     and auth.uid() is distinct from old.cliente_id
     and mi_rol() is distinct from 'admin' then
    raise exception 'Solo la clienta puede cambiar los detalles del servicio';
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_detalles_servicio on reservas;
create trigger trg_proteger_detalles_servicio before update on reservas
  for each row execute function fn_proteger_detalles_servicio();
