-- COMPROBACIONES POSTERIORES (solo lectura) del parche fn_enviar_push_cerrar_api.sql
-- ESTADO: preparadas, NO ejecutadas en LIMPIA. Una sola consulta: cada fila es una comprobación y TODAS deben dar ok = true.
-- Solo catálogo del sistema; no lee datos ni secretos. Ejecutar dentro de begin read only; ... rollback;
-- La huella del cuerpo de los llamadores debe ser IDÉNTICA a la que dio fn_enviar_push_verificar_antes.sql (consulta D):
-- el parche no modifica ninguna función.

with objetivo as (
  select p.oid, p.oid::regprocedure::text as firma, p.proowner
  from pg_proc p where p.proname = 'fn_enviar_push' and p.pronamespace = 'public'::regnamespace
),
llamadores as (
  select p.oid, p.oid::regprocedure::text as firma, p.prosecdef, p.proowner, md5(p.prosrc) as huella
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
    and position('fn_enviar_push' in p.prosrc) > 0 and p.proname <> 'fn_enviar_push'
)
select 'existe al menos una sobrecarga' as comprobacion, (select count(*) from objetivo) >= 1 as ok, (select count(*)::text from objetivo) as detalle
union all
select 'anon NO puede ejecutarla: ' || firma, not has_function_privilege('anon', oid, 'execute'), '' from objetivo
union all
select 'authenticated NO puede ejecutarla: ' || firma, not has_function_privilege('authenticated', oid, 'execute'), '' from objetivo
union all
select 'PUBLIC NO tiene EXECUTE: ' || o.firma,
       not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = o.oid and a.grantee = 0 and a.privilege_type = 'EXECUTE'), ''
from objetivo o
union all
select 'el dueño conserva EXECUTE: ' || firma, has_function_privilege(proowner, oid, 'execute'), pg_get_userbyid(proowner) from objetivo
union all
select 'llamador SECURITY DEFINER: ' || l.firma, l.prosecdef, '' from llamadores l
union all
select 'el dueño del llamador puede ejecutarla: ' || l.firma,
       coalesce(bool_and(has_function_privilege(l.proowner, o.oid, 'execute')), false), pg_get_userbyid(l.proowner)
from llamadores l cross join objetivo o group by l.firma, l.proowner
union all
select 'hay llamadores (esperado 6 hoy: fn_push_* de la 0013)', (select count(*) from llamadores) >= 1, (select count(*)::text from llamadores)
union all
select 'huella de cuerpo (comparar con la consulta D previa): ' || firma, true, huella from llamadores
order by 1;
