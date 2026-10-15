-- ============================================================
-- 0015_rollback.sql — REVERSA COMPATIBLE de la migración 0015
-- ============================================================
-- ESTADO: **PENDIENTE DE VALIDACIÓN REAL.** Solo probada en simulación (PGlite, supabase/tests/rollback-0015.mjs).
-- NO se ha ejecutado en ningún proyecto de Supabase. NO ejecutar en LIMPIA sin autorización expresa del dueño.
-- Se aplica sobre una base que ya tiene la 0015. NO es una migración numerada de la cadena (vive en supabase/rollback/).
--
-- Qué hace (reversa "hacia adelante": la base sigue viva y no se pierde ninguna fila):
--   * Restaura las definiciones anteriores de postularme_a_reserva (0006), elegir_candidata (0010),
--     fn_push_reservas_insert (0013) y las vistas v_pedidos_abiertos / v_mis_postulaciones (0014),
--     copiadas literalmente de esos archivos. NO re-ejecuta sus GRANT/REVOKE antiguos: los permisos se
--     reafirman al final (sección 6) para no reintroducir el acceso que 0013 dejaba abierto.
--   * Quita lo que solo existe para el flujo nuevo (trg_oferta_directa) y apaga propuestas_activas.
--   * Mantiene trg_proteger_economia y trg_cerrar_propuestas (protegen importes; no cambian datos).
--   * Sustituye las reglas de inserción de la 0015 por una versión compatible que conserva la seguridad
--     (precio, comisión, pago y estado los fija el servidor) pero no aplica las reglas de producto nuevas
--     (modalidades, oficios, 30 min, "lo antes posible").
--   * "total" NO vuelve a ser columna calculada (eso reescribiría importes de reservas nuevas). Sigue siendo
--     una columna normal y un trigger la calcula con la fórmula antigua SOLO para reservas "por horas",
--     1 persona, sin propuesta aceptada y cuyo total está vacío o aún coincide con esa fórmula.
--   * NO borra tablas, columnas ni filas: propuestas, pagos, precios_profesional, personas, total_cliente,
--     necesidad, etc. quedan intactas (las reservas creadas después de migrar se conservan con sus importes).
-- Idempotente: se puede ejecutar dos veces.

begin;

-- 1. Apagar el flujo nuevo
update app_config set propuestas_activas = false where id = true;
drop trigger if exists trg_oferta_directa on reservas;

-- 2. Funciones anteriores (literales de 0006 / 0010 / 0013)
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

  if v_reserva.ventana_cierra_en is not null and v_reserva.ventana_cierra_en < now() then
    raise exception 'La ventana para postularse a este pedido ya cerró';
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

create or replace function elegir_candidata(p_reserva_id uuid, p_trabajador_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reserva reservas%rowtype;
  v_trabajador trabajadores%rowtype;
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

  select * into v_trabajador from trabajadores where id = p_trabajador_id;
  if not found or not v_trabajador.habilitado_trabajar then
    raise exception 'Esa trabajadora ya no está habilitada para tomar este servicio';
  end if;
  if v_reserva.con_materiales and not v_trabajador.kit_propio then
    raise exception 'Esa trabajadora ya no ofrece llevar su propio kit de limpieza';
  end if;

  update reservas set trabajador_id = p_trabajador_id, tarifa_hora = v_trabajador.tarifa_hora, estado = 'aceptada'
    where id = p_reserva_id;

  update candidaturas set estado = 'elegida'
    where reserva_id = p_reserva_id and trabajador_id = p_trabajador_id;
  update candidaturas set estado = 'liberada'
    where reserva_id = p_reserva_id and trabajador_id <> p_trabajador_id and estado = 'pendiente';
end $$;

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

-- 3. Vistas anteriores (literales de 0014). Se recrean porque una vista no puede perder columnas con
--    "create or replace". Sus permisos vuelven a ser los predeterminados, igual que antes de la 0015.
drop view if exists v_pedidos_abiertos;
create view v_pedidos_abiertos as
select r.id, r.servicio, r.zona, r.fecha, r.hora, r.horas, r.con_materiales,
       r.recargo_materiales, r.comision_pct, r.ventana_cierra_en, r.zona_ampliada, r.creado_en,
       r.subtipo_servicio, r.descripcion_trabajo, r.foto_referencia_ruta,
       r.detalles_servicio - 'privado' as detalles_servicio
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
drop view if exists v_mis_postulaciones;
create view v_mis_postulaciones as
select r.id, r.servicio, r.zona, r.fecha, r.hora, r.horas, r.con_materiales,
       r.recargo_materiales, r.comision_pct, r.ventana_cierra_en, r.zona_ampliada, r.creado_en,
       c.creado_en as postulado_en,
       r.subtipo_servicio, r.descripcion_trabajo, r.foto_referencia_ruta,
       r.detalles_servicio - 'privado' as detalles_servicio
from candidaturas c
join reservas r on r.id = c.reserva_id
where c.trabajador_id = auth.uid() and c.estado = 'pendiente';

-- 4. Inserción compatible: conserva la seguridad de la 0015, sin sus reglas de producto nuevas
create or replace function fn_preparar_reserva_nueva() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_t trabajadores%rowtype;
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
    new.recargo_materiales := case when new.con_materiales then 18 else 0 end;
    if new.modalidad_precio <> 'horas' then
      raise exception 'Esa forma de contratar todavía no está disponible';
    end if;
  end if;

  if length(coalesce(new.descripcion_trabajo, '')) > 1000 then
    raise exception 'La descripción es muy larga (máximo 1000 caracteres)';
  end if;

  if new.modo = 'directo' then
    if new.trabajador_id is null then
      raise exception 'Falta elegir al profesional';
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
    new.ventana_cierra_en := now() + interval '15 minutes';
  else
    if new.trabajador_id is not null then
      raise exception 'Un pedido abierto no lleva profesional asignado';
    end if;
    new.ventana_cierra_en := now() + interval '10 minutes';
  end if;
  return new;
end $$;

-- 5. total: fórmula antigua SOLO para reservas que siguen siendo del modelo antiguo.
--    Nunca toca una reserva con propuesta aceptada, con más de una persona, con otra modalidad, con
--    necesidad registrada ni con un total que ya no coincide con la fórmula (fijado por el servidor o un admin).
create or replace function fn_total_compat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_formula numeric(10,2);
  v_formula_ant numeric(10,2);
begin
  if new.modalidad_precio is distinct from 'horas' or new.personas is distinct from 1
     or new.necesidad is not null or new.tarifa_hora is null then
    return new;
  end if;
  if exists (select 1 from propuestas p where p.reserva_id = new.id and p.estado = 'aceptada') then
    return new;
  end if;
  v_formula := round(new.tarifa_hora * new.horas, 2) + coalesce(new.recargo_materiales, 0);
  if tg_op = 'INSERT' then
    if new.total is null then
      new.total := v_formula;
      if new.total_cliente is null then new.total_cliente := v_formula; end if;
    end if;
    return new;
  end if;
  -- UPDATE: solo si nadie fijó el total en esta misma operación
  if new.total is distinct from old.total then
    return new;
  end if;
  v_formula_ant := case when old.tarifa_hora is null then null
                        else round(old.tarifa_hora * old.horas, 2) + coalesce(old.recargo_materiales, 0) end;
  if old.total is null or old.total = v_formula_ant then
    new.total := v_formula;
    if new.total_cliente is null or new.total_cliente = old.total then new.total_cliente := v_formula; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_zz_total_compat on reservas;
create trigger trg_zz_total_compat before insert or update of tarifa_hora, horas, recargo_materiales on reservas
  for each row execute function fn_total_compat();

-- 6. Permisos (se reafirman SIEMPRE; nunca se restauran los de antes de la 0015)
revoke all on function fn_enviar_push(uuid[], text, text, text) from public, anon, authenticated;
revoke all on function postularme_a_reserva(uuid) from public, anon;
grant execute on function postularme_a_reserva(uuid) to authenticated;
revoke all on function elegir_candidata(uuid, uuid) from public, anon;
grant execute on function elegir_candidata(uuid, uuid) to authenticated;
revoke all on function fn_total_compat() from public, anon, authenticated;

commit;
