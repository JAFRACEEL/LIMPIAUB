-- Limpi: kit de limpieza a crédito (opción C de materiales). El admin emite
-- un préstamo con código de retiro; al completar servicios, un trigger va
-- descontando el saldo automáticamente hasta pagarlo.
-- Idempotente.

create table if not exists prestamos_kit (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references trabajadores(id),
  monto numeric(6,2) not null check (monto > 0),
  saldo numeric(6,2) not null check (saldo >= 0),
  codigo_retiro text not null unique,
  bodega text not null,
  estado text not null default 'emitido' check (estado in ('emitido','retirado','pagado','perdida')),
  creado_en timestamptz not null default now()
);
create index if not exists prestamos_kit_trabajador_idx on prestamos_kit (trabajador_id, estado);

create table if not exists prestamo_kit_movimientos (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid not null references prestamos_kit(id) on delete cascade,
  reserva_id uuid not null references reservas(id),
  monto numeric(6,2) not null,
  creado_en timestamptz not null default now()
);
create index if not exists prestamo_kit_movimientos_prestamo_idx on prestamo_kit_movimientos (prestamo_id);

alter table prestamos_kit enable row level security;
alter table prestamo_kit_movimientos enable row level security;

drop policy if exists prestamos_select on prestamos_kit;
create policy prestamos_select on prestamos_kit for select
  using (auth.uid() = trabajador_id or mi_rol() = 'admin');

-- Las emisiones se hacen con emitir_prestamo_kit() (valida requisitos y
-- tope de 10 activos); esta política es solo un respaldo por si acaso.
drop policy if exists prestamos_insert on prestamos_kit;
create policy prestamos_insert on prestamos_kit for insert with check (mi_rol() = 'admin');
drop policy if exists prestamos_update on prestamos_kit;
create policy prestamos_update on prestamos_kit for update using (mi_rol() = 'admin');

drop policy if exists prestamo_mov_select on prestamo_kit_movimientos;
create policy prestamo_mov_select on prestamo_kit_movimientos for select
  using (
    mi_rol() = 'admin'
    or exists (select 1 from prestamos_kit p where p.id = prestamo_id and p.trabajador_id = auth.uid())
  );

-- ---------- Emisión (solo admin) ----------
create or replace function emitir_prestamo_kit(p_trabajador_id uuid, p_monto numeric, p_bodega text)
returns prestamos_kit
language plpgsql security definer set search_path = public as $$
declare
  v_trabajador trabajadores%rowtype;
  v_activos int;
  v_codigo text;
  v_fila prestamos_kit%rowtype;
begin
  if mi_rol() is distinct from 'admin' then
    raise exception 'Solo un administrador puede emitir un préstamo de kit';
  end if;

  -- Serializa emisiones concurrentes: sin esto, dos llamadas al mismo tiempo
  -- podrían ver ambas 9 préstamos activos (o ninguna candidatura previa de
  -- la misma trabajadora) y las dos pasar las validaciones de abajo.
  perform pg_advisory_xact_lock(hashtext('emitir_prestamo_kit'));

  select * into v_trabajador from trabajadores where id = p_trabajador_id;
  if not found or not v_trabajador.verificado or v_trabajador.trabajos_completados < 2
     or v_trabajador.rating_avg < 4.5 then
    raise exception 'Esta trabajadora no cumple los requisitos para un préstamo de kit';
  end if;

  if exists (select 1 from prestamos_kit where trabajador_id = p_trabajador_id and estado in ('emitido','retirado')) then
    raise exception 'Esta trabajadora ya tiene un préstamo de kit activo';
  end if;

  select count(*) into v_activos from prestamos_kit where estado in ('emitido','retirado');
  if v_activos >= 10 then
    raise exception 'Ya hay 10 préstamos de kit activos, el máximo permitido';
  end if;

  v_codigo := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  insert into prestamos_kit (trabajador_id, monto, saldo, codigo_retiro, bodega)
  values (p_trabajador_id, p_monto, p_monto, v_codigo, p_bodega)
  returning * into v_fila;

  return v_fila;
end $$;

revoke all on function emitir_prestamo_kit(uuid, numeric, text) from public;
grant execute on function emitir_prestamo_kit(uuid, numeric, text) to authenticated;

-- ---------- Descuento automático al completar un servicio ----------
create or replace function fn_descontar_prestamo_kit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prestamo prestamos_kit%rowtype;
  v_descuento numeric(6,2);
begin
  if new.estado = 'completada' and old.estado is distinct from 'completada' and new.trabajador_id is not null
     -- Sin esto, alguien podría alternar completada ⇄ en_curso una y otra
     -- vez sobre la misma reserva y descontar el préstamo cada vez: cada
     -- reserva solo puede generar un movimiento, una sola vez.
     and not exists (select 1 from prestamo_kit_movimientos where reserva_id = new.id) then
    select * into v_prestamo from prestamos_kit
      where trabajador_id = new.trabajador_id and estado in ('emitido','retirado')
      order by creado_en asc
      limit 1
      for update;

    if found then
      v_descuento := least(v_prestamo.saldo, case when new.con_materiales then 13 else 10 end);
      if v_descuento > 0 then
        update prestamos_kit set
          saldo = v_prestamo.saldo - v_descuento,
          estado = case when v_prestamo.saldo - v_descuento <= 0 then 'pagado' else v_prestamo.estado end
        where id = v_prestamo.id;

        insert into prestamo_kit_movimientos (prestamo_id, reserva_id, monto)
        values (v_prestamo.id, new.id, v_descuento);
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_descontar_prestamo_kit on reservas;
create trigger trg_descontar_prestamo_kit after update on reservas
  for each row execute function fn_descontar_prestamo_kit();

-- ---------- Realtime (para que la trabajadora vea el saldo bajar) ----------
do $$ begin
  alter publication supabase_realtime add table prestamos_kit;
exception when duplicate_object then null; end $$;
