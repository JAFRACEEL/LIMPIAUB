-- Limpi: datos ampliados de inscripción de trabajadoras/es (identidad, estatus
-- migratorio, zonas de atención múltiples, documentos de soporte).
-- Idempotente. Ejecutar después de schema.sql y 0001_storage_fotos_policies.sql.

-- ---------- Columnas nuevas ----------
alter table trabajadores add column if not exists genero text not null default 'prefiero_no_decir';
alter table trabajadores add column if not exists nacionalidad text not null default 'peruana';
alter table trabajadores add column if not exists tipo_documento text not null default 'dni';
alter table trabajadores add column if not exists numero_documento text;
alter table trabajadores add column if not exists zonas text[] not null default '{}';
alter table trabajadores add column if not exists cuenta_autorizacion_migratoria boolean;
alter table trabajadores add column if not exists estado_migratorio text not null default 'no_aplica';
alter table trabajadores add column if not exists doc_migratorio_numero text;
alter table trabajadores add column if not exists doc_migratorio_vencimiento date;
alter table trabajadores add column if not exists doc_migratorio_frontal_ruta text;
alter table trabajadores add column if not exists doc_migratorio_posterior_ruta text;
alter table trabajadores add column if not exists doc_migratorio_constancia_ruta text;
alter table trabajadores add column if not exists cv_ruta text;
alter table trabajadores add column if not exists antecedentes_doc_ruta text;
alter table trabajadores add column if not exists referencia1_nombre text;
alter table trabajadores add column if not exists referencia1_celular text;
alter table trabajadores add column if not exists referencia2_nombre text;
alter table trabajadores add column if not exists referencia2_celular text;
alter table trabajadores add column if not exists habilitado_trabajar boolean not null default false;

-- ---------- Backfill de filas existentes (si las hay) ----------
-- dni/referencias se eliminan más abajo en esta misma migración: en una
-- segunda corrida ya no existen, así que se ignoran en vez de fallar.
do $$ begin
  update trabajadores set numero_documento = dni where numero_documento is null and dni is not null;
exception when undefined_column then null; end $$;

-- Mapeo best-effort de las zonas antiguas (previas al catálogo nuevo) a las
-- zonas vigentes, para clientes y trabajadoras por igual: ninguna fila debe
-- quedar con un valor que ya no existe en ZONAS y desaparezca de
-- filtros/pedidos.
update perfiles set zona = case zona
  when 'Iquitos centro' then 'Iquitos'
  when 'San Juan Bautista' then 'San Juan'
  when 'Moronacocha' then 'Iquitos'
  when 'Versalles / Sachachorro' then 'Versalles'
  when 'Nanay / Bellavista' then 'Bellavista-Nanay'
  when 'Quistococha' then 'Carretera Iquitos–Nauta hasta Quistococha'
  when 'Otra' then 'Iquitos'
  else zona
end;

update trabajadores t set zonas = array[p.zona]
  from perfiles p where p.id = t.id and t.zonas = '{}';
do $$ begin
  update trabajadores set referencia1_nombre = split_part(referencias, ';', 1),
                           referencia2_nombre = trim(split_part(referencias, ';', 2))
    where referencias is not null and referencia1_nombre is null;
exception when undefined_column then null; end $$;

alter table trabajadores alter column numero_documento set not null;

-- ---------- Columnas obsoletas (reemplazadas por las de arriba) ----------
alter table trabajadores drop column if exists dni;
alter table trabajadores drop column if exists referencias;

-- ---------- Restricciones de valores ----------
alter table trabajadores drop constraint if exists trabajadores_genero_check;
alter table trabajadores add constraint trabajadores_genero_check
  check (genero in ('femenino','masculino','otro','prefiero_no_decir'));

alter table trabajadores drop constraint if exists trabajadores_nacionalidad_check;
alter table trabajadores add constraint trabajadores_nacionalidad_check
  check (nacionalidad in ('peruana','extranjera'));

alter table trabajadores drop constraint if exists trabajadores_tipo_documento_check;
alter table trabajadores add constraint trabajadores_tipo_documento_check
  check (tipo_documento in ('dni','carne_extranjeria','cpp','ctm','carne_mre','pasaporte'));

-- DNI solo para peruana; documento extranjero solo para extranjera.
alter table trabajadores drop constraint if exists trabajadores_doc_por_nacionalidad_check;
alter table trabajadores add constraint trabajadores_doc_por_nacionalidad_check
  check ((nacionalidad = 'peruana') = (tipo_documento = 'dni'));

alter table trabajadores drop constraint if exists trabajadores_estado_migratorio_check;
alter table trabajadores add constraint trabajadores_estado_migratorio_check
  check (estado_migratorio in ('no_aplica','pendiente_validacion','validado','rechazado'));

alter table trabajadores drop constraint if exists trabajadores_zonas_check;
alter table trabajadores add constraint trabajadores_zonas_check
  check (cardinality(zonas) between 1 and 3);

create index if not exists trabajadores_zonas_idx on trabajadores using gin (zonas);

-- ---------- Vista pública: ahora expone zonas (array) y solo trabajadoras
-- habilitadas (verificadas Y, si son extranjeras, con estatus migratorio
-- validado por un admin) ----------
-- `zona` (text) pasa a `zonas` (text[]): CREATE OR REPLACE VIEW no admite
-- cambiar el tipo de una columna existente, hay que recrear la vista.
drop view if exists v_trabajadores_publicos;
create view v_trabajadores_publicos as
select t.id, p.nombre, t.zonas, p.foto_url, t.servicios, t.tarifa_hora,
       t.disponible_ahora, t.rating_avg, t.rating_n, t.trabajos_completados, t.descripcion
from trabajadores t join perfiles p on p.id = t.id
where t.habilitado_trabajar;

-- ---------- Trigger: protege verificado y estado_migratorio, y calcula
-- habilitado_trabajar. Solo un admin puede verificar o validar/rechazar el
-- estatus migratorio; la propia persona nunca puede autohabilitarse. Mientras
-- no esté habilitada, se fuerza disponible_ahora = false. ----------
create or replace function fn_trabajador_guardas() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and mi_rol() is distinct from 'admin' then
    if new.verificado is distinct from old.verificado then
      raise exception 'Solo un administrador puede verificar';
    end if;
    if new.estado_migratorio in ('validado','rechazado')
       and new.estado_migratorio is distinct from old.estado_migratorio then
      raise exception 'Solo un administrador puede validar el estatus migratorio';
    end if;
  end if;

  new.habilitado_trabajar := new.verificado
    and (new.nacionalidad = 'peruana' or new.estado_migratorio = 'validado');

  if not new.habilitado_trabajar then
    new.disponible_ahora := false;
  end if;

  return new;
end $$;

drop trigger if exists trg_proteger_verificado on trabajadores;
drop trigger if exists trg_trabajador_guardas on trabajadores;
create trigger trg_trabajador_guardas before insert or update on trabajadores
  for each row execute function fn_trabajador_guardas();

drop function if exists fn_proteger_verificado();

-- El backfill de arriba corrió antes de que existiera el trigger: recalcula
-- habilitado_trabajar para que las trabajadoras ya verificadas no desaparezcan.
update trabajadores set habilitado_trabajar =
  verificado and (nacionalidad = 'peruana' or estado_migratorio = 'validado');
