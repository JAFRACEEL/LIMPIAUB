-- ============================================================
-- 0016b — PARCHE MÍNIMO: el alta de un técnico por la API siempre nace pendiente
-- ============================================================
-- ESTADO: PREPARADO. Se pega en el SQL Editor de LIMPIA (rol postgres). Independiente de la 0016a y de la 0016.
--
-- Problema (verificado en LIMPIA el 2026-11-11 con solo lectura; reproducido en simulación):
--   * trab_insert solo exige  auth.uid() = id.
--   * fn_trabajador_guardas bloquea cambiar "verificado" únicamente en UPDATE; en INSERT calcula
--       habilitado_trabajar := verificado and (nacionalidad = 'peruana' or estado_migratorio = 'validado')
--     y, además, la tabla concede INSERT a authenticated sin restricción por columna.
--   => cualquier usuario autenticado puede insertar su fila de técnico con verificado = true y quedar habilitado
--      sin pasar por el admin.
--
-- Qué hace
--   * Trigger BEFORE INSERT en trabajadores. Si quien inserta es authenticated o anon (la API pública) fuerza:
--       verificado = false, habilitado_trabajar = false, verificacion_rechazada = false, motivo_rechazo = null,
--       disponible_ahora = false, estado_migratorio 'validado'/'rechazado' -> 'no_aplica' (peruana) o 'pendiente_validacion',
--       y los contadores de reputación (rating_avg, rating_n, trabajos_completados) en 0 (nadie nace con calificaciones).
--   * NO toca ningún campo declarativo del registro (documento, zonas, servicios, tarifa, referencias, etc.).
--   * NO bloquea: el SQL Editor (postgres), service_role ni funciones SECURITY DEFINER (corren como su dueño);
--     la verificación por un admin sigue siendo un UPDATE y no pasa por este trigger.
--   * Se llama trg_trabajador_alta_pendiente, que por orden alfabético corre ANTES de trg_trabajador_guardas.
--   * No cambia ninguna política, tabla, dato ni el cuerpo de ninguna función existente. Idempotente.
-- Qué NO hace: no impide que el dueño edite después sus propios contadores de reputación con un UPDATE (eso va en la 0016).
-- Reversa:  drop trigger if exists trg_trabajador_alta_pendiente on trabajadores;  drop function if exists fn_trabajador_alta_pendiente();

begin;

create or replace function fn_trabajador_alta_pendiente() returns trigger
language plpgsql
set search_path = public
as $$
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
end $$;

-- Función de trigger: no debe poder llamarse por la API.
revoke execute on function fn_trabajador_alta_pendiente() from public, anon, authenticated;

drop trigger if exists trg_trabajador_alta_pendiente on trabajadores;
create trigger trg_trabajador_alta_pendiente
  before insert on trabajadores
  for each row execute function fn_trabajador_alta_pendiente();

-- Comprobación: el trigger existe, está activo, corre antes que trg_trabajador_guardas y la función no es ejecutable por la API.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_trabajador_alta_pendiente' and tgrelid = 'public.trabajadores'::regclass and tgenabled = 'O') then
    raise exception '0016b: el trigger no quedó activo; se revierte todo';
  end if;
  if 'trg_trabajador_alta_pendiente' > 'trg_trabajador_guardas' then
    raise exception '0016b: el orden de los triggers no es el esperado; se revierte todo';
  end if;
  if has_function_privilege('authenticated', 'public.fn_trabajador_alta_pendiente()', 'execute')
     or has_function_privilege('anon', 'public.fn_trabajador_alta_pendiente()', 'execute') then
    raise exception '0016b: la función quedó ejecutable por la API; se revierte todo';
  end if;
end $$;

commit;
