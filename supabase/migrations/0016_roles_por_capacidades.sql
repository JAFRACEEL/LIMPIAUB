-- ============================================================
-- 0016 — Roles por capacidades (una cuenta, perfiles independientes)
-- ============================================================
-- Estado: PREPARADA. Se pega en el SQL Editor de LIMPIA (rol postgres) DESPUÉS de las 0016a y 0016b. UNA sola transacción,
-- idempotente. Reversa: supabase/rollback/0016_rollback.sql. Pruebas: supabase/tests/migracion-0016.mjs (PGlite).
--
-- Qué cambia
--   1. Admin = fila en la tabla `admins` (RLS activado, sin políticas, sin permisos para la API). Ya no se lee perfiles.rol.
--   2. "Es profesional" = existe su fila en `trabajadores`. "Puede actuar" = habilitado_trabajar (verificado por un admin y,
--      si es extranjera, estatus migratorio validado). Un usuario puede ser cliente + profesional + admin a la vez.
--   3. mi_rol() deja de usarse: todas las políticas y funciones pasan a es_admin() / es_profesional() / es_profesional_habilitado().
--   4. Cualquier usuario autenticado puede pedir servicios (res_insert ya no exige rol 'cliente'); nadie puede contratarse
--      a sí mismo (CHECK en reservas + comprobación en postularme_a_reserva).
--   5. Alta de profesional por la API: siempre pendiente, estado migratorio derivado de la nacionalidad, sin campos de
--      verificación ni reputación (K). Auditoría de verificación en trabajadores.verificado_por / verificado_en (H).
--      Reputación no editable por el dueño (I). fn_recalc_rating y fn_reserva_completada pasan a SECURITY DEFINER (J)
--      y la calificación solo cuenta lo recibido COMO profesional.
--   6. Endurecimiento (E): ningún SECURITY DEFINER sin search_path fijo; las funciones de trigger y fn_oficio_en_texto
--      dejan de ser ejecutables por la API.
--   7. Incluye (idempotente) el contenido de las 0016a y 0016b, por si se aplica en un entorno nuevo.
-- Qué NO hace: no toca perfiles.rol (la columna queda congelada; se elimina en una migración posterior), no cambia el
-- registro del frontend, no toca Storage ni la tabla push_subscriptions (la columna `app` va con el refactor).
-- La cuenta admin@prueba.limpi.test NO se migra a `admins`: se elimina aparte (supabase/hotfix/0016_borrar_admin_prueba.sql).

begin;

-- ---------- 1. Tabla admins ----------
create table if not exists admins (
  user_id uuid primary key references perfiles(id) on delete cascade,
  creado_en timestamptz not null default now()
);
alter table admins enable row level security;
revoke all on admins from public, anon, authenticated;
comment on table admins is 'Administradores. Solo se escribe desde el SQL Editor (rol postgres): insert into admins (user_id) values (...).';

-- ---------- 2. Capacidades ----------
create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

create or replace function es_profesional() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trabajadores where id = auth.uid())
$$;

-- "Verificado" hoy se llama habilitado_trabajar: verificado por un admin Y (peruana o estatus migratorio validado).
create or replace function es_profesional_habilitado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trabajadores where id = auth.uid() and habilitado_trabajar)
$$;

revoke execute on function es_admin(), es_profesional(), es_profesional_habilitado() from public;
grant execute on function es_admin(), es_profesional(), es_profesional_habilitado() to anon, authenticated;

-- ---------- 3. Admins iniciales (decisión del dueño, 2026-11-11) ----------
-- Solansh Bartra y admin.demo. Solo se migran si todavía figuran con rol 'admin'. En un entorno nuevo no inserta nada:
-- se asigna a mano con  insert into admins (user_id) values ('<uuid>');
insert into admins (user_id)
select p.id from perfiles p
where p.rol = 'admin'
  and p.id in ('5e7b822a-7d0b-49d6-af17-b9da194f4d67', '6531e276-48a4-4da0-a9d6-e52fbe51d1a1')
on conflict (user_id) do nothing;

-- ---------- 4. Columnas de auditoría de verificación (H) ----------
alter table trabajadores add column if not exists verificado_por uuid references perfiles(id) on delete set null;
alter table trabajadores add column if not exists verificado_en timestamptz;
comment on column trabajadores.verificado_por is 'Admin que tomó la última decisión de verificación (verificar, rechazar o validar estatus migratorio). Lo escribe un trigger; la API no puede editarla. Null = decisión anterior a la auditoría o tomada desde el SQL Editor.';

-- ---------- 5. Triggers de perfiles y trabajadores ----------
-- 0016a: la API no puede cambiar perfiles.rol
create or replace function fn_proteger_rol_perfiles() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.rol is distinct from old.rol and current_user in ('authenticated', 'anon') then
    raise exception 'El rol no se puede cambiar desde la aplicación';
  end if;
  return new;
end $$;
revoke execute on function fn_proteger_rol_perfiles() from public, anon, authenticated;
drop trigger if exists trg_proteger_rol_perfiles on perfiles;
create trigger trg_proteger_rol_perfiles before update of rol on perfiles
  for each row execute function fn_proteger_rol_perfiles();

-- 0016b + K: el alta por la API nace pendiente; el estatus migratorio se DERIVA de la nacionalidad (se ignora lo que mande el cliente).
create or replace function fn_trabajador_alta_pendiente() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.verificado := false;
    new.habilitado_trabajar := false;
    new.verificacion_rechazada := false;
    new.motivo_rechazo := null;
    new.verificado_por := null;
    new.verificado_en := null;
    new.disponible_ahora := false;
    new.estado_migratorio := case when new.nacionalidad = 'peruana' then 'no_aplica' else 'pendiente_validacion' end;
    new.rating_avg := 0;
    new.rating_n := 0;
    new.trabajos_completados := 0;
  end if;
  return new;
end $$;
revoke execute on function fn_trabajador_alta_pendiente() from public, anon, authenticated;
drop trigger if exists trg_trabajador_alta_pendiente on trabajadores;
create trigger trg_trabajador_alta_pendiente before insert on trabajadores
  for each row execute function fn_trabajador_alta_pendiente();

-- H + I: auditoría de verificación y reputación protegida. Corre DESPUÉS de trg_trabajador_guardas (orden alfabético),
-- así que cuando llega aquí una decisión de verificación por la API, ya la tomó un admin.
create or replace function fn_trabajador_verificacion_y_reputacion() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.rating_avg := old.rating_avg;
    new.rating_n := old.rating_n;
    new.trabajos_completados := old.trabajos_completados;
  end if;

  if new.verificado is distinct from old.verificado
     or new.verificacion_rechazada is distinct from old.verificacion_rechazada
     or (new.estado_migratorio is distinct from old.estado_migratorio and new.estado_migratorio in ('validado', 'rechazado')) then
    if current_user in ('authenticated', 'anon') then
      new.verificado_por := auth.uid();
      new.verificado_en := now();
    elsif new.verificado_por is not distinct from old.verificado_por and new.verificado_en is not distinct from old.verificado_en then
      new.verificado_por := auth.uid();   -- null si la decisión se toma desde el SQL Editor
      new.verificado_en := now();
    end if;
  elsif current_user in ('authenticated', 'anon') then
    new.verificado_por := old.verificado_por;
    new.verificado_en := old.verificado_en;
  end if;
  return new;
end $$;
revoke execute on function fn_trabajador_verificacion_y_reputacion() from public, anon, authenticated;
drop trigger if exists trg_trabajador_verificacion_y_reputacion on trabajadores;
create trigger trg_trabajador_verificacion_y_reputacion before update on trabajadores
  for each row execute function fn_trabajador_verificacion_y_reputacion();

-- J: los triggers que actualizan la reputación corren con permisos del dueño (antes corrían con los de quien calificaba y
-- la política trab_update, que solo deja tocar la fila propia, dejaba la actualización en 0 filas sin avisar).
-- La calificación solo cuenta lo recibido COMO profesional: la persona calificada era la técnica de esa reserva.
create or replace function fn_recalc_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from reservas r where r.id = new.reserva_id and r.trabajador_id = new.para_id) then
    update trabajadores t set
      rating_avg = coalesce((select avg(c.estrellas) from calificaciones c join reservas r on r.id = c.reserva_id
                              where c.para_id = new.para_id and r.trabajador_id = c.para_id), 0),
      rating_n = (select count(*) from calificaciones c join reservas r on r.id = c.reserva_id
                   where c.para_id = new.para_id and r.trabajador_id = c.para_id)
    where t.id = new.para_id;
  end if;
  return new;
end $$;

create or replace function fn_reserva_completada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'completada' and old.estado <> 'completada' then
    update trabajadores set trabajos_completados = trabajos_completados + 1 where id = new.trabajador_id;
  end if;
  return new;
end $$;

-- ---------- 6. Nadie se contrata a sí mismo ----------
alter table reservas drop constraint if exists reservas_no_autocontratacion;
alter table reservas add constraint reservas_no_autocontratacion
  check (trabajador_id is null or cliente_id <> trabajador_id);

-- ---------- 7. Funciones que leían el rol (cuerpos reescritos sin \r; solo cambia la comprobación del rol) ----------
-- confirmar_pago
CREATE OR REPLACE FUNCTION public.confirmar_pago(p_pago_id uuid, p_confirmar boolean, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pg pagos%rowtype;
begin
  if auth.uid() is null or not es_admin() then
    raise exception 'Solo un administrador puede verificar pagos';
  end if;
  select * into pg from pagos where id = p_pago_id for update;
  if not found then raise exception 'Ese pago no existe'; end if;
  if pg.estado <> 'pendiente_verificacion' then
    raise exception 'Ese pago ya fue revisado';
  end if;
  update pagos set
    estado = case when p_confirmar then 'confirmado' else 'rechazado' end,
    verificado_por = auth.uid(),
    verificado_en = now(),
    motivo_rechazo = case when p_confirmar then null else nullif(trim(coalesce(p_motivo, '')), '') end
  where id = pg.id;
  perform fn_recalcular_totales(pg.reserva_id);
  perform fn_aviso(pg.registrado_por,
    case when p_confirmar then 'Pago confirmado' else 'No pudimos confirmar tu pago' end,
    case when p_confirmar then 'Verificamos tu pago. ¡Gracias!' else 'Revisa los datos del pago y vuelve a registrarlo.' end,
    '/reservas');
end $function$;

-- emitir_prestamo_kit
CREATE OR REPLACE FUNCTION public.emitir_prestamo_kit(p_trabajador_id uuid, p_monto numeric, p_bodega text)
 RETURNS prestamos_kit
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_trabajador trabajadores%rowtype;
  v_activos int;
  v_codigo text;
  v_fila prestamos_kit%rowtype;
begin
  if not es_admin() then
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
end $function$;

-- enviar_propuesta
CREATE OR REPLACE FUNCTION public.enviar_propuesta(p_reserva_id uuid, p_tipo text, p_mano_obra numeric, p_materiales numeric, p_movilidad numeric, p_otros numeric, p_alcance text, p_incluye text[], p_no_incluye text[], p_condiciones text[], p_validez_horas integer DEFAULT 48)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t trabajadores%rowtype;
  r reservas%rowtype;
  v_visita propuestas%rowtype;
  v_desc numeric(8,2) := 0;
  v_version int;
  v_id uuid;
  v_mo numeric(8,2) := round(coalesce(p_mano_obra, 0), 2);
  v_mat numeric(8,2) := round(coalesce(p_materiales, 0), 2);
  v_mov numeric(8,2) := round(coalesce(p_movilidad, 0), 2);
  v_otr numeric(8,2) := round(coalesce(p_otros, 0), 2);
begin
  if auth.uid() is null or not es_profesional() then
    raise exception 'Solo un profesional puede enviar propuestas';
  end if;
  select * into t from trabajadores where id = auth.uid();
  if not found or not t.habilitado_trabajar then
    raise exception 'Debes estar habilitado para enviar propuestas';
  end if;
  if not fn_propuestas_activas() then
    raise exception 'Las propuestas todavía no están activadas';
  end if;
  if p_tipo not in ('servicio','presupuesto_reparacion','adicional') then
    raise exception 'Tipo de propuesta no válido';
  end if;
  if least(v_mo, v_mat, v_mov, v_otr) < 0 then
    raise exception 'Los importes no pueden ser negativos';
  end if;
  if p_tipo <> 'adicional' and v_mo <= 0 then
    raise exception 'La mano de obra debe ser mayor a cero';
  end if;
  if v_mo + v_mat + v_mov + v_otr <= 0 then
    raise exception 'La propuesta debe tener un importe';
  end if;
  if length(trim(coalesce(p_alcance, ''))) = 0 then
    raise exception 'Describe el alcance de la propuesta';
  end if;

  select * into r from reservas where id = p_reserva_id for update;
  if not found then raise exception 'La solicitud no existe'; end if;

  if p_tipo = 'servicio' then
    if r.estado <> 'solicitada' or r.modo <> 'abierto' or r.trabajador_id is not null then
      raise exception 'Esta solicitud ya no está disponible';
    end if;
    if r.modalidad_precio <> 'cotizacion' then
      raise exception 'Esta solicitud ya tiene precio configurado: no necesitas enviar una propuesta';
    end if;
    if not exists (
      select 1 from candidaturas where reserva_id = r.id and trabajador_id = auth.uid() and estado = 'pendiente'
    ) then
      raise exception 'Primero debes postularte a esta solicitud';
    end if;
  else
    if r.trabajador_id is distinct from auth.uid() then
      raise exception 'Solo el profesional asignado puede enviar esto';
    end if;
    if p_tipo = 'presupuesto_reparacion' then
      if r.estado <> 'en_curso' or r.modalidad_precio <> 'diagnostico' then
        raise exception 'El presupuesto de reparación se envía durante una visita de diagnóstico';
      end if;
      select * into v_visita from propuestas
       where reserva_id = r.id and trabajador_id = auth.uid() and tipo = 'servicio' and estado = 'aceptada'
       order by respondido_en desc limit 1;
      if found then
        v_desc := least(v_visita.mano_obra - v_visita.descuento_visita, v_mo);
      end if;
    elsif r.estado not in ('aceptada','en_camino','en_curso') then
      raise exception 'Este servicio ya no admite adicionales';
    end if;
  end if;

  select coalesce(max(version), 0) + 1 into v_version from propuestas
   where reserva_id = r.id and trabajador_id = auth.uid() and tipo = p_tipo;
  update propuestas set estado = 'reemplazada', respondido_en = now()
   where reserva_id = r.id and trabajador_id = auth.uid() and tipo = p_tipo and estado = 'ofrecida';

  insert into propuestas (reserva_id, trabajador_id, tipo, modalidad, version, mano_obra, materiales, movilidad,
                          otros, descuento_visita, alcance, incluye, no_incluye, condiciones, vigente_hasta)
  values (r.id, auth.uid(), p_tipo, r.modalidad_precio, v_version, v_mo, v_mat, v_mov, v_otr, v_desc,
          trim(p_alcance), coalesce(p_incluye, '{}'), coalesce(p_no_incluye, '{}'), coalesce(p_condiciones, '{}'),
          now() + make_interval(hours => greatest(coalesce(p_validez_horas, 48), 1)))
  returning id into v_id;

  perform fn_aviso(r.cliente_id, 'Tienes una propuesta', 'Revisa y responde la propuesta de ' || r.servicio || '.', '/reservas');
  return v_id;
end $function$;

-- fn_preparar_reserva_nueva
CREATE OR REPLACE FUNCTION public.fn_preparar_reserva_nueva()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t trabajadores%rowtype;
  v_lima timestamp;
begin
  if coalesce(auth.role(), '') in ('authenticated','anon') and not es_admin() then
    new.estado := 'solicitada';
    new.comision_pct := 20;
    new.pago_confirmado := false;
    new.total := null;
    new.total_cliente := null;
    new.tarifa_hora := null;
    new.inicio_real := null;
    new.fin_real := null;
    new.fin_estimado := null;
    new.en_camino_en := null;
    new.hora_llegada := null;
    new.ubicacion_lat := null;
    new.ubicacion_lng := null;
    new.ubicacion_actualizada_en := null;
    -- Kit de limpieza: S/18 (S/13 profesional + S/5 Limpi), solo si se pidió.
    new.recargo_materiales := case when new.con_materiales then 18 else 0 end;

    -- "Lo antes posible": la hora la fija el servidor (ahora + 30 min, redondeado a 5 min, hora de Lima).
    -- "Programada": tiene que faltar al menos ~30 min (25 de tolerancia por la demora de la red).
    if new.programacion = 'ahora' then
      v_lima := to_timestamp(ceil(extract(epoch from (now() + interval '30 minutes')) / 300) * 300) at time zone 'America/Lima';
      new.fecha := v_lima::date;
      new.hora := v_lima::time;
    elsif (new.fecha + new.hora) < ((now() at time zone 'America/Lima') + interval '25 minutes') then
      raise exception 'Elige una hora que falte al menos 30 minutos';
    end if;

    -- La forma de cobro tiene que estar permitida para ese servicio y, si no es
    -- por horas, las propuestas tienen que estar activas. No se sustituye una
    -- modalidad por horas.
    if not exists (
      select 1 from servicio_modalidades where servicio = new.servicio and modalidad = new.modalidad_precio
    ) then
      raise exception 'Esa forma de contratar no está disponible para este servicio';
    end if;
    if new.modalidad_precio <> 'horas' and not fn_propuestas_activas() then
      raise exception 'Esa forma de contratar todavía no está disponible';
    end if;
    if new.servicio = 'Mantenimiento y reparaciones generales'
       and fn_oficio_en_texto(new.descripcion_trabajo) is not null then
      raise exception 'Ese trabajo es de %. Reparaciones generales no cubre electricidad, gasfitería ni otros oficios: pídelo en ese servicio.',
        fn_oficio_en_texto(new.descripcion_trabajo);
    end if;
  end if;

  if length(coalesce(new.descripcion_trabajo, '')) > 1000 then
    raise exception 'La descripción es muy larga (máximo 1000 caracteres)';
  end if;

  if new.modo = 'directo' then
    if new.trabajador_id is null then
      raise exception 'Falta elegir al profesional';
    end if;
    if new.modalidad_precio <> 'horas' then
      raise exception 'Por ahora solo se puede pedir directamente a un profesional por horas';
    end if;
    select * into v_t from trabajadores where id = new.trabajador_id;
    if not found or not v_t.habilitado_trabajar then
      raise exception 'Ese profesional no está disponible';
    end if;
    if not (new.servicio = any(v_t.servicios)) then
      raise exception 'Ese profesional no ofrece este servicio';
    end if;
    if new.con_materiales and not v_t.kit_propio then
      raise exception 'Ese profesional no ofrece llevar su propio kit de limpieza';
    end if;
    new.tarifa_hora := v_t.tarifa_hora;
    new.total := round(v_t.tarifa_hora * new.horas * new.personas, 2) + new.recargo_materiales;
    new.total_cliente := new.total;
    new.ventana_cierra_en := now() + interval '15 minutes';
  else
    if new.trabajador_id is not null then
      raise exception 'Un pedido abierto no lleva profesional asignado';
    end if;
    new.ventana_cierra_en := now() + interval '10 minutes';
  end if;
  return new;
end $function$;

-- fn_proteger_detalles_servicio
CREATE OR REPLACE FUNCTION public.fn_proteger_detalles_servicio()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.detalles_servicio is distinct from old.detalles_servicio
     and auth.uid() is distinct from old.cliente_id
     and not es_admin() then
    raise exception 'Solo la clienta puede cambiar los detalles del servicio';
  end if;
  return new;
end $function$;

-- fn_proteger_economia
CREATE OR REPLACE FUNCTION public.fn_proteger_economia()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if current_user in ('authenticated','anon') and not es_admin() then
    if new.total is distinct from old.total
       or new.total_cliente is distinct from old.total_cliente
       or new.tarifa_hora is distinct from old.tarifa_hora
       or new.comision_pct is distinct from old.comision_pct
       or new.pago_confirmado is distinct from old.pago_confirmado
       or new.modalidad_precio is distinct from old.modalidad_precio
       or new.personas is distinct from old.personas
       or new.cantidad is distinct from old.cantidad
       or new.con_materiales is distinct from old.con_materiales
       or new.recargo_materiales is distinct from old.recargo_materiales
       or new.trabajador_id is distinct from old.trabajador_id
       or new.necesidad is distinct from old.necesidad
       -- Lo que define QUÉ se contrató y CUÁNDO: las validaciones de modalidad y de oficio corren al
       -- insertar, así que cambiarlo después sería saltárselas. (reintentar_solicitud lo cambia con
       -- permisos del servidor.)
       or new.servicio is distinct from old.servicio
       or new.subtipo_servicio is distinct from old.subtipo_servicio
       or new.descripcion_trabajo is distinct from old.descripcion_trabajo
       or new.horas is distinct from old.horas
       or new.fecha is distinct from old.fecha
       or new.hora is distinct from old.hora
       or new.zona is distinct from old.zona
       or new.modo is distinct from old.modo
       or new.programacion is distinct from old.programacion
       or new.ventana_cierra_en is distinct from old.ventana_cierra_en
       or new.zona_ampliada is distinct from old.zona_ampliada
       or new.elegir_por_mi is distinct from old.elegir_por_mi then
      raise exception 'Ese dato lo calcula Limpi y no se puede cambiar desde la app';
    end if;
  end if;
  return new;
end $function$;

-- puede_ver_foto_referencia
CREATE OR REPLACE FUNCTION public.puede_ver_foto_referencia(p_ruta text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if v_reserva.cliente_id = auth.uid() or v_reserva.trabajador_id = auth.uid() or es_admin() then
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
end $function$;

-- fn_trabajador_guardas
CREATE OR REPLACE FUNCTION public.fn_trabajador_guardas()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' and not es_admin() then
    if new.verificado is distinct from old.verificado then
      raise exception 'Solo un administrador puede verificar';
    end if;
    if new.verificacion_rechazada is distinct from old.verificacion_rechazada then
      raise exception 'Solo un administrador puede rechazar una verificación';
    end if;
    if new.estado_migratorio in ('validado','rechazado')
       and new.estado_migratorio is distinct from old.estado_migratorio then
      raise exception 'Solo un administrador puede validar el estatus migratorio';
    end if;
    -- Si no, alguien extranjera con estatus migratorio pendiente/rechazado
    -- podría declararse "peruana" desde su propio perfil y autohabilitarse
    -- sin pasar por el admin.
    if new.nacionalidad is distinct from old.nacionalidad then
      raise exception 'Solo un administrador puede cambiar la nacionalidad declarada';
    end if;
  end if;

  new.habilitado_trabajar := new.verificado
    and (new.nacionalidad = 'peruana' or new.estado_migratorio = 'validado');

  if not new.habilitado_trabajar then
    new.disponible_ahora := false;
  end if;

  return new;
end $function$;

-- fn_push_trabajadores_insert
CREATE OR REPLACE FUNCTION public.fn_push_trabajadores_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admins uuid[];
begin
  select array_agg(user_id) into v_admins from admins;
  perform fn_enviar_push(v_admins, 'Nueva trabajadora pendiente', 'Hay una trabajadora nueva para verificar.', '/admin');
  return new;
end $function$;

-- fn_push_trabajadores_update
CREATE OR REPLACE FUNCTION public.fn_push_trabajadores_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admins uuid[];
begin
  if new.estado_migratorio = 'pendiente_validacion' and old.estado_migratorio is distinct from new.estado_migratorio then
    select array_agg(user_id) into v_admins from admins;
    perform fn_enviar_push(v_admins, 'Verificación migratoria pendiente',
      'Una trabajadora adjuntó documentos migratorios para validar.', '/admin');
  end if;
  return new;
end $function$;

-- postularme_a_reserva
CREATE OR REPLACE FUNCTION public.postularme_a_reserva(p_reserva_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t trabajadores%rowtype;
  v_r reservas%rowtype;
begin
  if auth.uid() is null or not es_profesional() then
    raise exception 'Solo un profesional puede postularse';
  end if;

  select * into v_t from trabajadores where id = auth.uid();
  if not found or not v_t.habilitado_trabajar then
    raise exception 'Debes estar habilitado para postularte';
  end if;

  select * into v_r from reservas where id = p_reserva_id for update;
  if not found or v_r.estado <> 'solicitada' or v_r.modo <> 'abierto' or v_r.trabajador_id is not null then
    raise exception 'Esta reserva ya no está disponible';
  end if;
  if v_r.cliente_id = auth.uid() then
    raise exception 'No puedes postularte a tu propio pedido';
  end if;
  if v_r.ventana_cierra_en is not null and v_r.ventana_cierra_en < now() then
    raise exception 'Esta reserva ya no está disponible';
  end if;
  if v_r.modalidad_precio <> 'horas' and not fn_propuestas_activas() then
    raise exception 'Esa forma de contratar todavía no está disponible';
  end if;

  if v_r.programacion = 'ahora'
     and (not v_t.disponible_ahora or v_t.ultima_actividad < now() - interval '8 hours') then
    raise exception 'Debes estar disponible ahora para postularte a este pedido';
  end if;

  if not (v_r.servicio = any(v_t.servicios)) then
    raise exception 'No ofreces ese servicio';
  end if;
  if not (v_r.zona = any(v_t.zonas) or v_r.zona_ampliada) then
    raise exception 'Esa zona no es una de tus zonas de atención';
  end if;
  if v_r.con_materiales and not v_t.kit_propio then
    raise exception 'Este pedido requiere que lleves tu propio kit de limpieza';
  end if;
  if not trabajador_disponible_en(v_t.id, v_r.fecha, v_r.hora, v_r.horas) then
    raise exception 'Ya tienes un trabajo que se cruza con ese horario';
  end if;

  insert into candidaturas (reserva_id, trabajador_id) values (p_reserva_id, auth.uid());
  perform fn_crear_oferta(p_reserva_id, auth.uid());
end $function$;

-- fn_proteger_reserva (la variable local es_admin pasa a v_es_admin para no chocar con la función es_admin())
CREATE OR REPLACE FUNCTION public.fn_proteger_reserva()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  es_trabajador boolean := old.trabajador_id is not null and auth.uid() = old.trabajador_id;
  es_cliente boolean := auth.uid() = old.cliente_id;
  v_es_admin boolean := es_admin();
begin
  if new.cliente_id is distinct from old.cliente_id then
    raise exception 'No se puede cambiar la clienta de una reserva';
  end if;

  if new.foto_referencia_ruta is distinct from old.foto_referencia_ruta and not es_cliente and not v_es_admin then
    raise exception 'Solo la clienta puede cambiar la foto de referencia';
  end if;

  if v_es_admin then
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
end $function$;

-- ---------- 8. Políticas (solo cambia la comprobación del rol; el resto de cada condición queda igual) ----------
-- app_config
drop policy if exists app_config_select on app_config;
create policy app_config_select on app_config for select using (es_admin());
drop policy if exists app_config_update on app_config;
create policy app_config_update on app_config for update using (es_admin());

-- candidaturas
drop policy if exists cand_select on candidaturas;
create policy cand_select on candidaturas for select
  using (
    auth.uid() = trabajador_id
    or es_admin()
    or exists (select 1 from reservas r where r.id = reserva_id and r.cliente_id = auth.uid())
  );

-- pagos
drop policy if exists pagos_select on pagos;
create policy pagos_select on pagos for select
  using (
    es_admin()
    or exists (select 1 from reservas r where r.id = pagos.reserva_id and r.cliente_id = auth.uid())
  );

-- perfiles (update gana WITH CHECK: nadie puede dejar la fila de otra persona)
drop policy if exists perfiles_select on perfiles;
create policy perfiles_select on perfiles for select using (auth.uid() = id or es_admin());
drop policy if exists perfiles_update on perfiles;
create policy perfiles_update on perfiles for update
  using (auth.uid() = id or es_admin())
  with check (auth.uid() = id or es_admin());
drop policy if exists perfiles_delete on perfiles;
create policy perfiles_delete on perfiles for delete using (auth.uid() = id or es_admin());

-- precios_profesional (insertar precios exige estar habilitado)
drop policy if exists precios_select on precios_profesional;
create policy precios_select on precios_profesional for select using (auth.uid() = trabajador_id or es_admin());
drop policy if exists precios_insert on precios_profesional;
create policy precios_insert on precios_profesional for insert
  with check (auth.uid() = trabajador_id and es_profesional_habilitado());

-- préstamos de kit
drop policy if exists prestamos_select on prestamos_kit;
create policy prestamos_select on prestamos_kit for select using (auth.uid() = trabajador_id or es_admin());
drop policy if exists prestamos_insert on prestamos_kit;
create policy prestamos_insert on prestamos_kit for insert with check (es_admin());
drop policy if exists prestamos_update on prestamos_kit;
create policy prestamos_update on prestamos_kit for update using (es_admin());
drop policy if exists prestamo_mov_select on prestamo_kit_movimientos;
create policy prestamo_mov_select on prestamo_kit_movimientos for select
  using (
    es_admin()
    or exists (select 1 from prestamos_kit p where p.id = prestamo_kit_movimientos.prestamo_id and p.trabajador_id = auth.uid())
  );

-- propuestas
drop policy if exists propuestas_select on propuestas;
create policy propuestas_select on propuestas for select
  using (
    auth.uid() = trabajador_id
    or es_admin()
    or exists (select 1 from reservas r where r.id = propuestas.reserva_id and r.cliente_id = auth.uid())
  );

-- push_subscriptions
drop policy if exists push_subscriptions_select on push_subscriptions;
create policy push_subscriptions_select on push_subscriptions for select using (auth.uid() = user_id or es_admin());
drop policy if exists push_subscriptions_delete on push_subscriptions;
create policy push_subscriptions_delete on push_subscriptions for delete using (auth.uid() = user_id or es_admin());

-- reservas (res_insert: cualquier usuario autenticado puede pedir; el CHECK impide contratarse a sí mismo)
drop policy if exists res_insert on reservas;
create policy res_insert on reservas for insert with check (auth.uid() = cliente_id);
drop policy if exists res_select on reservas;
create policy res_select on reservas for select using (auth.uid() in (cliente_id, trabajador_id) or es_admin());
drop policy if exists res_update on reservas;
create policy res_update on reservas for update using (auth.uid() in (cliente_id, trabajador_id) or es_admin());

-- trabajadores (trab_insert queda igual: solo la propia fila; lo demás lo fuerza trg_trabajador_alta_pendiente)
drop policy if exists trab_select on trabajadores;
create policy trab_select on trabajadores for select using (auth.uid() = id or es_admin());
drop policy if exists trab_update on trabajadores;
create policy trab_update on trabajadores for update using (auth.uid() = id or es_admin());

-- Storage: documentos (lectura solo del dueño y de un admin)
drop policy if exists documentos_select_propio_o_admin on storage.objects;
create policy documentos_select_propio_o_admin on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and ((storage.foldername(name))[1] = auth.uid()::text or es_admin()));

-- ---------- 9. Endurecimiento (E) ----------
alter function mi_rol() set search_path = public;

-- Triggers y utilidades internas: la API no debe poder llamarlas (los triggers no necesitan EXECUTE para dispararse).
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prorettype = 'pg_catalog.trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;
revoke execute on function fn_oficio_en_texto(text) from public, anon, authenticated;
revoke execute on function emitir_prestamo_kit(uuid, numeric, text) from public, anon;   -- solo la llama un admin autenticado

-- ---------- 10. Comprobaciones finales (si algo falla, se revierte TODO) ----------
do $$
declare n int;
begin
  select count(*) into n from pg_policies
   where schemaname in ('public', 'storage') and (coalesce(qual, '') ~ 'mi_rol\(' or coalesce(with_check, '') ~ 'mi_rol\(');
  if n > 0 then raise exception '0016: quedan % políticas que aún usan mi_rol()', n; end if;

  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace and proname <> 'mi_rol' and prosrc ~ 'mi_rol\(';
  if n > 0 then raise exception '0016: quedan % funciones que aún usan mi_rol()', n; end if;

  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace and prosrc ~* 'perfiles +where +rol';
  if n > 0 then raise exception '0016: quedan % funciones que aún leen perfiles.rol', n; end if;

  select count(*) into n from pg_views where schemaname = 'public' and definition ~ 'mi_rol\(';
  if n > 0 then raise exception '0016: quedan % vistas que aún usan mi_rol()', n; end if;

  -- Ninguna función SECURITY DEFINER sin search_path fijo
  select count(*) into n from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  if n > 0 then raise exception '0016: % funciones SECURITY DEFINER sin search_path fijo', n; end if;

  -- La API no ejecuta ninguna función de trigger
  select count(*) into n from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prorettype = 'pg_catalog.trigger'::regtype
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if n > 0 then raise exception '0016: % funciones de trigger siguen ejecutables por la API', n; end if;

  -- admins: invisible para la API
  if has_table_privilege('authenticated', 'public.admins', 'select') or has_table_privilege('anon', 'public.admins', 'select')
     or has_table_privilege('authenticated', 'public.admins', 'insert') or has_table_privilege('authenticated', 'public.admins', 'update') then
    raise exception '0016: la tabla admins quedó accesible para la API';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.admins'::regclass) then
    raise exception '0016: admins sin RLS';
  end if;

  -- Orden de los triggers de trabajadores: alta_pendiente < guardas < verificacion_y_reputacion
  if not ('trg_trabajador_alta_pendiente' < 'trg_trabajador_guardas' and 'trg_trabajador_guardas' < 'trg_trabajador_verificacion_y_reputacion') then
    raise exception '0016: orden de triggers inesperado';
  end if;
  select count(*) into n from pg_trigger
   where tgrelid = 'public.trabajadores'::regclass and tgname in ('trg_trabajador_alta_pendiente', 'trg_trabajador_guardas', 'trg_trabajador_verificacion_y_reputacion') and tgenabled = 'O';
  if n <> 3 then raise exception '0016: faltan triggers activos en trabajadores'; end if;
  select count(*) into n from pg_trigger
   where tgrelid = 'public.perfiles'::regclass and tgname = 'trg_proteger_rol_perfiles' and tgenabled = 'O';
  if n <> 1 then raise exception '0016: falta el trigger de perfiles.rol'; end if;

  select count(*) into n from admins;
  if n = 0 then raise warning '0016: la tabla admins está vacía; asigna un admin con  insert into admins (user_id) values (...)'; end if;
  select count(*) into n from perfiles p where p.rol = 'admin' and not exists (select 1 from admins a where a.user_id = p.id);
  if n > 0 then raise notice '0016: % perfil(es) con rol=admin NO migrados a admins (sin poder de admin desde ahora)', n; end if;
end $$;

-- mi_rol() ya no tiene llamadores: se cierra a la API y queda para eliminarla en una migración posterior.
revoke execute on function mi_rol() from public, anon, authenticated;

commit;
