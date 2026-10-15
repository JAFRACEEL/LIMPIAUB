-- ============================================================
-- PARCHE MÍNIMO: cerrar la ejecución directa de fn_enviar_push a PUBLIC, anon y authenticated
-- ============================================================
-- ESTADO: PREPARADO, NO EJECUTADO EN NINGÚN PROYECTO REAL. Independiente de la migración 0015 (la 0015 también
-- contiene este mismo REVOKE; aplicar este parche antes no la afecta y la 0015 sigue siendo idempotente).
-- NO ejecutar en LIMPIA sin autorización expresa del dueño. Antes: fn_enviar_push_verificar_antes.sql.
-- Después: fn_enviar_push_verificar_despues.sql. Recuperación del envío: fn_enviar_push_recuperar_envio.sql.
--
-- Qué hace
--   * Quita EXECUTE a PUBLIC, anon y authenticated en TODAS las sobrecargas de public.fn_enviar_push.
--   * NO toca a service_role, postgres ni otros roles de Supabase; NO toca ninguna otra función, tabla, vista ni política.
--   * Los avisos legítimos los envían funciones SECURITY DEFINER (triggers) que corren como su dueño; el dueño
--     conserva EXECUTE. Antes de confirmar, el propio parche COMPRUEBA eso y, si no se cumple, ABORTA y revierte
--     todo (no deja la base a medias).
--
-- Qué NO hace: no cambia privilegios por defecto (ALTER DEFAULT PRIVILEGES): una función nueva creada después
-- volverá a nacer ejecutable por anon/authenticated y habrá que revocarla igual. No toca cuerpos de funciones.

-- ATOMICIDAD: todo el parche es UNA sola sentencia (un bloque DO), sin BEGIN/COMMIT explícitos. Si cualquier comprobación
-- falla, PostgreSQL deshace todo el bloque y la sesión queda limpia (no queda ninguna transacción abierta ni abortada).

do $$
declare
  f record;      -- sobrecargas de fn_enviar_push
  c record;      -- funciones que mencionan fn_enviar_push en su cuerpo
  v_sobrecargas int := 0;
  v_fallos text[] := '{}';
begin
  perform set_config('lock_timeout', '5s', true);   -- solo para esta sentencia
  -- 1. Cerrar TODAS las sobrecargas en public (hoy existe una: fn_enviar_push(uuid[], text, text, text))
  for f in
    select p.oid, p.oid::regprocedure::text as firma
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'fn_enviar_push'
  loop
    v_sobrecargas := v_sobrecargas + 1;
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    raise notice 'Cerrada: %', f.firma;
  end loop;
  if v_sobrecargas = 0 then
    raise exception 'No existe public.fn_enviar_push: no hay nada que cerrar; se aborta sin cambios';
  end if;

  -- 2. Comprobaciones de seguridad ANTES de confirmar (si algo falla, se revierte todo)
  for f in
    select p.oid, p.oid::regprocedure::text as firma, p.proowner, pg_get_userbyid(p.proowner) as dueno
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'fn_enviar_push'
  loop
    -- 2a. el dueño sigue pudiendo ejecutarla
    if not has_function_privilege(f.proowner, f.oid, 'execute') then
      v_fallos := v_fallos || format('el dueño (%s) no puede ejecutar %s', f.dueno, f.firma);
    end if;
    -- 2b. ninguna de las tres identidades públicas conserva EXECUTE (por si el permiso venía de otro otorgante)
    if has_function_privilege('anon', f.oid, 'execute')
       or has_function_privilege('authenticated', f.oid, 'execute')
       or exists (select 1 from pg_proc p2, aclexplode(coalesce(p2.proacl, acldefault('f', p2.proowner))) a
                  where p2.oid = f.oid and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      v_fallos := v_fallos || format('%s sigue ejecutable por PUBLIC/anon/authenticated (permiso otorgado por otro rol: revisar ACL)', f.firma);
    end if;

    -- 2c. cada función que la llama debe ser SECURITY DEFINER y su dueño debe poder ejecutarla
    for c in
      select p.oid, p.oid::regprocedure::text as firma, p.prosecdef, p.proowner, pg_get_userbyid(p.proowner) as dueno
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where p.oid <> f.oid
        and n.nspname not in ('pg_catalog', 'information_schema')
        and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
        and position('fn_enviar_push' in p.prosrc) > 0
    loop
      if not c.prosecdef then
        v_fallos := v_fallos || format('el llamador %s es SECURITY INVOKER: correría como el usuario de la API y perdería el envío', c.firma);
      elsif not has_function_privilege(c.proowner, f.oid, 'execute') then
        v_fallos := v_fallos || format('el dueño (%s) del llamador %s no puede ejecutar %s', c.dueno, c.firma, f.firma);
      end if;
    end loop;
  end loop;

  if array_length(v_fallos, 1) is not null then
    raise exception E'Parche abortado y revertido (no se cambió nada):\n - %', array_to_string(v_fallos, E'\n - ');
  end if;
  raise notice 'Parche correcto: % sobrecarga(s) cerrada(s); el dueño y los llamadores conservan el envío', v_sobrecargas;
end $$;
