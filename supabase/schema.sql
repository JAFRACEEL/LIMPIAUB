-- Limpi: plataforma de limpieza bajo demanda (Iquitos)
-- Ejecutar en Supabase > SQL Editor. Idempotente.

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type rol as enum ('cliente','trabajador','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_reserva as enum ('solicitada','aceptada','en_curso','completada','cancelada','rechazada');
exception when duplicate_object then null; end $$;

-- ---------- Perfiles (1:1 con auth.users) ----------
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol rol not null default 'cliente',
  nombre text not null,
  telefono text not null,
  zona text not null,
  direccion text,
  foto_url text,
  creado_en timestamptz not null default now()
);

-- ---------- Trabajadores (extiende perfiles) ----------
create table if not exists trabajadores (
  id uuid primary key references perfiles(id) on delete cascade,
  dni text not null,
  servicios text[] not null default '{}',
  tarifa_hora numeric(6,2) not null check (tarifa_hora between 5 and 100),
  experiencia text,
  descripcion text,
  disponible_ahora boolean not null default false,
  verificado boolean not null default false,
  antecedentes text,            -- 'vigente' | 'en_tramite' | 'no'
  referencias text,
  rating_avg numeric(3,2) not null default 0,
  rating_n int not null default 0,
  trabajos_completados int not null default 0,
  ultima_actividad timestamptz not null default now()
);
create index if not exists trabajadores_disp_idx on trabajadores (disponible_ahora, verificado);

-- ---------- Reservas ----------
create table if not exists reservas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references perfiles(id),
  trabajador_id uuid not null references trabajadores(id),
  servicio text not null,
  fecha date not null,
  hora time not null,
  horas int not null check (horas between 2 and 12),
  direccion text not null,
  zona text not null,
  notas text,
  tarifa_hora numeric(6,2) not null,
  total numeric(8,2) generated always as (tarifa_hora * horas) stored,
  comision_pct numeric(4,2) not null default 20,
  estado estado_reserva not null default 'solicitada',
  pago_metodo text,             -- 'yape' | 'plin' | 'efectivo'
  pago_confirmado boolean not null default false,
  inicio_real timestamptz,
  fin_real timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists reservas_trab_idx on reservas (trabajador_id, estado);
create index if not exists reservas_cli_idx on reservas (cliente_id, estado);

-- ---------- Calificaciones ----------
create table if not exists calificaciones (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references reservas(id) on delete cascade,
  de_id uuid not null references perfiles(id),
  para_id uuid not null references perfiles(id),
  estrellas int not null check (estrellas between 1 and 5),
  comentario text,
  creado_en timestamptz not null default now(),
  unique (reserva_id, de_id)
);

-- ---------- Trigger: recalcular rating del trabajador ----------
create or replace function fn_recalc_rating() returns trigger language plpgsql as $$
begin
  update trabajadores t set
    rating_avg = coalesce((select avg(estrellas) from calificaciones where para_id = new.para_id),0),
    rating_n   = (select count(*) from calificaciones where para_id = new.para_id)
  where t.id = new.para_id;
  return new;
end $$;
drop trigger if exists trg_recalc_rating on calificaciones;
create trigger trg_recalc_rating after insert on calificaciones
  for each row execute function fn_recalc_rating();

-- ---------- Trigger: contar trabajos completados ----------
create or replace function fn_reserva_completada() returns trigger language plpgsql as $$
begin
  if new.estado = 'completada' and old.estado <> 'completada' then
    update trabajadores set trabajos_completados = trabajos_completados + 1 where id = new.trabajador_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_reserva_completada on reservas;
create trigger trg_reserva_completada after update on reservas
  for each row execute function fn_reserva_completada();

-- ---------- Helper: rol del usuario actual ----------
create or replace function mi_rol() returns rol language sql stable security definer as $$
  select rol from perfiles where id = auth.uid()
$$;

-- ---------- RLS ----------
alter table perfiles enable row level security;
alter table trabajadores enable row level security;
alter table reservas enable row level security;
alter table calificaciones enable row level security;

-- perfiles
drop policy if exists perfiles_select on perfiles;
create policy perfiles_select on perfiles for select using (true);
drop policy if exists perfiles_insert on perfiles;
create policy perfiles_insert on perfiles for insert with check (auth.uid() = id and rol <> 'admin');
drop policy if exists perfiles_update on perfiles;
create policy perfiles_update on perfiles for update using (auth.uid() = id or mi_rol() = 'admin');

-- trabajadores: público ve solo verificados; el propio y admin ven todo
drop policy if exists trab_select on trabajadores;
create policy trab_select on trabajadores for select
  using (verificado or auth.uid() = id or mi_rol() = 'admin');
drop policy if exists trab_insert on trabajadores;
create policy trab_insert on trabajadores for insert with check (auth.uid() = id);
drop policy if exists trab_update on trabajadores;
create policy trab_update on trabajadores for update
  using (auth.uid() = id or mi_rol() = 'admin');
-- Solo admin puede marcar verificado (columna protegida por trigger)
create or replace function fn_proteger_verificado() returns trigger language plpgsql as $$
begin
  if new.verificado is distinct from old.verificado and mi_rol() is distinct from 'admin' then
    raise exception 'Solo un administrador puede verificar';
  end if;
  return new;
end $$;
drop trigger if exists trg_proteger_verificado on trabajadores;
create trigger trg_proteger_verificado before update on trabajadores
  for each row execute function fn_proteger_verificado();

-- reservas: solo las partes y admin
drop policy if exists res_select on reservas;
create policy res_select on reservas for select
  using (auth.uid() in (cliente_id, trabajador_id) or mi_rol() = 'admin');
drop policy if exists res_insert on reservas;
create policy res_insert on reservas for insert
  with check (auth.uid() = cliente_id and mi_rol() = 'cliente');
drop policy if exists res_update on reservas;
create policy res_update on reservas for update
  using (auth.uid() in (cliente_id, trabajador_id) or mi_rol() = 'admin');

-- calificaciones
drop policy if exists cal_select on calificaciones;
create policy cal_select on calificaciones for select using (true);
drop policy if exists cal_insert on calificaciones;
create policy cal_insert on calificaciones for insert
  with check (
    auth.uid() = de_id and
    exists (select 1 from reservas r where r.id = reserva_id
            and r.estado = 'completada'
            and auth.uid() in (r.cliente_id, r.trabajador_id))
  );

-- ---------- Vista pública de búsqueda ----------
create or replace view v_trabajadores_publicos as
select t.id, p.nombre, p.zona, p.foto_url, t.servicios, t.tarifa_hora,
       t.disponible_ahora, t.rating_avg, t.rating_n, t.trabajos_completados, t.descripcion
from trabajadores t join perfiles p on p.id = t.id
where t.verificado;

-- ---------- Realtime ----------
alter publication supabase_realtime add table reservas;
alter publication supabase_realtime add table trabajadores;
