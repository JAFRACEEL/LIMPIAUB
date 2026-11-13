-- ============================================================
-- 0016a — PARCHE MÍNIMO: la API no puede cambiar perfiles.rol
-- ============================================================
-- ESTADO: PREPARADO. Se pega en el SQL Editor de LIMPIA (rol postgres). Independiente de la 0016.
--
-- Problema (verificado en LIMPIA el 2026-11-11, solo lectura, deducido sin ejecutar nada):
--   * perfiles NO tiene ningún trigger.
--   * perfiles_update = USING (auth.uid() = id OR mi_rol() = 'admin') y sin WITH CHECK, así que cualquier usuario
--     autenticado puede actualizar SU fila completa, incluida la columna rol:  update perfiles set rol = 'admin' ...
--   (Salvedad: no se revisaron los GRANT por columna; si UPDATE(rol) estuviera revocado a authenticated, esto no aplicaría.)
--
-- Qué hace
--   * Trigger BEFORE UPDATE OF rol que rechaza cualquier cambio de rol cuando quien ejecuta es authenticated o anon
--     (las dos identidades con las que entra la API pública).
--   * NO bloquea: el SQL Editor (postgres), service_role ni funciones SECURITY DEFINER (corren como su dueño).
--   * NO bloquea el upsert del registro: si el rol no cambia, el trigger lo deja pasar.
--   * No cambia ninguna política, función existente, tabla ni dato. Idempotente.
-- Qué NO hace: no cubre el alta de un técnico ya verificado (trabajadores); eso va en la 0016.
-- Reversa:  drop trigger if exists trg_proteger_rol_perfiles on perfiles;  drop function if exists fn_proteger_rol_perfiles();

begin;

create or replace function fn_proteger_rol_perfiles() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.rol is distinct from old.rol and current_user in ('authenticated', 'anon') then
    raise exception 'El rol no se puede cambiar desde la aplicación';
  end if;
  return new;
end $$;

-- Función de trigger: no debe poder llamarse por la API.
revoke execute on function fn_proteger_rol_perfiles() from public, anon, authenticated;

drop trigger if exists trg_proteger_rol_perfiles on perfiles;
create trigger trg_proteger_rol_perfiles
  before update of rol on perfiles
  for each row execute function fn_proteger_rol_perfiles();

-- Comprobación: el trigger existe, está activo y la función no es ejecutable por la API.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_proteger_rol_perfiles' and tgrelid = 'public.perfiles'::regclass and tgenabled = 'O') then
    raise exception '0016a: el trigger no quedó activo; se revierte todo';
  end if;
  if has_function_privilege('authenticated', 'public.fn_proteger_rol_perfiles()', 'execute')
     or has_function_privilege('anon', 'public.fn_proteger_rol_perfiles()', 'execute') then
    raise exception '0016a: la función quedó ejecutable por la API; se revierte todo';
  end if;
end $$;

commit;
