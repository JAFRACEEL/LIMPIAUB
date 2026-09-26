-- Limpi: disponibilidad y control del prestador tipo taxi.
-- Nuevo estado 'en_camino', columnas de control de tiempos (llegada, inicio
-- real, fin estimado/real) y ubicación GPS real (solo mientras 'en_camino').
-- Idempotente.

-- ---------- estado: de enum a text+check, para poder agregar 'en_camino'
-- sin el problema de "unsafe use of new value of enum type" (Postgres no
-- deja usar un valor de enum recién agregado dentro de la misma
-- transacción en la que se agregó, y el SQL Editor de Supabase corre todo
-- el script pegado como una sola transacción). ----------
-- v_pedidos_abiertos filtra por r.estado en su WHERE: Postgres no deja
-- cambiar el tipo de una columna mientras una vista dependa de ella, así
-- que hay que soltarla antes y recrearla después (con el mismo texto de la
-- migración 0011, que es su versión vigente).
drop view if exists v_pedidos_abiertos;

alter table reservas alter column estado type text using estado::text;
alter table reservas alter column estado set default 'solicitada';
alter table reservas drop constraint if exists reservas_estado_check;
alter table reservas add constraint reservas_estado_check
  check (estado in ('solicitada','aceptada','en_camino','en_curso','completada','cancelada','rechazada'));
drop type if exists estado_reserva;

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

-- ---------- Columnas de control de tiempos y ubicación ----------
alter table reservas add column if not exists en_camino_en timestamptz;
alter table reservas add column if not exists hora_llegada timestamptz;
alter table reservas add column if not exists fin_estimado timestamptz;
alter table reservas add column if not exists ubicacion_lat double precision;
alter table reservas add column if not exists ubicacion_lng double precision;
alter table reservas add column if not exists ubicacion_actualizada_en timestamptz;

-- ---------- Overlap: mismas salvaguardas de la migración 0010 (vencimiento
-- de solicitud directa, elegibilidad al aceptar, lock por trabajadora para
-- la condición de carrera) más lo nuevo de esta migración: 'en_camino'
-- también cuenta como "ocupado", y se suman 30 minutos de margen de
-- traslado para que no se agenden dos servicios pegados sin tiempo para
-- movilizarse. ----------
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
        and r2.estado in ('aceptada','en_camino','en_curso')
        and (
          (r2.fecha + r2.hora)::timestamp - interval '30 minutes',
          (r2.fecha + r2.hora)::timestamp + (r2.horas || ' hours')::interval + interval '30 minutes'
        )
        overlaps
          ((new.fecha + new.hora)::timestamp, (new.fecha + new.hora)::timestamp + (new.horas || ' hours')::interval)
    ) then
      raise exception 'Esa trabajadora ya tiene una reserva que se cruza con este horario';
    end if;
  end if;
  return new;
end $$;
-- (el trigger ya existe desde la migración 0005; create or replace basta)

-- ---------- Consulta de disponibilidad reusable: para el aviso al cliente
-- ("este profesional no está disponible en ese horario") antes de mandar un
-- pedido directo, sin tener que esperar a que la trabajadora rechace. Usa
-- el mismo margen de traslado que el trigger de arriba. Security definer
-- porque `reservas` tiene RLS y un cliente no puede leer las reservas de
-- otra persona con la trabajadora. ----------
create or replace function trabajador_disponible_en(
  p_trabajador_id uuid, p_fecha date, p_hora time, p_horas int
) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from reservas r2
    where r2.trabajador_id = p_trabajador_id
      and r2.estado in ('aceptada','en_camino','en_curso')
      and (
        (r2.fecha + r2.hora)::timestamp - interval '30 minutes',
        (r2.fecha + r2.hora)::timestamp + (r2.horas || ' hours')::interval + interval '30 minutes'
      )
      overlaps
        ((p_fecha + p_hora)::timestamp, (p_fecha + p_hora)::timestamp + (p_horas || ' hours')::interval)
  )
$$;
revoke all on function trabajador_disponible_en(uuid,date,time,int) from public;
grant execute on function trabajador_disponible_en(uuid,date,time,int) to authenticated;

-- ---------- Máquina de estados + protección de columnas de control ----------
-- Reemplaza la de la migración 0011 (cliente_id inmutable, foto de
-- referencia protegida) agregando:
-- 1) Qué actor puede mover el estado a qué valor (nadie puede saltarse
--    pasos ni asignarse un estado que no le corresponde).
-- 2) Las columnas de control de tiempos (en_camino_en, hora_llegada,
--    inicio_real, fin_estimado, fin_real) y de ubicación solo las puede
--    escribir la trabajadora asignada, nunca la clienta.
-- 3) Los tiempos de control (menos hora_llegada y ubicación, que vienen del
--    dispositivo/momento exacto del clic) se recalculan server-side con
--    now(), para que no se puedan falsificar mandando otra fecha desde el
--    cliente.
-- 4) La ubicación solo se puede actualizar mientras el estado es
--    'en_camino' (no se seguirá la ubicación el resto del día ni durante el
--    servicio dentro del domicilio).
create or replace function fn_proteger_reserva() returns trigger language plpgsql as $$
declare
  es_trabajador boolean := old.trabajador_id is not null and auth.uid() = old.trabajador_id;
  es_cliente boolean := auth.uid() = old.cliente_id;
  es_admin boolean := mi_rol() = 'admin';
begin
  if new.cliente_id is distinct from old.cliente_id then
    raise exception 'No se puede cambiar la clienta de una reserva';
  end if;

  if new.foto_referencia_ruta is distinct from old.foto_referencia_ruta and not es_cliente and not es_admin then
    raise exception 'Solo la clienta puede cambiar la foto de referencia';
  end if;

  if es_admin then
    return new;
  end if;

  if new.estado is distinct from old.estado then
    if es_trabajador then
      if not (
        (old.estado = 'solicitada' and new.estado in ('aceptada','rechazada'))
        or (old.estado = 'aceptada' and new.estado = 'en_camino')
        or (old.estado = 'en_camino' and new.estado = 'en_curso')
        or (old.estado = 'en_curso' and new.estado = 'completada')
      ) then
        raise exception 'Ese cambio de estado no está permitido';
      end if;
    elsif es_cliente then
      if not (
        (old.estado in ('solicitada','aceptada') and new.estado = 'cancelada')
        or (old.estado = 'solicitada' and new.estado = 'aceptada'
            and old.trabajador_id is null and new.trabajador_id is not null)
      ) then
        raise exception 'Ese cambio de estado no está permitido';
      end if;
    else
      raise exception 'No tienes permiso para cambiar el estado de esta reserva';
    end if;
  end if;

  if (new.en_camino_en is distinct from old.en_camino_en
      or new.hora_llegada is distinct from old.hora_llegada
      or new.inicio_real is distinct from old.inicio_real
      or new.fin_estimado is distinct from old.fin_estimado
      or new.fin_real is distinct from old.fin_real
      or new.ubicacion_lat is distinct from old.ubicacion_lat
      or new.ubicacion_lng is distinct from old.ubicacion_lng
      or new.ubicacion_actualizada_en is distinct from old.ubicacion_actualizada_en)
     and not es_trabajador then
    raise exception 'Solo la trabajadora asignada puede actualizar el control del servicio';
  end if;

  if (new.ubicacion_lat is distinct from old.ubicacion_lat or new.ubicacion_lng is distinct from old.ubicacion_lng)
     and new.estado <> 'en_camino' then
    raise exception 'La ubicación solo se actualiza mientras el servicio está en camino';
  end if;

  -- Server-side: nunca confiar en la hora que mande el navegador de la
  -- trabajadora para estos campos.
  if new.estado is distinct from old.estado then
    if new.estado = 'en_camino' then
      new.en_camino_en := now();
    elsif new.estado = 'en_curso' then
      new.inicio_real := now();
      new.fin_estimado := now() + (new.horas || ' hours')::interval;
    elsif new.estado = 'completada' then
      new.fin_real := now();
    end if;
  end if;
  if new.hora_llegada is distinct from old.hora_llegada and old.hora_llegada is null then
    new.hora_llegada := now();
  end if;
  if new.ubicacion_lat is distinct from old.ubicacion_lat or new.ubicacion_lng is distinct from old.ubicacion_lng then
    new.ubicacion_actualizada_en := now();
  end if;

  return new;
end $$;
-- (el trigger trg_proteger_reserva ya existe desde la migración 0011)
