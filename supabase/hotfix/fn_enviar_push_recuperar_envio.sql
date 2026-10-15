-- RECUPERAR EL ENVÍO LEGÍTIMO SIN REABRIR EL ACCESO PÚBLICO
-- ESTADO: preparado, NO ejecutado en ningún proyecto. Solo se usa si, tras el parche, los avisos internos dejan de enviarse
-- (por ejemplo, un llamador cuyo dueño no tenía EXECUTE). El parche ya aborta antes de confirmar si detecta ese caso, por lo
-- que esto es un plan de contingencia.
--
-- Qué hace: concede EXECUTE sobre fn_enviar_push SOLO al rol DUEÑO de cada llamador SECURITY DEFINER que no pueda ejecutarla.
-- Nunca concede a PUBLIC, anon ni authenticated (el script se niega si el dueño fuera uno de ellos).
-- Qué NO hace: no convierte llamadores SECURITY INVOKER (eso cambia su semántica de seguridad y se decide caso por caso:
--   alter function <llamador> security definer set search_path = public;  -- revisar antes de ejecutar).
-- NO es una reversión del parche: la reversión (volver a abrir a anon/authenticated) NO se ofrece, porque restauraría el riesgo.
-- Atómico: una sola sentencia (bloque DO) sin BEGIN/COMMIT; si falla, no queda nada aplicado.
do $$
declare
  f record; c record; v_concedidos int := 0; v_pendientes text[] := '{}';
begin
  for f in select p.oid, p.oid::regprocedure::text as firma from pg_proc p
           where p.proname = 'fn_enviar_push' and p.pronamespace = 'public'::regnamespace loop
    for c in
      select p.oid::regprocedure::text as firma, p.prosecdef, p.proowner, pg_get_userbyid(p.proowner) as dueno
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.oid <> f.oid and n.nspname not in ('pg_catalog', 'information_schema')
        and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
        and position('fn_enviar_push' in p.prosrc) > 0
    loop
      if not c.prosecdef then
        v_pendientes := v_pendientes || format('%s es SECURITY INVOKER: decisión manual (ver nota arriba)', c.firma);
      elsif not has_function_privilege(c.proowner, f.oid, 'execute') then
        if c.dueno in ('anon', 'authenticated', 'public') then
          raise exception 'El dueño de % es % : no se concede EXECUTE a un rol de la API', c.firma, c.dueno;
        end if;
        execute format('grant execute on function %s to %I', f.firma, c.dueno);
        v_concedidos := v_concedidos + 1;
        raise notice 'EXECUTE concedido a % (dueño de %)', c.dueno, c.firma;
      end if;
    end loop;
    -- el acceso público debe seguir cerrado
    if has_function_privilege('anon', f.oid, 'execute') or has_function_privilege('authenticated', f.oid, 'execute') then
      raise exception 'anon/authenticated pueden ejecutar %: no se debe reabrir; se revierte', f.firma;
    end if;
  end loop;
  raise notice 'Concesiones: %. Pendientes de decisión manual: %', v_concedidos, coalesce(array_to_string(v_pendientes, '; '), 'ninguno');
end $$;
-- Después: fn_enviar_push_verificar_despues.sql (todas las filas ok = true).
