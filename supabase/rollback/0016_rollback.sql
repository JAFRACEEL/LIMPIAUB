-- ============================================================
-- Reversa de la 0016 (roles por capacidades)
-- ============================================================
-- ESTADO: PREPARADA. Se pega en el SQL Editor de LIMPIA (rol postgres). Una sola transacción; se puede ejecutar más de una vez.
-- Deja las políticas y las funciones EXACTAMENTE como estaban antes de la 0016 (con 0016a y 0016b ya aplicadas).
--
-- Qué hace
--   1. Devuelve rol='admin' en perfiles a quienes están en la tabla admins (si no, nadie podría administrar tras la reversa).
--   2. Quita el CHECK de autocontratación y el trigger de auditoría/reputación.
--   3. Restaura las políticas y las funciones anteriores (las que usan mi_rol()) y vuelve a abrir mi_rol() a la API.
--   4. Elimina es_admin(), es_profesional(), es_profesional_habilitado() y la tabla admins.
-- Qué NO hace (a propósito)
--   * Conserva las columnas trabajadores.verificado_por / verificado_en (son datos de auditoría; para borrarlas:
--     alter table trabajadores drop column verificado_por, drop column verificado_en;).
--   * No vuelve a abrir a la API las funciones de trigger ni fn_oficio_en_texto (eso es un endurecimiento que conviene mantener).
--   * Deja las 0016a y 0016b tal como están: la reversa NO reabre la escalada de rol ni el alta ya verificada.
--   * Las reputaciones que los triggers hayan actualizado mientras estuvo aplicada la 0016 se conservan.

begin;

-- 1. Los admins recuperan su rol en perfiles
do $$
begin
  if to_regclass('public.admins') is not null then
    update public.perfiles set rol = 'admin' where id in (select user_id from public.admins);
  end if;
end $$;

-- 2. Fuera lo nuevo
alter table reservas drop constraint if exists reservas_no_autocontratacion;
drop trigger if exists trg_trabajador_verificacion_y_reputacion on trabajadores;
drop function if exists fn_trabajador_verificacion_y_reputacion();

-- 3. mi_rol() vuelve a ser el de antes
alter function mi_rol() reset search_path;
grant execute on function mi_rol() to anon, authenticated;

-- 3a. Políticas anteriores
drop policy if exists app_config_select on public.app_config;
create policy app_config_select on public.app_config for select
  using ((mi_rol() = 'admin'::rol));

drop policy if exists app_config_update on public.app_config;
create policy app_config_update on public.app_config for update
  using ((mi_rol() = 'admin'::rol));

drop policy if exists cand_select on public.candidaturas;
create policy cand_select on public.candidaturas for select
  using (((auth.uid() = trabajador_id) OR (mi_rol() = 'admin'::rol) OR (EXISTS ( SELECT 1
   FROM reservas r
  WHERE ((r.id = candidaturas.reserva_id) AND (r.cliente_id = auth.uid()))))));

drop policy if exists pagos_select on public.pagos;
create policy pagos_select on public.pagos for select
  using (((mi_rol() = 'admin'::rol) OR (EXISTS ( SELECT 1
   FROM reservas r
  WHERE ((r.id = pagos.reserva_id) AND (r.cliente_id = auth.uid()))))));

drop policy if exists perfiles_delete on public.perfiles;
create policy perfiles_delete on public.perfiles for delete
  using (((auth.uid() = id) OR (mi_rol() = 'admin'::rol)));

drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles for select
  using (((auth.uid() = id) OR (mi_rol() = 'admin'::rol)));

drop policy if exists perfiles_update on public.perfiles;
create policy perfiles_update on public.perfiles for update
  using (((auth.uid() = id) OR (mi_rol() = 'admin'::rol)));

drop policy if exists precios_insert on public.precios_profesional;
create policy precios_insert on public.precios_profesional for insert
  with check (((auth.uid() = trabajador_id) AND (mi_rol() = 'trabajador'::rol)));

drop policy if exists precios_select on public.precios_profesional;
create policy precios_select on public.precios_profesional for select
  using (((auth.uid() = trabajador_id) OR (mi_rol() = 'admin'::rol)));

drop policy if exists prestamo_mov_select on public.prestamo_kit_movimientos;
create policy prestamo_mov_select on public.prestamo_kit_movimientos for select
  using (((mi_rol() = 'admin'::rol) OR (EXISTS ( SELECT 1
   FROM prestamos_kit p
  WHERE ((p.id = prestamo_kit_movimientos.prestamo_id) AND (p.trabajador_id = auth.uid()))))));

drop policy if exists prestamos_insert on public.prestamos_kit;
create policy prestamos_insert on public.prestamos_kit for insert
  with check ((mi_rol() = 'admin'::rol));

drop policy if exists prestamos_select on public.prestamos_kit;
create policy prestamos_select on public.prestamos_kit for select
  using (((auth.uid() = trabajador_id) OR (mi_rol() = 'admin'::rol)));

drop policy if exists prestamos_update on public.prestamos_kit;
create policy prestamos_update on public.prestamos_kit for update
  using ((mi_rol() = 'admin'::rol));

drop policy if exists propuestas_select on public.propuestas;
create policy propuestas_select on public.propuestas for select
  using (((auth.uid() = trabajador_id) OR (mi_rol() = 'admin'::rol) OR (EXISTS ( SELECT 1
   FROM reservas r
  WHERE ((r.id = propuestas.reserva_id) AND (r.cliente_id = auth.uid()))))));

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions for delete
  using (((auth.uid() = user_id) OR (mi_rol() = 'admin'::rol)));

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select
  using (((auth.uid() = user_id) OR (mi_rol() = 'admin'::rol)));

drop policy if exists res_insert on public.reservas;
create policy res_insert on public.reservas for insert
  with check (((auth.uid() = cliente_id) AND (mi_rol() = 'cliente'::rol)));

drop policy if exists res_select on public.reservas;
create policy res_select on public.reservas for select
  using (auth.uid() in (cliente_id, trabajador_id) or mi_rol() = 'admin');

drop policy if exists res_update on public.reservas;
create policy res_update on public.reservas for update
  using (auth.uid() in (cliente_id, trabajador_id) or mi_rol() = 'admin');

drop policy if exists trab_select on public.trabajadores;
create policy trab_select on public.trabajadores for select
  using (((auth.uid() = id) OR (mi_rol() = 'admin'::rol)));

drop policy if exists trab_update on public.trabajadores;
create policy trab_update on public.trabajadores for update
  using (((auth.uid() = id) OR (mi_rol() = 'admin'::rol)));

drop policy if exists documentos_select_propio_o_admin on storage.objects;
create policy documentos_select_propio_o_admin on storage.objects for select to authenticated
  using (((bucket_id = 'documentos'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (mi_rol() = 'admin'::rol))));

-- 3b. Funciones anteriores (cuerpos tal como estaban antes de la 0016)
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
  if auth.uid() is null or coalesce(mi_rol() = 'admin', false) is not true then
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
  if auth.uid() is null or mi_rol() is distinct from 'trabajador' then
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
  if coalesce(auth.role(), '') in ('authenticated','anon') and coalesce(mi_rol() = 'admin', false) is not true then
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
     and mi_rol() is distinct from 'admin' then
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
  if current_user in ('authenticated','anon') and coalesce(mi_rol() = 'admin', false) is not true then
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

-- fn_proteger_reserva
CREATE OR REPLACE FUNCTION public.fn_proteger_reserva()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
  select array_agg(id) into v_admins from perfiles where rol = 'admin';
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
    select array_agg(id) into v_admins from perfiles where rol = 'admin';
    perform fn_enviar_push(v_admins, 'Verificación migratoria pendiente',
      'Una trabajadora adjuntó documentos migratorios para validar.', '/admin');
  end if;
  return new;
end $function$;

-- fn_trabajador_guardas
CREATE OR REPLACE FUNCTION public.fn_trabajador_guardas()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' and mi_rol() is distinct from 'admin' then
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
  if auth.uid() is null or mi_rol() is distinct from 'trabajador' then
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
end $function$;

-- fn_recalc_rating
CREATE OR REPLACE FUNCTION public.fn_recalc_rating()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  update trabajadores t set
    rating_avg = coalesce((select avg(estrellas) from calificaciones where para_id = new.para_id),0),
    rating_n   = (select count(*) from calificaciones where para_id = new.para_id)
  where t.id = new.para_id;
  return new;
end $function$;

-- fn_reserva_completada
CREATE OR REPLACE FUNCTION public.fn_reserva_completada()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.estado = 'completada' and old.estado <> 'completada' then
    update trabajadores set trabajos_completados = trabajos_completados + 1 where id = new.trabajador_id;
  end if;
  return new;
end $function$;

-- fn_trabajador_alta_pendiente
CREATE OR REPLACE FUNCTION public.fn_trabajador_alta_pendiente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user in ('authenticated', 'anon') then
    new.verificado := false;
    new.habilitado_trabajar := false;
    new.verificacion_rechazada := false;
    new.motivo_rechazo := null;
    new.disponible_ahora := false;
    if new.estado_migratorio in ('validado', 'rechazado') then
      new.estado_migratorio := case when new.nacionalidad = 'peruana' then 'no_aplica' else 'pendiente_validacion' end;
    end if;
    new.rating_avg := 0;
    new.rating_n := 0;
    new.trabajos_completados := 0;
  end if;
  return new;
end $function$;

-- 4. Fuera las capacidades y la tabla admins (ya nadie las usa)
drop function if exists es_profesional_habilitado();
drop function if exists es_profesional();
drop function if exists es_admin();
drop table if exists admins;

-- Comprobación: nada referencia lo eliminado y las políticas con mi_rol() están de vuelta
do $$
declare n int;
begin
  select count(*) into n from pg_policies where schemaname in ('public', 'storage')
    and (coalesce(qual, '') ~ 'es_(admin|profesional)' or coalesce(with_check, '') ~ 'es_(admin|profesional)');
  if n > 0 then raise exception 'Reversa: quedan % políticas con es_admin()/es_profesional()', n; end if;
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and prosrc ~ 'es_(admin|profesional|profesional_habilitado)[ ]*[(]';
  if n > 0 then raise exception 'Reversa: quedan % funciones con es_admin()/es_profesional()', n; end if;
  select count(*) into n from pg_policies where schemaname in ('public', 'storage')
    and (coalesce(qual, '') ~ 'mi_rol\(' or coalesce(with_check, '') ~ 'mi_rol\(');
  if n < 22 then raise exception 'Reversa: faltan políticas con mi_rol() (hay %, se esperaban 22)', n; end if;
end $$;

commit;
