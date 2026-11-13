-- ============================================================
-- 0017 — Avisos push por app (cliente / profesional / admin) y cierre de funciones ejecutables por la API
-- ============================================================
-- Estado: PREPARADA. Se pega en el SQL Editor de LIMPIA (rol postgres) DESPUÉS de la 0016. UNA sola transacción, idempotente.
-- Reversa: supabase/rollback/0017_rollback.sql. Pruebas: supabase/tests/migracion-0017.mjs (PGlite) y supabase/tests/send-push.mjs.
--
-- ORDEN DE PUESTA EN MARCHA (importa):
--   1. Esta migración (agrega la columna app y cambia fn_enviar_push; mientras tanto la Edge Function VIEJA sigue enviando a todo).
--   2. Publicar las apps nuevas (cada una guarda su suscripción con su valor de app).
--   3. Desplegar la Edge Function send-push nueva (envía solo a la app destino). Si se despliega antes del paso 1,
--      los avisos no llevan app y NO se envía nada.
--
-- Qué cambia
--   1. push_subscriptions.app ('cliente' | 'profesional' | 'admin'), NULABLE, con CHECK. Las filas que ya existen quedan en NULL
--      (no se migran a ningún valor): una suscripción sin app ya NO recibe avisos hasta que esa persona vuelva a activar las
--      notificaciones desde la app correspondiente.
--   2. fn_enviar_push y fn_aviso reciben la app destino (p_app). Pedidos entrantes y todo lo que es para quien trabaja -> 'profesional';
--      propuestas, estados del servicio y pagos -> 'cliente'; avisos de verificación -> 'admin'. Una app inválida no envía nada.
--   3. Enlaces con el dominio de cada app: app_config.url_app_cliente / url_app_profesional / url_app_admin (se llenan a mano cuando
--      se fijen los dominios). Si el dominio de esa app está vacío, el aviso lleva la ruta relativa como hasta ahora.
--   4. Cierre de funciones ejecutables por la API: solo quedan ejecutables (anon/authenticated) las funciones que la app usa o que
--      las políticas necesitan; todo lo demás se cierra. La migración comprueba que ninguna política, valor por defecto ni
--      CHECK dependa de una función cerrada.
-- Qué NO hace: no cambia privilegios por defecto (una función nueva creada después nace ejecutable: hay que cerrarla igual).
--   Las funciones que no avisan (reintentar_solicitud, etc.) no se tocan.

begin;

-- ---------- 1. Columna app en push_subscriptions ----------
alter table push_subscriptions add column if not exists app text;
alter table push_subscriptions drop constraint if exists push_subscriptions_app_check;
alter table push_subscriptions add constraint push_subscriptions_app_check check (app in ('cliente', 'profesional', 'admin'));
comment on column push_subscriptions.app is 'App en la que se creó la suscripción (cliente, profesional o admin). NULL = suscripción anterior a la 0017: no recibe avisos hasta que se vuelva a activar.';

-- ---------- 2. Dominio de cada app (para los enlaces de los avisos) ----------
alter table app_config add column if not exists url_app_cliente text;
alter table app_config add column if not exists url_app_profesional text;
alter table app_config add column if not exists url_app_admin text;
alter table app_config drop constraint if exists app_config_urls_app_check;
alter table app_config add constraint app_config_urls_app_check check (
  (url_app_cliente is null or url_app_cliente ~ '^https://[^/ ]+$')
  and (url_app_profesional is null or url_app_profesional ~ '^https://[^/ ]+$')
  and (url_app_admin is null or url_app_admin ~ '^https://[^/ ]+$')
);
comment on column app_config.url_app_cliente is 'Dominio de la app YAVI (cliente), sin barra final. Ej. https://yavi.pe. Se llena a mano: update app_config set url_app_cliente = ''https://...'' where id = true;';

-- ---------- 3. Envío por app ----------
drop function if exists fn_enviar_push(uuid[], text, text, text);
drop function if exists fn_aviso(uuid, text, text, text);

create or replace function fn_enviar_push(p_user_ids uuid[], p_titulo text, p_cuerpo text, p_url text, p_app text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cfg app_config%rowtype;
  v_base text;
  v_url text;
begin
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return;
  end if;
  -- Sin app destino válida no se envía nada (nunca "a todas las apps").
  if p_app is null or p_app not in ('cliente', 'profesional', 'admin') then
    return;
  end if;

  select * into v_cfg from app_config where id = true;
  if v_cfg.push_function_url is null then
    return;
  end if;

  v_base := case p_app when 'cliente' then v_cfg.url_app_cliente when 'profesional' then v_cfg.url_app_profesional else v_cfg.url_app_admin end;
  v_url := case when v_base is not null and p_url like '/%' then rtrim(v_base, '/') || p_url else p_url end;

  perform net.http_post(
    url := v_cfg.push_function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_cfg.push_function_secret),
    body := jsonb_build_object('user_ids', to_jsonb(p_user_ids), 'titulo', p_titulo, 'cuerpo', p_cuerpo, 'url', v_url, 'app', p_app)
  );
end $$;

create or replace function fn_aviso(p_user_id uuid, p_titulo text, p_cuerpo text, p_url text, p_app text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform fn_enviar_push(array[p_user_id], p_titulo, p_cuerpo, p_url, p_app);
exception when others then
  null;
end $$;

revoke all on function fn_enviar_push(uuid[], text, text, text, text) from public, anon, authenticated;
revoke all on function fn_aviso(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------- 4. Funciones que avisan (solo cambia la llamada: se agrega la app destino) ----------
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
    '/reservas', 'cliente');
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

  perform fn_aviso(r.cliente_id, 'Tienes una propuesta', 'Revisa y responde la propuesta de ' || r.servicio || '.', '/reservas', 'cliente');
  return v_id;
end $function$;

-- fn_notificar_pedido_abierto
CREATE OR REPLACE FUNCTION public.fn_notificar_pedido_abierto(p_reserva_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r reservas%rowtype;
  v_dest uuid[];
begin
  select * into r from reservas where id = p_reserva_id;
  if not found or r.estado <> 'solicitada' or r.modo <> 'abierto' or r.trabajador_id is not null
     or r.modalidad_precio <> 'horas' then
    return;
  end if;
  select array_agg(t.id) into v_dest
  from trabajadores t
  where t.disponible_ahora
    and t.habilitado_trabajar
    and t.ultima_actividad > now() - interval '8 hours'
    and r.servicio = any(t.servicios)
    and r.zona = any(t.zonas)
    and (not r.con_materiales or t.kit_propio)
    and trabajador_disponible_en(t.id, r.fecha, r.hora, r.horas);
  perform fn_enviar_push(
    v_dest, 'Pedido cerca de ti',
    r.servicio || ' · ' || r.zona || ' · ' || r.horas || 'h. Postúlate en la app.', '/panel'
  , 'profesional');
end $function$;

-- fn_push_candidaturas_insert
CREATE OR REPLACE FUNCTION public.fn_push_candidaturas_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cliente_id uuid;
  v_servicio text;
begin
  select cliente_id, servicio into v_cliente_id, v_servicio from reservas where id = new.reserva_id;
  if v_cliente_id is not null then
    perform fn_enviar_push(array[v_cliente_id], 'Nueva postulación',
      'Una trabajadora se postuló a tu pedido de ' || v_servicio || '.', '/reservas', 'cliente');
  end if;
  return new;
end $function$;

-- fn_push_candidaturas_update
CREATE OR REPLACE FUNCTION public.fn_push_candidaturas_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.estado = 'elegida' and old.estado is distinct from new.estado then
    perform fn_enviar_push(array[new.trabajador_id], '¡Te eligieron!',
      'La clienta te eligió para su servicio. Revísalo en tu panel.', '/panel', 'profesional');
  end if;
  return new;
end $function$;

-- fn_push_reservas_insert
CREATE OR REPLACE FUNCTION public.fn_push_reservas_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.estado <> 'solicitada' then
    return new;
  end if;
  if new.modo = 'directo' and new.trabajador_id is not null then
    perform fn_enviar_push(
      array[new.trabajador_id], 'Nuevo pedido directo',
      'Tienes 15 min para aceptar: ' || new.servicio || ' · ' || new.zona, '/panel'
    , 'profesional');
  elsif new.modo = 'abierto' and new.trabajador_id is null then
    perform fn_notificar_pedido_abierto(new.id);
  end if;
  return new;
end $function$;

-- fn_push_reservas_update
CREATE OR REPLACE FUNCTION public.fn_push_reservas_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.estado is distinct from old.estado then
    if new.modo = 'directo' and new.estado = 'aceptada' and old.estado = 'solicitada' then
      perform fn_enviar_push(array[new.cliente_id], 'Pedido directo aceptado',
        'Tu pedido de ' || new.servicio || ' fue aceptado.', '/reservas', 'cliente');
    elsif new.modo = 'directo' and new.estado = 'rechazada' and old.estado = 'solicitada' then
      perform fn_enviar_push(array[new.cliente_id], 'Pedido directo rechazado',
        'No pudo aceptar tu pedido de ' || new.servicio || '. Búscala de nuevo o elige otra trabajadora.', '/reservas', 'cliente');
    elsif new.estado = 'cancelada' and new.trabajador_id is not null and old.estado in ('solicitada','aceptada') then
      perform fn_enviar_push(array[new.trabajador_id], 'La clienta canceló',
        'Se canceló el servicio de ' || new.servicio || '.', '/panel', 'profesional');
    elsif new.estado = 'en_curso' then
      perform fn_enviar_push(array[new.cliente_id], 'Tu servicio empezó',
        'La trabajadora ya inició el servicio de ' || new.servicio || '.', '/reservas', 'cliente');
    elsif new.estado = 'completada' then
      perform fn_enviar_push(array[new.cliente_id], 'Servicio finalizado',
        'Terminó tu servicio de ' || new.servicio || '. ¿Cómo te fue? Califica a tu trabajadora.', '/reservas', 'cliente');
    end if;
  elsif new.direccion is distinct from old.direccion and new.trabajador_id is not null then
    perform fn_enviar_push(array[new.trabajador_id], 'Cambió la dirección',
      'La clienta actualizó la dirección de ' || new.servicio || '.', '/panel', 'profesional');
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
  perform fn_enviar_push(v_admins, 'Nueva trabajadora pendiente', 'Hay una trabajadora nueva para verificar.', '/admin', 'admin');
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
      'Una trabajadora adjuntó documentos migratorios para validar.', '/admin', 'admin');
  end if;
  return new;
end $function$;

-- responder_propuesta
CREATE OR REPLACE FUNCTION public.responder_propuesta(p_propuesta_id uuid, p_aceptar boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p propuestas%rowtype;
  r reservas%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;
  select * into p from propuestas where id = p_propuesta_id;
  if not found then raise exception 'Esa propuesta no existe'; end if;
  select * into r from reservas where id = p.reserva_id for update;
  if r.cliente_id is distinct from auth.uid() then
    raise exception 'No tienes permiso para responder esta propuesta';
  end if;
  select * into p from propuestas where id = p_propuesta_id for update;
  if p.estado <> 'ofrecida' then
    raise exception 'Esta propuesta ya fue respondida';
  end if;
  if p.vigente_hasta is not null and p.vigente_hasta < now() then
    raise exception 'Esta propuesta venció';
  end if;

  if p_aceptar then
    if p.tipo = 'servicio' then
      raise exception 'Para contratar al profesional usa "Contratar"';
    end if;
    if r.trabajador_id is distinct from p.trabajador_id or r.estado not in ('aceptada','en_camino','en_curso') then
      raise exception 'Este servicio ya no admite cambios';
    end if;
    perform fn_marcar_aceptada(p.id, auth.uid());
    perform fn_recalcular_totales(r.id);
    perform fn_aviso(p.trabajador_id, 'Aceptaron tu propuesta', 'El cliente aceptó tu propuesta de ' || r.servicio || '.', '/panel', 'profesional');
  else
    update propuestas set estado = 'rechazada', respondido_en = now() where id = p.id;
    perform fn_aviso(p.trabajador_id, 'Rechazaron tu propuesta', 'El cliente no aceptó tu propuesta de ' || r.servicio || '.', '/panel', 'profesional');
  end if;
end $function$;

-- ---------- 5. Cierre de funciones ejecutables por la API ----------
-- Quedan ejecutables (anon/authenticated) solo las que la app llama con .rpc(), las capacidades y las que usan las políticas.
-- Las funciones de extensiones no se tocan. Los triggers no necesitan EXECUTE para dispararse.
do $$
declare
  f record;
  permitidas text[] := array[
    'confirmar_pago', 'contratar_propuesta', 'elegir_candidata', 'emitir_prestamo_kit', 'enviar_propuesta',
    'es_admin', 'es_profesional', 'es_profesional_habilitado', 'postularme_a_reserva', 'puede_ver_foto_referencia',
    'registrar_pago', 'reintentar_solicitud', 'responder_propuesta', 'trabajador_disponible_en'
  ];
begin
  for f in
    select p.proname, p.oid::regprocedure::text as firma
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    if f.proname = any (permitidas) then continue; end if;
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;

-- ---------- 6. Comprobaciones finales (si algo falla, se revierte TODO) ----------
do $$
declare
  n int;
  v_llamadas int;
  v_con_app int;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'push_subscriptions' and column_name = 'app') then
    raise exception '0017: falta push_subscriptions.app';
  end if;
  select count(*) into n from pg_constraint where conname = 'push_subscriptions_app_check' and conrelid = 'public.push_subscriptions'::regclass;
  if n <> 1 then raise exception '0017: falta el CHECK de push_subscriptions.app'; end if;

  -- Las firmas viejas ya no existen y las nuevas no son ejecutables por la API
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname in ('fn_enviar_push', 'fn_aviso')
     and pronargs <> 5;
  if n > 0 then raise exception '0017: quedan firmas antiguas de fn_enviar_push/fn_aviso'; end if;
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('fn_enviar_push', 'fn_aviso')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if n > 0 then raise exception '0017: fn_enviar_push/fn_aviso son ejecutables por la API'; end if;

  -- Toda llamada a fn_enviar_push(...) / fn_aviso(...) (salvo la que hace fn_aviso con su propio parámetro) termina en una app válida
  select coalesce(sum((select count(*) from regexp_matches(prosrc, 'fn_(enviar_push|aviso)[[:space:]]*[(]', 'g'))), 0),
         coalesce(sum((select count(*) from regexp_matches(prosrc, 'fn_(enviar_push|aviso)[[:space:]]*[(][^;]*''(cliente|profesional|admin)''[[:space:]]*[)][[:space:]]*;', 'g'))), 0)
    into v_llamadas, v_con_app
    from pg_proc where pronamespace = 'public'::regnamespace and proname not in ('fn_aviso', 'fn_enviar_push');
  if v_llamadas = 0 or v_llamadas <> v_con_app then
    raise exception '0017: % llamadas a fn_enviar_push/fn_aviso, solo % con app destino válida', v_llamadas, v_con_app;
  end if;

  -- Ninguna función pública no permitida es ejecutable por la API
  select count(*) into n from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.proname not in ('confirmar_pago', 'contratar_propuesta', 'elegir_candidata', 'emitir_prestamo_kit', 'enviar_propuesta',
       'es_admin', 'es_profesional', 'es_profesional_habilitado', 'postularme_a_reserva', 'puede_ver_foto_referencia',
       'registrar_pago', 'reintentar_solicitud', 'responder_propuesta', 'trabajador_disponible_en');
  if n > 0 then raise exception '0017: % funciones no permitidas siguen ejecutables por la API', n; end if;

  -- Ninguna política, valor por defecto ni CHECK depende de una función que la API ya no puede ejecutar
  select count(*) into n
    from pg_depend d join pg_proc p on p.oid = d.refobjid
   where d.refclassid = 'pg_proc'::regclass and p.pronamespace = 'public'::regnamespace
     and d.classid in ('pg_policy'::regclass, 'pg_attrdef'::regclass, 'pg_constraint'::regclass)
     and not has_function_privilege('authenticated', p.oid, 'execute');
  if n > 0 then raise exception '0017: % políticas/valores por defecto/CHECK dependen de funciones que la API ya no puede ejecutar', n; end if;

  select count(*) into n from push_subscriptions where app is null;
  raise notice '0017: % suscripción(es) push sin app (no recibirán avisos hasta volver a activarlas)', n;
end $$;

commit;
