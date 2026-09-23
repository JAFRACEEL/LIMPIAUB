-- Limpi: asignación de trabajos tipo Uber híbrido (modo abierto con
-- candidaturas / modo directo), materiales de limpieza con recargo, y kit
-- propio de la trabajadora. Idempotente.

-- ---------- Trabajadores: kit propio ----------
alter table trabajadores add column if not exists kit_propio boolean not null default false;

-- La vista pública de búsqueda también debe exponer kit_propio, para saber
-- qué trabajadoras pueden ofrecer la opción "trae su kit" al reservar.
-- kit_propio se inserta antes de columnas existentes: hay que recrear la vista.
drop view if exists v_trabajadores_publicos;
create view v_trabajadores_publicos as
select t.id, p.nombre, t.zonas, p.foto_url, t.servicios, t.tarifa_hora, t.kit_propio,
       t.disponible_ahora, t.rating_avg, t.rating_n, t.trabajos_completados, t.descripcion
from trabajadores t join perfiles p on p.id = t.id
where t.habilitado_trabajar;

-- ---------- Reservas: columnas nuevas ----------
alter table reservas add column if not exists modo text not null default 'directo';
alter table reservas add column if not exists elegir_por_mi boolean not null default false;
alter table reservas add column if not exists ventana_cierra_en timestamptz;
alter table reservas add column if not exists zona_ampliada boolean not null default false;
alter table reservas add column if not exists con_materiales boolean not null default false;
alter table reservas add column if not exists recargo_materiales numeric(6,2) not null default 0;

alter table reservas alter column trabajador_id drop not null;
-- En modo abierto la tarifa se copia de la trabajadora recién al elegirla.
alter table reservas alter column tarifa_hora drop not null;

alter table reservas drop constraint if exists reservas_modo_check;
alter table reservas add constraint reservas_modo_check check (modo in ('abierto','directo'));

-- El total ahora incluye el recargo por materiales (antes solo tarifa × horas).
alter table reservas drop column if exists total;
alter table reservas add column total numeric(8,2)
  generated always as (tarifa_hora * horas + recargo_materiales) stored;

-- ---------- Candidaturas (modo abierto) ----------
create table if not exists candidaturas (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references reservas(id) on delete cascade,
  trabajador_id uuid not null references trabajadores(id),
  creado_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente','elegida','liberada')),
  unique (reserva_id, trabajador_id)
);
create index if not exists candidaturas_reserva_idx on candidaturas (reserva_id, estado);

alter table candidaturas enable row level security;

drop policy if exists cand_select on candidaturas;
create policy cand_select on candidaturas for select
  using (
    auth.uid() = trabajador_id
    or mi_rol() = 'admin'
    or exists (select 1 from reservas r where r.id = reserva_id and r.cliente_id = auth.uid())
  );

-- Las candidaturas se crean y se resuelven mediante funciones (más abajo),
-- que corren con permisos elevados y validan las reglas de negocio. No se
-- permite insertar/actualizar candidaturas directamente desde el cliente.
drop policy if exists cand_insert on candidaturas;
drop policy if exists cand_update on candidaturas;

-- Máximo 3 candidaturas pendientes por reserva, y solo sobre reservas abiertas.
create or replace function fn_limitar_candidaturas() returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from reservas where id = new.reserva_id and estado = 'solicitada'
      and modo = 'abierto' and trabajador_id is null
  ) then
    raise exception 'Esta reserva ya no está disponible';
  end if;
  if (select count(*) from candidaturas where reserva_id = new.reserva_id and estado = 'pendiente') >= 3 then
    raise exception 'Ya hay 3 candidatas para esta reserva';
  end if;
  return new;
end $$;
drop trigger if exists trg_limitar_candidaturas on candidaturas;
create trigger trg_limitar_candidaturas before insert on candidaturas
  for each row execute function fn_limitar_candidaturas();

-- ---------- Trabajador no puede tener dos reservas que se crucen en horario ----------
-- Compara marcas de tiempo completas (fecha + hora), no solo la hora del día:
-- comparar por igualdad de fecha y sumar horas a un `time` se rompe en
-- turnos que cruzan la medianoche.
create or replace function fn_validar_solapamiento() returns trigger language plpgsql as $$
begin
  if new.estado = 'aceptada' and new.trabajador_id is not null
     and (old.estado is distinct from new.estado or old.trabajador_id is distinct from new.trabajador_id) then
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
drop trigger if exists trg_validar_solapamiento on reservas;
create trigger trg_validar_solapamiento before update on reservas
  for each row execute function fn_validar_solapamiento();

-- ---------- Postularse a un pedido abierto ----------
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

-- ---------- El cliente elige una candidata ----------
create or replace function elegir_candidata(p_reserva_id uuid, p_trabajador_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reserva reservas%rowtype;
  v_tarifa numeric(6,2);
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

  select tarifa_hora into v_tarifa from trabajadores where id = p_trabajador_id;

  update reservas set trabajador_id = p_trabajador_id, tarifa_hora = v_tarifa, estado = 'aceptada'
    where id = p_reserva_id;

  update candidaturas set estado = 'elegida'
    where reserva_id = p_reserva_id and trabajador_id = p_trabajador_id;
  update candidaturas set estado = 'liberada'
    where reserva_id = p_reserva_id and trabajador_id <> p_trabajador_id and estado = 'pendiente';
end $$;

revoke all on function elegir_candidata(uuid, uuid) from public;
grant execute on function elegir_candidata(uuid, uuid) to authenticated;

-- ---------- Vista personalizada: pedidos abiertos que le corresponden a la
-- trabajadora que consulta (según sus propias zonas/servicios). No expone
-- dirección, notas ni datos del cliente. ----------
create or replace view v_pedidos_abiertos as
select r.id, r.servicio, r.zona, r.fecha, r.hora, r.horas, r.con_materiales,
       r.recargo_materiales, r.comision_pct, r.ventana_cierra_en, r.zona_ampliada, r.creado_en
from reservas r
join trabajadores t on t.id = auth.uid()
where r.estado = 'solicitada'
  and r.modo = 'abierto'
  and r.trabajador_id is null
  and t.disponible_ahora
  and t.habilitado_trabajar
  and r.servicio = any(t.servicios)
  and (r.zona = any(t.zonas) or r.zona_ampliada)
  and (not r.con_materiales or t.kit_propio)
  and not exists (select 1 from candidaturas c where c.reserva_id = r.id and c.trabajador_id = auth.uid());

-- ---------- Realtime ----------
do $$ begin
  alter publication supabase_realtime add table candidaturas;
exception when duplicate_object then null; end $$;
