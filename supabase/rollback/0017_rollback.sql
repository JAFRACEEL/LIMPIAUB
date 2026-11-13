-- ============================================================
-- Reversa de la 0017 (avisos push por app)
-- ============================================================
-- ESTADO: PREPARADA. Se pega en el SQL Editor de LIMPIA (rol postgres). Una sola transacción; se puede ejecutar más de una vez.
-- Deja fn_enviar_push, fn_aviso y las funciones que avisan EXACTAMENTE como estaban tras la 0016 (sin app destino).
--
-- IMPORTANTE: junto con esta reversa hay que volver a desplegar la Edge Function send-push ANTERIOR (la que no filtra por app).
-- La función nueva exige que cada aviso traiga su app; con la SQL anterior ninguno la trae y no se enviaría nada.
--
-- Qué NO hace (a propósito)
--   * Conserva la columna push_subscriptions.app y las columnas app_config.url_app_* (son datos; la función anterior las ignora).
--   * No vuelve a abrir a la API las funciones que la 0017 cerró (es un endurecimiento que conviene mantener).

begin;

drop function if exists fn_enviar_push(uuid[], text, text, text, text);
drop function if exists fn_aviso(uuid, text, text, text, text);

-- Funciones de envío anteriores
CREATE OR REPLACE FUNCTION public.fn_enviar_push(p_user_ids uuid[], p_titulo text, p_cuerpo text, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.fn_aviso(p_user_id uuid, p_titulo text, p_cuerpo text, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform fn_enviar_push(array[p_user_id], p_titulo, p_cuerpo, p_url);
exception when others then
  null;
end $function$;

revoke all on function fn_enviar_push(uuid[], text, text, text) from public, anon, authenticated;
revoke all on function fn_aviso(uuid, text, text, text) from public, anon, authenticated;

-- Funciones que avisan, tal como estaban antes de la 0017
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
  );
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
      'Una trabajadora se postuló a tu pedido de ' || v_servicio || '.', '/reservas');
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
      'La clienta te eligió para su servicio. Revísalo en tu panel.', '/panel');
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
    );
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
    perform fn_aviso(p.trabajador_id, 'Aceptaron tu propuesta', 'El cliente aceptó tu propuesta de ' || r.servicio || '.', '/panel');
  else
    update propuestas set estado = 'rechazada', respondido_en = now() where id = p.id;
    perform fn_aviso(p.trabajador_id, 'Rechazaron tu propuesta', 'El cliente no aceptó tu propuesta de ' || r.servicio || '.', '/panel');
  end if;
end $function$;

do $$
declare n int;
begin
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname in ('fn_enviar_push', 'fn_aviso') and pronargs <> 4;
  if n > 0 then raise exception 'Reversa: quedan firmas de la 0017 en fn_enviar_push/fn_aviso'; end if;
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('fn_enviar_push', 'fn_aviso')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  if n > 0 then raise exception 'Reversa: fn_enviar_push/fn_aviso quedaron ejecutables por la API'; end if;
end $$;

commit;
