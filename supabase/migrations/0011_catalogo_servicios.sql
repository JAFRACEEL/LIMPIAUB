-- Limpi: catálogo de servicios ampliado (limpieza + mantenimiento del hogar),
-- con subtipo elegido, descripción del trabajo y foto de referencia opcional
-- para los servicios de mantenimiento.
-- Idempotente.

alter table reservas add column if not exists subtipo_servicio text;
alter table reservas add column if not exists descripcion_trabajo text;
alter table reservas add column if not exists foto_referencia_ruta text;

-- ---------- Remapeo best-effort: los nombres de servicio cambiaron. Sin
-- esto, las trabajadoras que ya eligieron servicios con los nombres viejos
-- dejarían de calzar con los pedidos nuevos. ----------
update trabajadores t set servicios = (
  select array_agg(distinct valor) from (
    select unnest(
      case elem
        when 'Casas y departamentos' then array['Limpieza básica del hogar']
        when 'Oficinas y comercios' then array['Limpieza de oficinas y comercios']
        when 'Hospedajes / Airbnb' then array['Limpieza de alojamientos y Airbnb']
        when 'Limpieza profunda / post fiesta'
          then array['Limpieza y reorganización profunda', 'Limpieza postevento o postfiesta']
        when 'Post construcción' then array['Limpieza postobra pesada']
        else array[elem]
      end
    ) as valor
    from unnest(t.servicios) as elem
  ) mapeado
)
where exists (
  select 1 from unnest(t.servicios) as e
  where e in (
    'Casas y departamentos', 'Oficinas y comercios', 'Hospedajes / Airbnb',
    'Limpieza profunda / post fiesta', 'Post construcción'
  )
);

update reservas set servicio = case servicio
  when 'Casas y departamentos' then 'Limpieza básica del hogar'
  when 'Oficinas y comercios' then 'Limpieza de oficinas y comercios'
  when 'Hospedajes / Airbnb' then 'Limpieza de alojamientos y Airbnb'
  when 'Limpieza profunda / post fiesta' then 'Limpieza y reorganización profunda'
  when 'Post construcción' then 'Limpieza postobra pesada'
  else servicio
end
where servicio in (
  'Casas y departamentos', 'Oficinas y comercios', 'Hospedajes / Airbnb',
  'Limpieza profunda / post fiesta', 'Post construcción'
);

-- ---------- Storage: la trabajadora asignada (o la propia clienta, o un
-- admin) puede ver la foto de referencia que subió la clienta para un
-- trabajo de mantenimiento, aunque esté en la carpeta de la clienta y no en
-- la suya. ----------
-- v_pedidos_abiertos y v_mis_postulaciones también deben mostrar el subtipo,
-- la descripción del trabajo y la foto de referencia (para mantenimiento),
-- para que la trabajadora pueda decidir si postularse con esa información.
-- Las columnas nuevas van al final del select: CREATE OR REPLACE VIEW no
-- admite insertar columnas en medio de las que ya existían (falla con
-- "cannot change name of view column").
create or replace view v_pedidos_abiertos as
select r.id, r.servicio, r.zona, r.fecha, r.hora, r.horas, r.con_materiales,
       r.recargo_materiales, r.comision_pct, r.ventana_cierra_en, r.zona_ampliada, r.creado_en,
       r.subtipo_servicio, r.descripcion_trabajo, r.foto_referencia_ruta
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
       r.subtipo_servicio, r.descripcion_trabajo, r.foto_referencia_ruta
from candidaturas c
join reservas r on r.id = c.reserva_id
where c.trabajador_id = auth.uid() and c.estado = 'pendiente';

-- Autorización centralizada para leer una foto de referencia. Hace falta una
-- función security definer (no una subconsulta directa en la política de
-- storage) por dos razones:
-- 1) Sin validar que la ruta esté dentro de la carpeta de la propia clienta
--    de esa reserva, cualquiera podría poner en `foto_referencia_ruta` la
--    ruta de un archivo ajeno (DNI, antecedentes, CV) y dárselo a leer a la
--    trabajadora que le asigne.
-- 2) Una trabajadora que todavía no fue asignada (pedido abierto) no pasa el
--    RLS de `reservas` (res_select), así que una subconsulta común nunca la
--    encontraría; security definer evita ese problema.
create or replace function puede_ver_foto_referencia(p_ruta text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_reserva reservas%rowtype;
begin
  if p_ruta is null or auth.uid() is null then
    return false;
  end if;

  select * into v_reserva from reservas where foto_referencia_ruta = p_ruta;
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

-- Sin esto, una trabajadora asignada podría usar la política de update de
-- reservas (ya existente, sin restricción de columnas) para cambiarle el
-- cliente_id y la foto_referencia_ruta a SU PROPIA reserva y, gracias a
-- puede_ver_foto_referencia() de arriba, leer el archivo privado de
-- cualquier otra persona con solo adivinar o conocer su ruta.
create or replace function fn_proteger_reserva() returns trigger language plpgsql as $$
begin
  if new.cliente_id is distinct from old.cliente_id then
    raise exception 'No se puede cambiar la clienta de una reserva';
  end if;
  if new.foto_referencia_ruta is distinct from old.foto_referencia_ruta
     and auth.uid() is distinct from old.cliente_id and mi_rol() is distinct from 'admin' then
    raise exception 'Solo la clienta puede cambiar la foto de referencia';
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_reserva on reservas;
create trigger trg_proteger_reserva before update on reservas
  for each row execute function fn_proteger_reserva();

drop policy if exists documentos_select_foto_referencia on storage.objects;
create policy documentos_select_foto_referencia on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and puede_ver_foto_referencia(name));
