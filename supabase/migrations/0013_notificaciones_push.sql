-- Limpi: notificaciones push (Web Push / VAPID) para que la trabajadora se
-- entere de un pedido aunque tenga la app cerrada, y para avisar a clientas
-- y admin en los eventos clave del flujo. Idempotente.

-- ---------- pg_net: permite llamar a la Edge Function `send-push` desde
-- triggers de Postgres sin bloquear la transacción (la llamada HTTP se
-- encola y corre en segundo plano). ----------
create extension if not exists pg_net;

-- ---------- Suscripciones push: varios dispositivos por usuario ----------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references perfiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  creado_en timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on push_subscriptions;
create policy push_subscriptions_select on push_subscriptions for select
  using (auth.uid() = user_id or mi_rol() = 'admin');

drop policy if exists push_subscriptions_insert on push_subscriptions;
create policy push_subscriptions_insert on push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_update on push_subscriptions;
create policy push_subscriptions_update on push_subscriptions for update
  using (auth.uid() = user_id);

drop policy if exists push_subscriptions_delete on push_subscriptions;
create policy push_subscriptions_delete on push_subscriptions for delete
  using (auth.uid() = user_id or mi_rol() = 'admin');

-- ---------- Config del envío: URL de la Edge Function y secreto compartido
-- (lo llena el admin a mano en el SQL Editor después de desplegar la
-- función; ver README). Mientras push_function_url sea null, fn_enviar_push
-- no hace nada, así que el resto de la app sigue funcionando igual antes de
-- configurar esto. ----------
create table if not exists app_config (
  id boolean primary key default true check (id),
  push_function_url text,
  push_function_secret text
);
insert into app_config (id) values (true) on conflict (id) do nothing;

alter table app_config enable row level security;

drop policy if exists app_config_select on app_config;
create policy app_config_select on app_config for select using (mi_rol() = 'admin');
drop policy if exists app_config_update on app_config;
create policy app_config_update on app_config for update using (mi_rol() = 'admin');

-- ---------- Envío: encola una llamada a la Edge Function con los user_ids a
-- notificar. security definer porque se llama desde triggers que corren con
-- el rol de quien hizo el cambio (p. ej. la clienta), y esa persona no tiene
-- por qué poder leer app_config. ----------
create or replace function fn_enviar_push(p_user_ids uuid[], p_titulo text, p_cuerpo text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cfg app_config%rowtype;
begin
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return;
  end if;

  select * into v_cfg from app_config where id = true;
  if v_cfg.push_function_url is null then
    return;
  end if;

  perform net.http_post(
    url := v_cfg.push_function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.push_function_secret),
    body := jsonb_build_object('user_ids', to_jsonb(p_user_ids), 'titulo', p_titulo, 'cuerpo', p_cuerpo, 'url', p_url)
  );
end $$;

revoke all on function fn_enviar_push(uuid[], text, text, text) from public;

-- ---------- Reservas: pedido directo nuevo, pedido abierto que calza,
-- aceptado/rechazado, cancelado, dirección cambiada, iniciado, finalizado ----------
create or replace function fn_push_reservas_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_destinatarios uuid[];
begin
  if new.estado <> 'solicitada' then
    return new;
  end if;

  if new.modo = 'directo' and new.trabajador_id is not null then
    perform fn_enviar_push(
      array[new.trabajador_id], 'Nuevo pedido directo',
      'Tienes 15 min para aceptar: ' || new.servicio || ' · ' || new.zona, '/panel'
    );
  elsif new.modo = 'abierto' and new.trabajador_id is null then
    select array_agg(t.id) into v_destinatarios
    from trabajadores t
    where t.disponible_ahora
      and t.habilitado_trabajar
      and t.ultima_actividad > now() - interval '8 hours'
      and new.servicio = any(t.servicios)
      and new.zona = any(t.zonas)
      and (not new.con_materiales or t.kit_propio);
    perform fn_enviar_push(
      v_destinatarios, 'Pedido cerca de ti',
      new.servicio || ' · ' || new.zona || ' · ' || new.horas || 'h. Postúlate en la app.', '/panel'
    );
  end if;

  return new;
end $$;
drop trigger if exists trg_push_reservas_insert on reservas;
create trigger trg_push_reservas_insert after insert on reservas
  for each row execute function fn_push_reservas_insert();

create or replace function fn_push_reservas_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado is distinct from old.estado then
    if new.modo = 'directo' and new.estado = 'aceptada' and old.estado = 'solicitada' then
      perform fn_enviar_push(array[new.cliente_id], 'Pedido directo aceptado',
        'Tu pedido de ' || new.servicio || ' fue aceptado.', '/reservas');
    elsif new.modo = 'directo' and new.estado = 'rechazada' and old.estado = 'solicitada' then
      perform fn_enviar_push(array[new.cliente_id], 'Pedido directo rechazado',
        'No pudo aceptar tu pedido de ' || new.servicio || '. Búscala de nuevo o elige otra trabajadora.', '/reservas');
    elsif new.estado = 'cancelada' and new.trabajador_id is not null and old.estado in ('solicitada','aceptada') then
      perform fn_enviar_push(array[new.trabajador_id], 'La clienta canceló',
        'Se canceló el servicio de ' || new.servicio || '.', '/panel');
    elsif new.estado = 'en_curso' then
      perform fn_enviar_push(array[new.cliente_id], 'Tu servicio empezó',
        'La trabajadora ya inició el servicio de ' || new.servicio || '.', '/reservas');
    elsif new.estado = 'completada' then
      perform fn_enviar_push(array[new.cliente_id], 'Servicio finalizado',
        'Terminó tu servicio de ' || new.servicio || '. ¿Cómo te fue? Califica a tu trabajadora.', '/reservas');
    end if;
  elsif new.direccion is distinct from old.direccion and new.trabajador_id is not null then
    perform fn_enviar_push(array[new.trabajador_id], 'Cambió la dirección',
      'La clienta actualizó la dirección de ' || new.servicio || '.', '/panel');
  end if;

  return new;
end $$;
drop trigger if exists trg_push_reservas_update on reservas;
create trigger trg_push_reservas_update after update on reservas
  for each row execute function fn_push_reservas_update();

-- ---------- Candidaturas: postulación nueva (avisa a la clienta) y elegida
-- (avisa a la trabajadora) ----------
create or replace function fn_push_candidaturas_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cliente_id uuid;
  v_servicio text;
begin
  select cliente_id, servicio into v_cliente_id, v_servicio from reservas where id = new.reserva_id;
  if v_cliente_id is not null then
    perform fn_enviar_push(array[v_cliente_id], 'Nueva postulación',
      'Una trabajadora se postuló a tu pedido de ' || v_servicio || '.', '/reservas');
  end if;
  return new;
end $$;
drop trigger if exists trg_push_candidaturas_insert on candidaturas;
create trigger trg_push_candidaturas_insert after insert on candidaturas
  for each row execute function fn_push_candidaturas_insert();

create or replace function fn_push_candidaturas_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'elegida' and old.estado is distinct from new.estado then
    perform fn_enviar_push(array[new.trabajador_id], '¡Te eligieron!',
      'La clienta te eligió para su servicio. Revísalo en tu panel.', '/panel');
  end if;
  return new;
end $$;
drop trigger if exists trg_push_candidaturas_update on candidaturas;
create trigger trg_push_candidaturas_update after update on candidaturas
  for each row execute function fn_push_candidaturas_update();

-- ---------- Trabajadores: nueva pendiente de verificación (general o
-- migratoria) avisa a todos los admin ----------
create or replace function fn_push_trabajadores_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_admins uuid[];
begin
  select array_agg(id) into v_admins from perfiles where rol = 'admin';
  perform fn_enviar_push(v_admins, 'Nueva trabajadora pendiente', 'Hay una trabajadora nueva para verificar.', '/admin');
  return new;
end $$;
drop trigger if exists trg_push_trabajadores_insert on trabajadores;
create trigger trg_push_trabajadores_insert after insert on trabajadores
  for each row execute function fn_push_trabajadores_insert();

create or replace function fn_push_trabajadores_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_admins uuid[];
begin
  if new.estado_migratorio = 'pendiente_validacion' and old.estado_migratorio is distinct from new.estado_migratorio then
    select array_agg(id) into v_admins from perfiles where rol = 'admin';
    perform fn_enviar_push(v_admins, 'Verificación migratoria pendiente',
      'Una trabajadora adjuntó documentos migratorios para validar.', '/admin');
  end if;
  return new;
end $$;
drop trigger if exists trg_push_trabajadores_update on trabajadores;
create trigger trg_push_trabajadores_update after update on trabajadores
  for each row execute function fn_push_trabajadores_update();
