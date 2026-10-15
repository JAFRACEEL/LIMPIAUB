-- CONSULTAS DE SOLO LECTURA PARA COMPARAR EL ESQUEMA.
-- Ejecutadas en LIMPIA el 2026-10-14 con autorización expresa del dueño (cada una dentro de begin read only / rollback);
-- resultados en docs/inspeccion-esquema-limpia.md. Cualquier otra ejecución necesita una autorización nueva.
--
-- Reglas de seguridad de este archivo:
--   * Transacción de solo lectura: cualquier escritura fallaría.
--   * Solo catálogo del sistema (pg_catalog / information_schema). No lee filas de tablas de la aplicación,
--     de auth.*, de storage.*, de vault.* ni de app_config. No hay conteos de datos.
--   * NINGÚN texto de definición sale en claro: funciones, vistas, triggers, políticas, valores por defecto y
--     restricciones se comparan por huella md5. Así, aunque una definición incrustara un secreto, no se expone.
--     (Si una huella difiere, se pide la autorización puntual de ese objeto; no se muestra automáticamente.)
--   * De la configuración de funciones (proconfig) solo salen los NOMBRES de los parámetros, no los valores.
-- Para comparar: correr lo mismo en el proyecto de pruebas (con schema.sql + 0001..0014) y comparar las salidas.

begin read only;

-- 1. Columnas de las tablas y vistas de Limpi: tipo, nulabilidad, si es generada y huella del valor por defecto
select c.relname as tabla, a.attnum, a.attname as columna,
       format_type(a.atttypid, a.atttypmod) as tipo, a.attnotnull as no_nulo,
       a.attgenerated as generada,
       md5(coalesce(pg_get_expr(d.adbin, d.adrelid), '')) as huella_defecto
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where n.nspname = 'public' and c.relkind in ('r','v') and a.attnum > 0 and not a.attisdropped
order by c.relname, a.attnum;

-- 2. Restricciones: nombre, tipo y huella de la definición
select conrelid::regclass as tabla, conname, contype, md5(pg_get_constraintdef(oid)) as huella
from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2;

-- 3. Funciones: firma, si son security definer, volatilidad, nombres de parámetros de configuración y huella
select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosecdef as security_definer, p.provolatile,
       (select array_agg(split_part(x, '=', 1) order by x) from unnest(p.proconfig) x) as parametros_config,
       md5(pg_get_functiondef(p.oid)) as huella
from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1, 2;

-- 4. Vistas: huella de la definición
select c.relname as vista, md5(pg_get_viewdef(c.oid)) as huella
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' order by 1;

-- 5. Triggers: tabla, nombre, si están habilitados y huella
select tgrelid::regclass as tabla, tgname, tgenabled, md5(pg_get_triggerdef(oid)) as huella
from pg_trigger
where not tgisinternal
  and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
order by 1, 2;

-- 6. RLS por tabla y políticas (nombre, comando, roles y huellas de las condiciones; sin texto)
select c.relname as tabla, c.relrowsecurity as rls, c.relforcerowsecurity as rls_forzada
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1;
select tablename, policyname, cmd, roles,
       md5(coalesce(qual, '')) as huella_using, md5(coalesce(with_check, '')) as huella_with_check
from pg_policies where schemaname = 'public' order by 1, 2;

-- 7. Permisos de anon / authenticated / PUBLIC sobre tablas, vistas y funciones
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC') group by 1, 2 order by 1, 2;
select routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public' and grantee in ('anon','authenticated','PUBLIC') order by 1, 2;

-- 8. Migraciones registradas por la CLI (solo versión y nombre; la tabla puede no existir si se aplicaron a mano)
-- La consulta va como texto dentro de query_to_xml: solo se analiza si la tabla existe (CASE), así que su
-- ausencia se informa como 'NO EXISTE' y las demás comprobaciones siguen.
select case
         when to_regclass('supabase_migrations.schema_migrations') is null
           then 'NO EXISTE supabase_migrations.schema_migrations (migraciones aplicadas a mano o sin registrar)'
         else query_to_xml('select version, name from supabase_migrations.schema_migrations order by version',
                           false, false, '')::text
       end as migraciones_registradas;

-- 9. Extensiones y tablas publicadas en Realtime
select extname, extversion from pg_extension order by 1;
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;

rollback;
