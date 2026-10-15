-- COMPROBACIONES PREVIAS (solo lectura) del parche fn_enviar_push_cerrar_api.sql
-- ESTADO: preparadas, NO ejecutadas en LIMPIA (necesitan autorización expresa; el alcance de la anterior no las cubre).
-- Solo catálogo del sistema: no leen filas de tablas, ni auth.*, ni app_config, ni secretos. No muestran cuerpos de funciones:
-- sobre los llamadores solo se informa si mencionan fn_enviar_push y una huella md5 de su cuerpo (para comparar con la posterior).
-- Cada consulta se ejecuta por separado dentro de begin read only; ... rollback;

-- A. Todas las sobrecargas de fn_enviar_push en cualquier esquema: dueño, tipo de seguridad, parámetros de configuración (solo nombres)
select n.nspname as esquema, p.oid::regprocedure::text as firma, pg_get_userbyid(p.proowner) as dueno,
       p.prosecdef as security_definer,
       (select array_agg(split_part(x, '=', 1) order by x) from unnest(p.proconfig) x) as parametros_config,
       l.lanname as lenguaje
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where p.proname = 'fn_enviar_push'
order by 1, 2;

-- B. Quién puede ejecutar cada sobrecarga hoy (lista explícita del ACL; PUBLIC = grantee 0)
select p.oid::regprocedure::text as firma,
       case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as quien,
       pg_get_userbyid(a.grantor) as otorgado_por, a.privilege_type
from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where p.proname = 'fn_enviar_push' and p.pronamespace = 'public'::regnamespace
order by 1, 2;

-- C. Capacidad efectiva por rol (true = hoy puede llamarla)
select p.oid::regprocedure::text as firma,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role,
       has_function_privilege(p.proowner, p.oid, 'execute') as dueno
from pg_proc p
where p.proname = 'fn_enviar_push' and p.pronamespace = 'public'::regnamespace
order by 1;

-- D. Mecanismos internos que la llaman: funciones (cualquier esquema de usuario) cuyo cuerpo menciona fn_enviar_push.
--    Esperado hoy: los seis fn_push_* de la migración 0013, todos SECURITY DEFINER, con el mismo dueño que fn_enviar_push.
select n.nspname as esquema, p.oid::regprocedure::text as llamador, pg_get_userbyid(p.proowner) as dueno,
       p.prosecdef as security_definer,
       (select array_agg(split_part(x, '=', 1) order by x) from unnest(p.proconfig) x) as parametros_config,
       (p.proowner = (select t.proowner from pg_proc t where t.proname = 'fn_enviar_push' and t.pronamespace = 'public'::regnamespace limit 1)) as mismo_dueno_que_fn_enviar_push,
       has_function_privilege(p.proowner, (select t.oid from pg_proc t where t.proname = 'fn_enviar_push' and t.pronamespace = 'public'::regnamespace limit 1), 'execute') as su_dueno_puede_ejecutarla,
       md5(p.prosrc) as huella_cuerpo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
  and position('fn_enviar_push' in p.prosrc) > 0
  and p.proname <> 'fn_enviar_push'
order by 2;

-- E. Triggers que ejecutan a esos llamadores (nombres solamente)
select tgrelid::regclass::text as tabla, t.tgname, tgenabled, p.oid::regprocedure::text as funcion
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
  and position('fn_enviar_push' in p.prosrc) > 0
order by 1, 2;
