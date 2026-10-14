-- Limpi: nueva experiencia del CLIENTE.
--
-- Cambios (todos aditivos y compatibles con lo existente):
--  1. reservas: modalidad de precio, personas, cantidad, programación (ahora /
--     programada), necesidad (texto original + servicio sugerido) y total_cliente.
--     `total` deja de ser columna generada: ahora lo calcula el servidor.
--  2. propuestas: versión de precio, alcance y condiciones que el cliente acepta
--     (servicio, presupuesto de reparación, adicionales). Inmutables al aceptarse.
--  3. precios_profesional: precios fijos / de diagnóstico que configurará cada
--     profesional (el panel del profesional los llena en la etapa siguiente).
--  4. pagos: evidencia de pago manual. El cliente NO puede confirmar pagos.
--  5. Funciones del servidor: contratar_propuesta, responder_propuesta,
--     enviar_propuesta, registrar_pago, confirmar_pago, reintentar_solicitud.
--     elegir_candidata y postularme_a_reserva se reemplazan manteniendo su firma.
--  6. Protección: el cliente ya no puede escribir precio, comisión, total,
--     pago_confirmado ni reasignar el profesional con un UPDATE directo.
--  7. Disponibilidad: "ahora" exige profesional disponible ahora; "programada"
--     solo exige que no tenga otro trabajo que se cruce.
--  8. Modalidades: el SERVIDOR decide qué forma de cobro admite cada servicio
--     (servicio_modalidades) y si las propuestas están activas
--     (app_config.propuestas_activas). VITE_PROPUESTAS_ACTIVAS solo cambia la
--     interfaz: una llamada directa a la API no puede saltarse estas reglas.
--  9. v_cobertura_servicios: conteo (sin datos personales) de profesionales
--     habilitados por servicio y zona, para no ofrecer lo que nadie atiende.
--
-- Idempotente. NO reemplaza datos existentes: las reservas anteriores conservan
-- sus valores (modalidad 'horas', total_cliente = total).

-- ============================================================
-- 1. reservas
-- ============================================================
alter table reservas add column if not exists modalidad_precio text not null default 'horas';
alter table reservas drop constraint if exists reservas_modalidad_precio_check;
alter table reservas add constraint reservas_modalidad_precio_check
  check (modalidad_precio in ('horas','fijo','diagnostico','cotizacion'));

alter table reservas add column if not exists personas int not null default 1;
alter table reservas drop constraint if exists reservas_personas_check;
alter table reservas add constraint reservas_personas_check check (personas between 1 and 4);

alter table reservas add column if not exists cantidad int not null default 1;
alter table reservas drop constraint if exists reservas_cantidad_check;
alter table reservas add constraint reservas_cantidad_check check (cantidad between 1 and 20);

alter table reservas add column if not exists programacion text not null default 'programada';
alter table reservas drop constraint if exists reservas_programacion_check;
alter table reservas add constraint reservas_programacion_check check (programacion in ('ahora','programada'));

alter table reservas add column if not exists necesidad jsonb;
alter table reservas add column if not exists total_cliente numeric(8,2);

-- `total` pasa de columna generada (tarifa × horas + recargo) a columna normal
-- mantenida por el servidor: con precio fijo, diagnóstico o propuesta ya no
-- depende de las horas. Los valores existentes se conservan.
do $$
begin
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.reservas'::regclass and attname = 'total' and attgenerated <> ''
  ) then
    alter table reservas alter column total drop expression;
  end if;
end $$;

-- Lo que paga el cliente: en reservas anteriores es igual a `total`.
update reservas set total_cliente = total where total_cliente is null and total is not null;

-- `total`        = mano de obra + kit de limpieza (base del panel de ganancias; la
--                  comisión del 20% se calcula sobre la mano de obra).
-- `total_cliente`= todo lo que paga el cliente (incluye materiales, movilidad y otros).

-- ============================================================
-- 1b. Modalidades permitidas por servicio y activación de propuestas
-- ============================================================
alter table app_config add column if not exists propuestas_activas boolean not null default false;

-- Copia en el servidor de MODALIDADES_POR_SERVICIO (src/lib/catalogoServicios.ts);
-- una prueba verifica que ambas coincidan. "horas" solo donde cobrar por tiempo
-- tiene sentido: oficios como electricidad o gasfitería no se pueden contratar
-- por horas como sustituto del diagnóstico o del precio fijo.
create table if not exists servicio_modalidades (
  servicio text not null,
  modalidad text not null check (modalidad in ('horas','fijo','diagnostico','cotizacion')),
  primary key (servicio, modalidad)
);
insert into servicio_modalidades (servicio, modalidad) values
  ('Limpieza básica del hogar','horas'),
  ('Limpieza básica del hogar','cotizacion'),
  ('Limpieza y reorganización profunda','horas'),
  ('Limpieza y reorganización profunda','cotizacion'),
  ('Limpieza de oficinas y comercios','horas'),
  ('Limpieza de oficinas y comercios','cotizacion'),
  ('Limpieza de alojamientos y Airbnb','horas'),
  ('Limpieza de alojamientos y Airbnb','cotizacion'),
  ('Limpieza postevento o postfiesta','horas'),
  ('Limpieza postevento o postfiesta','cotizacion'),
  ('Limpieza post obra','horas'),
  ('Limpieza post obra','cotizacion'),
  ('Organización de espacios','horas'),
  ('Organización de espacios','cotizacion'),
  ('Lavado y planchado','horas'),
  ('Electricidad','diagnostico'),
  ('Electricidad','fijo'),
  ('Gasfitería','diagnostico'),
  ('Gasfitería','fijo'),
  ('Aire acondicionado','diagnostico'),
  ('Aire acondicionado','fijo'),
  ('Pintura','cotizacion'),
  ('Pintura','diagnostico'),
  ('Albañilería','diagnostico'),
  ('Albañilería','cotizacion'),
  ('Carpintería','cotizacion'),
  ('Carpintería','diagnostico'),
  ('Cerrajería','fijo'),
  ('Cerrajería','diagnostico'),
  ('Vidriería y aluminio','cotizacion'),
  ('Vidriería y aluminio','diagnostico'),
  ('Mantenimiento y reparaciones generales','horas'),
  ('Mantenimiento y reparaciones generales','fijo')
on conflict do nothing;

alter table servicio_modalidades enable row level security;
drop policy if exists servicio_modalidades_select on servicio_modalidades;
create policy servicio_modalidades_select on servicio_modalidades for select using (true);
-- Sin políticas de escritura: se cambia desde el SQL Editor / migraciones.

-- ¿Están activas las propuestas (precio fijo, diagnóstico, cotización)? Solo
-- cambia con: update app_config set propuestas_activas = true;
create or replace function fn_propuestas_activas() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select propuestas_activas from app_config where id = true), false)
$$;
revoke all on function fn_propuestas_activas() from public, anon, authenticated;

-- ============================================================
-- 2. propuestas (versión aceptada de precio, alcance y condiciones)
-- ============================================================
create table if not exists propuestas (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references reservas(id) on delete cascade,
  trabajador_id uuid not null references trabajadores(id),
  tipo text not null default 'servicio'
    check (tipo in ('servicio','presupuesto_reparacion','adicional')),
  modalidad text not null check (modalidad in ('horas','fijo','diagnostico','cotizacion')),
  version int not null default 1,
  estado text not null default 'ofrecida'
    check (estado in ('ofrecida','aceptada','rechazada','reemplazada','vencida')),
  tarifa_hora numeric(6,2),
  horas int,
  personas int,
  cantidad int,
  mano_obra numeric(8,2) not null default 0 check (mano_obra >= 0),
  materiales numeric(8,2) not null default 0 check (materiales >= 0),
  movilidad numeric(8,2) not null default 0 check (movilidad >= 0),
  otros numeric(8,2) not null default 0 check (otros >= 0),
  -- Parte de la visita de diagnóstico que se descuenta al contratar la reparación.
  descuento_visita numeric(8,2) not null default 0 check (descuento_visita >= 0),
  total_propuesta numeric(8,2) generated always as
    (greatest(mano_obra - descuento_visita, 0) + materiales + movilidad + otros) stored,
  alcance text,
  incluye text[] not null default '{}',
  no_incluye text[] not null default '{}',
  condiciones text[] not null default '{}',
  vigente_hasta timestamptz,
  creado_en timestamptz not null default now(),
  respondido_en timestamptz,
  snapshot_aceptado jsonb,
  check (descuento_visita <= mano_obra)
);
create index if not exists propuestas_reserva_idx on propuestas (reserva_id, estado);
create index if not exists propuestas_trabajador_idx on propuestas (trabajador_id, estado);
-- Una sola propuesta vigente por profesional, reserva y tipo.
create unique index if not exists propuestas_oferta_unica
  on propuestas (reserva_id, trabajador_id, tipo) where estado = 'ofrecida';

alter table propuestas enable row level security;

drop policy if exists propuestas_select on propuestas;
create policy propuestas_select on propuestas for select
  using (
    auth.uid() = trabajador_id
    or mi_rol() = 'admin'
    or exists (select 1 from reservas r where r.id = reserva_id and r.cliente_id = auth.uid())
  );
-- Sin políticas de insert/update/delete: solo se escribe mediante las funciones de abajo.

-- Una propuesta aceptada, rechazada o reemplazada no se edita: cualquier cambio
-- posterior es una propuesta nueva que el cliente debe autorizar de nuevo.
create or replace function fn_propuesta_inmutable() returns trigger language plpgsql as $$
begin
  if old.estado <> 'ofrecida' then
    raise exception 'Esta propuesta ya fue respondida y no se puede modificar';
  end if;
  if new.reserva_id is distinct from old.reserva_id
     or new.trabajador_id is distinct from old.trabajador_id
     or new.tipo is distinct from old.tipo
     or new.modalidad is distinct from old.modalidad
     or new.version is distinct from old.version
     or new.tarifa_hora is distinct from old.tarifa_hora
     or new.horas is distinct from old.horas
     or new.personas is distinct from old.personas
     or new.cantidad is distinct from old.cantidad
     or new.mano_obra is distinct from old.mano_obra
     or new.materiales is distinct from old.materiales
     or new.movilidad is distinct from old.movilidad
     or new.otros is distinct from old.otros
     or new.descuento_visita is distinct from old.descuento_visita
     or new.alcance is distinct from old.alcance
     or new.incluye is distinct from old.incluye
     or new.no_incluye is distinct from old.no_incluye
     or new.condiciones is distinct from old.condiciones then
    raise exception 'El precio y el alcance de una propuesta no se editan: envía una propuesta nueva';
  end if;
  return new;
end $$;
drop trigger if exists trg_propuesta_inmutable on propuestas;
create trigger trg_propuesta_inmutable before update on propuestas
  for each row execute function fn_propuesta_inmutable();

-- ============================================================
-- 3. precios_profesional (precio fijo / diagnóstico por servicio)
-- ============================================================
-- Contrato para el panel del profesional (etapa siguiente). Mientras una
-- profesional no tenga fila aquí, esa modalidad NO tiene precio: no se inventa
-- ninguno ni se usan las horas como sustituto.
create table if not exists precios_profesional (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid not null references trabajadores(id) on delete cascade,
  servicio text not null,
  modalidad text not null check (modalidad in ('fijo','diagnostico')),
  monto numeric(8,2) not null check (monto > 0),
  unidad text not null default 'trabajo' check (unidad in ('trabajo','unidad')),
  alcance text not null check (length(trim(alcance)) > 0),
  incluye text[] not null default '{}',
  no_incluye text[] not null default '{}',
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (trabajador_id, servicio, modalidad)
);

alter table precios_profesional enable row level security;
drop policy if exists precios_select on precios_profesional;
create policy precios_select on precios_profesional for select
  using (auth.uid() = trabajador_id or mi_rol() = 'admin');
drop policy if exists precios_insert on precios_profesional;
create policy precios_insert on precios_profesional for insert
  with check (auth.uid() = trabajador_id and mi_rol() = 'trabajador');
drop policy if exists precios_update on precios_profesional;
create policy precios_update on precios_profesional for update
  using (auth.uid() = trabajador_id) with check (auth.uid() = trabajador_id);
drop policy if exists precios_delete on precios_profesional;
create policy precios_delete on precios_profesional for delete
  using (auth.uid() = trabajador_id);

-- ============================================================
-- 4. pagos (evidencia de pago manual; el cliente nunca confirma)
-- ============================================================
create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references reservas(id) on delete cascade,
  metodo text not null check (metodo in ('yape','plin','transferencia','efectivo')),
  monto numeric(8,2) not null check (monto > 0),
  estado text not null default 'pendiente_verificacion'
    check (estado in ('pendiente_verificacion','confirmado','rechazado')),
  referencia text,
  evidencia_ruta text,
  motivo_rechazo text,
  registrado_por uuid not null references perfiles(id),
  verificado_por uuid references perfiles(id),
  creado_en timestamptz not null default now(),
  verificado_en timestamptz
);
create index if not exists pagos_reserva_idx on pagos (reserva_id, estado);
create index if not exists pagos_pendientes_idx on pagos (estado) where estado = 'pendiente_verificacion';

alter table pagos enable row level security;
drop policy if exists pagos_select on pagos;
create policy pagos_select on pagos for select
  using (
    mi_rol() = 'admin'
    or exists (select 1 from reservas r where r.id = reserva_id and r.cliente_id = auth.uid())
  );
-- Sin políticas de escritura: solo registrar_pago y confirmar_pago escriben aquí.

-- ============================================================
-- 5. Protección de lo económico
-- ============================================================
-- Un UPDATE directo desde la app (rol authenticated) no puede tocar precios,
-- comisión, pago confirmado ni reasignar el profesional. Las funciones
-- security definer de este archivo (que corren como dueño) sí pueden.
create or replace function fn_proteger_economia() returns trigger language plpgsql as $$
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
end $$;
drop trigger if exists trg_proteger_economia on reservas;
create trigger trg_proteger_economia before update on reservas
  for each row execute function fn_proteger_economia();

-- "Reparaciones generales" no es un atajo: si la descripción nombra un oficio
-- (electricidad, gasfitería, cerrajería...) se rechaza y se pide ese servicio. Es una
-- lista corta y conservadora de palabras claras; la interfaz usa una lista más amplia
-- (src/lib/sinonimos.ts). El servidor no entiende el texto: solo corta los casos obvios.
create or replace function fn_oficio_en_texto(p_texto text) returns text
language sql immutable set search_path = public as $$
  select case
    when t ~ '(enchuf|tomacorrient|toma corrient|interruptor|cableado|cortocircuit|el[eé]ctric|breaker|tablero|foco|l[aá]mpar|luminari)' then 'Electricidad'
    when t ~ '(gasfiter|grifo|ca[nñ]o|fuga|gotera|desag[uü]e|inodoro|tuber[ií]a|lavadero|lavatorio|terma|cisterna)' then 'Gasfitería'
    when t ~ '(aire acondicionado|split)' then 'Aire acondicionado'
    when t ~ '(cerradura|chapa|candado|cerrojo|cerrajer)' then 'Cerrajería'
    when t ~ '(pintar|pintura|repintar|hongo|humedad|moho)' then 'Pintura'
    when t ~ '(mayolica|mayólica|loseta|baldosa|cemento|tarraje|resane|ladrillo|grieta)' then 'Albañilería'
    when t ~ '(puerta|ropero|closet|bisagra|carpinter)' then 'Carpintería'
    when t ~ '(vidrio|ventana|mampara|aluminio)' then 'Vidriería y aluminio'
  end
  from (select lower(coalesce(p_texto, '')) as t) x
$$;

-- Al insertar, el servidor fija precio, comisión, estado y ventana. Lo que mande
-- el navegador en esos campos se ignora. (security definer para poder leer la
-- tarifa de la profesional; por eso el origen se detecta con auth.role() y no
-- con current_user, que dentro de una función definer es el dueño.)
create or replace function fn_preparar_reserva_nueva() returns trigger
language plpgsql security definer set search_path = public as $$
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
end $$;
drop trigger if exists trg_preparar_reserva_nueva on reservas;
create trigger trg_preparar_reserva_nueva before insert on reservas
  for each row execute function fn_preparar_reserva_nueva();

-- ============================================================
-- 6. Funciones internas (no se exponen a la app)
-- ============================================================

-- Suma lo aceptado y deja los totales de la reserva al día. También mantiene
-- pago_confirmado: solo es true si lo CONFIRMADO cubre todo lo que se debe.
create or replace function fn_recalcular_totales(p_reserva_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mo numeric(10,2);
  v_todo numeric(10,2);
  v_rec numeric(8,2);
  v_conf numeric(10,2);
  v_total_cliente numeric(10,2);
  v_hay boolean;
begin
  select exists (select 1 from propuestas where reserva_id = p_reserva_id and estado = 'aceptada') into v_hay;
  select recargo_materiales into v_rec from reservas where id = p_reserva_id;

  if v_hay then
    select coalesce(sum(greatest(mano_obra - descuento_visita, 0)), 0), coalesce(sum(total_propuesta), 0)
      into v_mo, v_todo
    from propuestas where reserva_id = p_reserva_id and estado = 'aceptada';
    update reservas set total = v_mo + v_rec, total_cliente = v_todo + v_rec where id = p_reserva_id;
  end if;

  -- Una reserva anterior que un admin ya marcó como pagada y no tiene filas en `pagos` conserva ese dato:
  -- recalcular desde cero la dejaría "sin pagar".
  if not exists (select 1 from pagos where reserva_id = p_reserva_id)
     and (select pago_confirmado from reservas where id = p_reserva_id) then
    return;
  end if;
  select coalesce(total_cliente, total, 0) into v_total_cliente from reservas where id = p_reserva_id;
  select coalesce(sum(monto), 0) into v_conf from pagos where reserva_id = p_reserva_id and estado = 'confirmado';
  update reservas set pago_confirmado = (v_total_cliente > 0 and v_conf >= v_total_cliente)
    where id = p_reserva_id;
end $$;

-- Marca una propuesta como aceptada y guarda la versión exacta que se aceptó.
create or replace function fn_marcar_aceptada(p_propuesta_id uuid, p_por uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update propuestas set
    estado = 'aceptada',
    respondido_en = now(),
    snapshot_aceptado = to_jsonb(propuestas.*) || jsonb_build_object('aceptada_por', p_por, 'aceptada_en', now())
  where id = p_propuesta_id and estado = 'ofrecida';
  if not found then
    raise exception 'Esta propuesta ya no está disponible';
  end if;
end $$;

-- Avisos que no deben romper la operación si el envío de push falla.
create or replace function fn_aviso(p_user_id uuid, p_titulo text, p_cuerpo text, p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform fn_enviar_push(array[p_user_id], p_titulo, p_cuerpo, p_url);
exception when others then
  null;
end $$;

-- Oferta automática de una profesional para una reserva con precio conocido:
--  horas       -> su tarifa × horas × personas
--  fijo / diag -> el precio que ella configuró en precios_profesional
--  cotizacion  -> no hay oferta automática (ella envía una propuesta)
create or replace function fn_crear_oferta(p_reserva_id uuid, p_trabajador_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r reservas%rowtype;
  t trabajadores%rowtype;
  pr precios_profesional%rowtype;
  v_id uuid;
  v_mo numeric(8,2);
  v_tarifa numeric(6,2);
  v_alcance text;
  v_incluye text[];
  v_no text[];
  v_cond text[] := array[
    'El precio es solo por la mano de obra descrita. Materiales, movilidad u otros cargos se muestran aparte y necesitan tu aceptación.',
    'Cualquier cambio de precio o de alcance necesita tu autorización antes de realizarse.'
  ];
begin
  select * into r from reservas where id = p_reserva_id;
  if not found then raise exception 'La solicitud no existe'; end if;
  select * into t from trabajadores where id = p_trabajador_id;
  if not found then raise exception 'El profesional no existe'; end if;
  if r.modalidad_precio <> 'horas' and not fn_propuestas_activas() then
    raise exception 'Esa forma de contratar todavía no está disponible';
  end if;

  select id into v_id from propuestas
   where reserva_id = r.id and trabajador_id = t.id and tipo = 'servicio' and estado = 'ofrecida';
  if found then return v_id; end if;

  if r.modalidad_precio = 'cotizacion' then
    return null;
  end if;

  if r.modalidad_precio = 'horas' then
    v_tarifa := t.tarifa_hora;
    v_mo := round(t.tarifa_hora * r.horas * r.personas, 2);
    v_alcance := 'Servicio por horas: ' || r.horas || ' h' ||
                 case when r.personas > 1 then ' x ' || r.personas || ' personas' else '' end || '.';
    -- `necesidad` lo escribe el cliente: solo se aceptan arreglos, de hasta 20 líneas de 200 caracteres.
    v_incluye := case when jsonb_typeof(r.necesidad->'alcance'->'incluye') = 'array'
      then array(select left(x, 200) from jsonb_array_elements_text(r.necesidad->'alcance'->'incluye') as x limit 20)
      else '{}'::text[] end;
    v_no := case when jsonb_typeof(r.necesidad->'alcance'->'no_incluye') = 'array'
      then array(select left(x, 200) from jsonb_array_elements_text(r.necesidad->'alcance'->'no_incluye') as x limit 20)
      else '{}'::text[] end;
    v_cond := v_cond || array['Pagas el tiempo de trabajo contratado. Si no alcanza para terminar todo, se avanza según lo que pediste primero.'];
  else
    select * into pr from precios_profesional
     where trabajador_id = t.id and servicio = r.servicio and modalidad = r.modalidad_precio and activo;
    if not found then
      raise exception 'Todavía no configuraste tu precio para esta modalidad';
    end if;
    v_mo := round(pr.monto * case when r.modalidad_precio = 'fijo' and pr.unidad = 'unidad' then r.cantidad else 1 end, 2);
    v_alcance := pr.alcance;
    v_incluye := pr.incluye;
    v_no := pr.no_incluye;
    if r.modalidad_precio = 'diagnostico' then
      v_cond := v_cond || array['Este importe es solo por la visita de diagnóstico. La reparación necesita otro presupuesto que tú aceptas aparte.'];
    end if;
  end if;

  insert into propuestas (reserva_id, trabajador_id, tipo, modalidad, tarifa_hora, horas, personas, cantidad,
                          mano_obra, alcance, incluye, no_incluye, condiciones)
  values (r.id, t.id, 'servicio', r.modalidad_precio, v_tarifa,
          case when r.modalidad_precio = 'horas' then r.horas end, r.personas, r.cantidad,
          v_mo, v_alcance, v_incluye, v_no, v_cond)
  returning id into v_id;
  return v_id;
end $$;

-- Pedido abierto nuevo (o reintentado): avisa a quien puede verlo y aceptarlo.
-- Solo a profesionales que hoy pueden ver el pedido en su panel (disponibles
-- ahora) y que no tienen otro trabajo cruzado a esa hora.
create or replace function fn_notificar_pedido_abierto(p_reserva_id uuid) returns void
language plpgsql security definer set search_path = public as $$
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
end $$;

-- Reemplaza el aviso al insertar una reserva (0013) para usar la regla anterior.
create or replace function fn_push_reservas_insert() returns trigger
language plpgsql security definer set search_path = public as $$
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
end $$;

-- Un pedido directo ya lleva el precio que el cliente vio: queda registrada la
-- versión aceptada (el cliente pidió a ese profesional sabiendo el precio).
create or replace function fn_oferta_directa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if new.modo = 'directo' and new.trabajador_id is not null then
    v_id := fn_crear_oferta(new.id, new.trabajador_id);
    if v_id is not null then
      perform fn_marcar_aceptada(v_id, new.cliente_id);
      perform fn_recalcular_totales(new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_oferta_directa on reservas;
create trigger trg_oferta_directa after insert on reservas
  for each row execute function fn_oferta_directa();

-- Una reserva cancelada o rechazada cierra sus propuestas pendientes.
create or replace function fn_cerrar_propuestas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado in ('cancelada','rechazada') and old.estado is distinct from new.estado then
    update propuestas set estado = 'vencida', respondido_en = now()
     where reserva_id = new.id and estado = 'ofrecida';
  end if;
  return new;
end $$;
drop trigger if exists trg_cerrar_propuestas on reservas;
create trigger trg_cerrar_propuestas after update on reservas
  for each row execute function fn_cerrar_propuestas();

-- ============================================================
-- 7. Funciones que usa la app
-- ============================================================

-- Postularse a un pedido abierto. Cambios: "ahora" exige estar disponible
-- ahora; "programada" exige solo estar habilitada y libre a esa hora. Crea la
-- oferta con el precio que corresponde (si hay).
create or replace function postularme_a_reserva(p_reserva_id uuid) returns void
language plpgsql security definer set search_path = public as $$
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
end $$;

revoke all on function postularme_a_reserva(uuid) from public, anon;
grant execute on function postularme_a_reserva(uuid) to authenticated;

-- El cliente contrata UNA propuesta concreta: acepta precio, alcance y
-- condiciones, y recién ahí se asigna el servicio.
create or replace function contratar_propuesta(p_propuesta_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p propuestas%rowtype;
  r reservas%rowtype;
  t trabajadores%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;

  select * into p from propuestas where id = p_propuesta_id;
  if not found then
    raise exception 'Esa propuesta no existe';
  end if;

  select * into r from reservas where id = p.reserva_id for update;
  if r.cliente_id is distinct from auth.uid() then
    raise exception 'No tienes permiso para contratar en esta solicitud';
  end if;
  if p.tipo <> 'servicio' then
    raise exception 'Esta propuesta no sirve para contratar el servicio';
  end if;

  select * into p from propuestas where id = p_propuesta_id for update;
  if p.estado <> 'ofrecida' then
    raise exception 'Esta propuesta ya no está disponible';
  end if;
  if p.vigente_hasta is not null and p.vigente_hasta < now() then
    raise exception 'Esta propuesta venció';
  end if;
  if r.estado <> 'solicitada' or r.trabajador_id is not null then
    raise exception 'Esta reserva ya fue asignada';
  end if;
  if not exists (
    select 1 from candidaturas
     where reserva_id = r.id and trabajador_id = p.trabajador_id and estado = 'pendiente'
  ) then
    raise exception 'Esa candidatura ya no está disponible';
  end if;

  select * into t from trabajadores where id = p.trabajador_id;
  if not found or not t.habilitado_trabajar then
    raise exception 'Ese profesional ya no está habilitado para tomar este servicio';
  end if;
  if r.con_materiales and not t.kit_propio then
    raise exception 'Ese profesional ya no ofrece llevar su propio kit de limpieza';
  end if;

  perform fn_marcar_aceptada(p.id, auth.uid());

  -- El trigger de solapamiento (0012) rechaza aquí un cruce de horario.
  update reservas set trabajador_id = p.trabajador_id, tarifa_hora = p.tarifa_hora, estado = 'aceptada'
   where id = r.id;

  update propuestas set estado = 'reemplazada', respondido_en = now()
   where reserva_id = r.id and tipo = 'servicio' and estado = 'ofrecida' and id <> p.id;
  update candidaturas set estado = 'elegida'
   where reserva_id = r.id and trabajador_id = p.trabajador_id;
  update candidaturas set estado = 'liberada'
   where reserva_id = r.id and trabajador_id <> p.trabajador_id and estado = 'pendiente';

  perform fn_recalcular_totales(r.id);
end $$;

revoke all on function contratar_propuesta(uuid) from public, anon;
grant execute on function contratar_propuesta(uuid) to authenticated;

-- Misma firma de siempre, pero ahora pasa por la aceptación de una propuesta:
-- elegir a alguien ya no asigna sin precio y alcance aceptados.
create or replace function elegir_candidata(p_reserva_id uuid, p_trabajador_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;
  if not exists (select 1 from reservas where id = p_reserva_id and cliente_id = auth.uid()) then
    raise exception 'No tienes permiso para elegir en esta reserva';
  end if;
  select id into v_id from propuestas
   where reserva_id = p_reserva_id and trabajador_id = p_trabajador_id and tipo = 'servicio' and estado = 'ofrecida';
  if v_id is null then
    -- Postulaciones anteriores a esta migración no tienen propuesta: se arma
    -- ahora con las mismas reglas (en cotización devuelve null).
    v_id := fn_crear_oferta(p_reserva_id, p_trabajador_id);
  end if;
  if v_id is null then
    raise exception 'Este profesional todavía no envió su propuesta';
  end if;
  perform contratar_propuesta(v_id);
end $$;

revoke all on function elegir_candidata(uuid, uuid) from public, anon;
grant execute on function elegir_candidata(uuid, uuid) to authenticated;

-- El cliente acepta o rechaza un presupuesto o un adicional (y rechaza una
-- oferta de servicio). Aceptar el servicio inicial se hace con contratar_propuesta.
create or replace function responder_propuesta(p_propuesta_id uuid, p_aceptar boolean) returns void
language plpgsql security definer set search_path = public as $$
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
end $$;

revoke all on function responder_propuesta(uuid, boolean) from public, anon;
grant execute on function responder_propuesta(uuid, boolean) to authenticated;

-- CONTRATO PARA EL PANEL DEL PROFESIONAL (etapa siguiente; hoy no hay pantalla
-- que lo llame). El profesional envía:
--  'servicio'               propuesta por alcance, solo en solicitudes de cotización
--                           a las que ya se postuló.
--  'presupuesto_reparacion' tras una visita de diagnóstico (servicio en curso);
--                           descuenta la visita ya aceptada del MISMO profesional.
--  'adicional'              cargo extra durante el servicio.
-- Cada envío reemplaza la propuesta vigente anterior (versión + 1) y el cliente
-- debe aceptarla de nuevo.
create or replace function enviar_propuesta(
  p_reserva_id uuid,
  p_tipo text,
  p_mano_obra numeric,
  p_materiales numeric,
  p_movilidad numeric,
  p_otros numeric,
  p_alcance text,
  p_incluye text[],
  p_no_incluye text[],
  p_condiciones text[],
  p_validez_horas int default 48
) returns uuid
language plpgsql security definer set search_path = public as $$
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
end $$;

revoke all on function enviar_propuesta(uuid, text, numeric, numeric, numeric, numeric, text, text[], text[], text[], int) from public, anon;
grant execute on function enviar_propuesta(uuid, text, numeric, numeric, numeric, numeric, text, text[], text[], text[], int) to authenticated;

-- El cliente registra que pagó (evidencia). NO confirma: queda "pendiente de
-- verificación" hasta que un administrador lo revise.
create or replace function registrar_pago(
  p_reserva_id uuid,
  p_metodo text,
  p_referencia text default null,
  p_evidencia_ruta text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r reservas%rowtype;
  v_total numeric(10,2);
  v_conf numeric(10,2);
  v_pend numeric(10,2);
  v_saldo numeric(10,2);
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  select * into r from reservas where id = p_reserva_id for update;
  if not found or r.cliente_id is distinct from auth.uid() then
    raise exception 'No tienes permiso para registrar un pago en esta reserva';
  end if;
  if r.estado not in ('aceptada','en_camino','en_curso','completada') then
    raise exception 'Todavía no hay un servicio confirmado para pagar';
  end if;
  if r.pago_confirmado and not exists (select 1 from pagos where reserva_id = r.id) then
    raise exception 'Este servicio ya figura como pagado';
  end if;
  if p_metodo not in ('yape','plin','transferencia','efectivo') then
    raise exception 'Elige un método de pago válido';
  end if;
  if p_evidencia_ruta is not null and split_part(p_evidencia_ruta, '/', 1) <> auth.uid()::text then
    raise exception 'La captura del pago no es válida';
  end if;
  if p_metodo <> 'efectivo' and length(trim(coalesce(p_referencia, ''))) = 0 and p_evidencia_ruta is null then
    raise exception 'Agrega el número de operación o una captura del pago';
  end if;

  v_total := coalesce(r.total_cliente, r.total, 0);
  if v_total <= 0 then
    raise exception 'Todavía no hay un monto para pagar';
  end if;
  select coalesce(sum(monto) filter (where estado = 'confirmado'), 0),
         coalesce(sum(monto) filter (where estado = 'pendiente_verificacion'), 0)
    into v_conf, v_pend from pagos where reserva_id = r.id;
  v_saldo := v_total - v_conf - v_pend;
  if v_saldo <= 0 then
    raise exception 'Este servicio no tiene saldo pendiente de pago';
  end if;

  insert into pagos (reserva_id, metodo, monto, referencia, evidencia_ruta, registrado_por)
  values (r.id, p_metodo, v_saldo, nullif(trim(coalesce(p_referencia, '')), ''), p_evidencia_ruta, auth.uid())
  returning id into v_id;

  update reservas set pago_metodo = p_metodo where id = r.id;
  return v_id;
end $$;

revoke all on function registrar_pago(uuid, text, text, text) from public, anon;
grant execute on function registrar_pago(uuid, text, text, text) to authenticated;

-- Solo un administrador confirma o rechaza un pago.
create or replace function confirmar_pago(p_pago_id uuid, p_confirmar boolean, p_motivo text default null)
returns void
language plpgsql security definer set search_path = public as $$
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
end $$;

revoke all on function confirmar_pago(uuid, boolean, text) from public, anon;
grant execute on function confirmar_pago(uuid, boolean, text) to authenticated;

-- Si nadie respondió, el cliente puede cambiar el horario o volver a intentar.
-- No amplía zonas ni asigna sola: solo reabre el mismo pedido otra ventana.
create or replace function reintentar_solicitud(
  p_reserva_id uuid,
  p_programacion text,
  p_fecha date default null,
  p_hora time default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  r reservas%rowtype;
  v_lima timestamp := now() at time zone 'America/Lima';
  v_fecha date;
  v_hora time;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  select * into r from reservas where id = p_reserva_id for update;
  if not found or r.cliente_id is distinct from auth.uid() then
    raise exception 'No tienes permiso para cambiar esta solicitud';
  end if;
  if r.estado <> 'solicitada' or r.modo <> 'abierto' or r.trabajador_id is not null then
    raise exception 'Esta solicitud ya no se puede reintentar';
  end if;
  if r.ventana_cierra_en is not null and r.ventana_cierra_en > now() then
    raise exception 'Espera a que termine el tiempo de respuesta';
  end if;
  if exists (select 1 from candidaturas where reserva_id = r.id and estado = 'pendiente') then
    raise exception 'Ya tienes profesionales que respondieron: elige uno';
  end if;
  if p_programacion not in ('ahora','programada') then
    raise exception 'Elige si es lo antes posible o programado';
  end if;

  if p_programacion = 'ahora' then
    -- Ahora + 30 minutos, redondeado hacia arriba a 5 minutos (hora de Lima).
    v_lima := to_timestamp(ceil(extract(epoch from (now() + interval '30 minutes')) / 300) * 300) at time zone 'America/Lima';
    v_fecha := v_lima::date;
    v_hora := v_lima::time;
  else
    if p_fecha is null or p_hora is null then
      raise exception 'Elige el día y la hora';
    end if;
    if (p_fecha + p_hora) < (v_lima + interval '30 minutes') then
      raise exception 'Elige una hora que falte al menos 30 minutos';
    end if;
    v_fecha := p_fecha;
    v_hora := p_hora;
  end if;

  update reservas set fecha = v_fecha, hora = v_hora, programacion = p_programacion,
                      ventana_cierra_en = now() + interval '10 minutes'
   where id = r.id;
  update candidaturas set estado = 'liberada' where reserva_id = r.id and estado = 'pendiente';
  update propuestas set estado = 'vencida', respondido_en = now()
   where reserva_id = r.id and estado = 'ofrecida';
  perform fn_notificar_pedido_abierto(r.id);
end $$;

revoke all on function reintentar_solicitud(uuid, text, date, time) from public, anon;
grant execute on function reintentar_solicitud(uuid, text, date, time) to authenticated;

-- Funciones internas: ni la app ni usuarios anónimos pueden llamarlas.
revoke all on function fn_recalcular_totales(uuid) from public, anon, authenticated;
revoke all on function fn_marcar_aceptada(uuid, uuid) from public, anon, authenticated;
revoke all on function fn_crear_oferta(uuid, uuid) from public, anon, authenticated;
revoke all on function fn_notificar_pedido_abierto(uuid) from public, anon, authenticated;
revoke all on function fn_aviso(uuid, text, text, text) from public, anon, authenticated;
-- fn_enviar_push (0013) solo debe llamarse desde triggers y funciones de este
-- archivo; sin esto cualquier usuario con sesión podría enviar avisos a otros.
revoke all on function fn_enviar_push(uuid[], text, text, text) from public, anon, authenticated;

-- ============================================================
-- 8. Vistas de pedidos abiertos para la profesional
-- ============================================================
-- Mismas columnas de 0014 + columnas nuevas al final. La profesional solo ve
-- hoy pedidos por horas (única modalidad con panel funcionando) y respetando
-- su disponibilidad real:
--   'ahora'      -> debe estar disponible ahora (y activa en las últimas 8 h)
--   'programada' -> no necesita estar "disponible ahora", pero no puede tener
--                   otro trabajo que se cruce con esa hora
-- Aún NO se muestran dirección ni nombre del cliente.
create or replace view v_pedidos_abiertos as
select r.id, r.servicio, r.zona, r.fecha, r.hora, r.horas, r.con_materiales,
       r.recargo_materiales, r.comision_pct, r.ventana_cierra_en, r.zona_ampliada, r.creado_en,
       r.subtipo_servicio, r.descripcion_trabajo, r.foto_referencia_ruta,
       r.detalles_servicio - 'privado' as detalles_servicio,
       r.personas, r.modalidad_precio, r.programacion, r.cantidad
from reservas r
join trabajadores t on t.id = auth.uid()
where r.estado = 'solicitada'
  and r.modo = 'abierto'
  and r.trabajador_id is null
  and r.modalidad_precio = 'horas'
  and (r.ventana_cierra_en is null or r.ventana_cierra_en > now())
  and t.habilitado_trabajar
  and (
    (r.programacion = 'ahora' and t.disponible_ahora and t.ultima_actividad > now() - interval '8 hours')
    or r.programacion = 'programada'
  )
  and r.servicio = any(t.servicios)
  and (r.zona = any(t.zonas) or r.zona_ampliada)
  and (not r.con_materiales or t.kit_propio)
  and trabajador_disponible_en(t.id, r.fecha, r.hora, r.horas)
  and not exists (select 1 from candidaturas c where c.reserva_id = r.id and c.trabajador_id = auth.uid())
  and (select count(*) from candidaturas c2 where c2.reserva_id = r.id and c2.estado = 'pendiente') < 3;

create or replace view v_mis_postulaciones as
select r.id, r.servicio, r.zona, r.fecha, r.hora, r.horas, r.con_materiales,
       r.recargo_materiales, r.comision_pct, r.ventana_cierra_en, r.zona_ampliada, r.creado_en,
       c.creado_en as postulado_en,
       r.subtipo_servicio, r.descripcion_trabajo, r.foto_referencia_ruta,
       r.detalles_servicio - 'privado' as detalles_servicio,
       r.personas, r.modalidad_precio, r.programacion, r.cantidad
from candidaturas c
join reservas r on r.id = c.reserva_id
where c.trabajador_id = auth.uid() and c.estado = 'pendiente';

-- Contrato para el panel del profesional: pedidos abiertos de TODAS las
-- modalidades (la UI actual no la usa todavía).
create or replace view v_pedidos_abiertos_todas as
select r.id, r.servicio, r.zona, r.fecha, r.hora, r.horas, r.con_materiales,
       r.recargo_materiales, r.comision_pct, r.ventana_cierra_en, r.zona_ampliada, r.creado_en,
       r.subtipo_servicio, r.descripcion_trabajo, r.foto_referencia_ruta,
       r.detalles_servicio - 'privado' as detalles_servicio,
       r.personas, r.modalidad_precio, r.programacion, r.cantidad
from reservas r
join trabajadores t on t.id = auth.uid()
where r.estado = 'solicitada'
  and r.modo = 'abierto'
  and r.trabajador_id is null
  and (r.ventana_cierra_en is null or r.ventana_cierra_en > now())
  and t.habilitado_trabajar
  and (
    (r.programacion = 'ahora' and t.disponible_ahora and t.ultima_actividad > now() - interval '8 hours')
    or r.programacion = 'programada'
  )
  and r.servicio = any(t.servicios)
  and (r.zona = any(t.zonas) or r.zona_ampliada)
  and (not r.con_materiales or t.kit_propio)
  and trabajador_disponible_en(t.id, r.fecha, r.hora, r.horas)
  and not exists (select 1 from candidaturas c where c.reserva_id = r.id and c.trabajador_id = auth.uid())
  and (select count(*) from candidaturas c2 where c2.reserva_id = r.id and c2.estado = 'pendiente') < 3;

-- ============================================================
-- 8b. Cobertura: cuántos profesionales habilitados ofrece cada servicio
-- ============================================================
-- Solo conteos (sin nombres ni datos personales), legibles también sin cuenta,
-- para no ofrecer un servicio que nadie atiende. zona '*' = total de
-- profesionales distintos del servicio.
create or replace view v_cobertura_servicios as
select s as servicio, z as zona, count(*)::int as profesionales
from trabajadores t
cross join lateral unnest(t.servicios) as s
cross join lateral unnest(t.zonas) as z
where t.habilitado_trabajar
group by s, z
union all
select s as servicio, '*'::text as zona, count(*)::int as profesionales
from trabajadores t
cross join lateral unnest(t.servicios) as s
where t.habilitado_trabajar
group by s;
grant select on v_cobertura_servicios to anon, authenticated;

-- ============================================================
-- 9. Realtime: el cliente ve propuestas y pagos al instante
-- ============================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'propuestas') then
      alter publication supabase_realtime add table propuestas;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pagos') then
      alter publication supabase_realtime add table pagos;
    end if;
  end if;
end $$;
