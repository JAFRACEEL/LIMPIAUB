-- HUELLAS DE FUNCIONES PARA SEPARAR DIFERENCIAS DE REPRESENTACIÓN DE CAMBIOS REALES (solo lectura).
-- ESTADO: preparadas. NO ejecutadas en LIMPIA (requieren una autorización nueva y específica del dueño). Se pueden correr
-- libremente en limpia-test, que es un proyecto de pruebas.
-- Salida: solo huellas md5 y atributos; ningún texto de definición. No lee datos ni secretos.
-- Ejecutar dentro de begin read only; ... rollback;  y guardar el resultado como JSON para supabase/tests/comparar-huellas.mjs.
--
-- Cómo usarlas (importante):
--   * `huella_original` (md5 de pg_get_functiondef) y `huella_cuerpo` (md5 de prosrc, el texto exacto del cuerpo, sin cabecera
--     y por tanto independiente de la versión del motor) son las ÚNICAS que prueban equivalencia: si coinciden, el texto es idéntico.
--   * `huella_sin_cr` solo quita los retornos de carro (\r) de fin de línea. Es un APOYO: indica que la diferencia es de fin de línea.
--   * `huella_espacios_norm` colapsa TODOS los espacios y saltos. Es solo un APOYO para orientar la revisión: puede ocultar un cambio
--     dentro de un literal de texto ('a  b' vs 'a b'). NUNCA se usa para dar una función por equivalente.
--   * `atributos` agrupa lo que no es cuerpo (argumentos, retorno, lenguaje, seguridad, volatilidad, nombres de configuración)
--     para detectar un cambio de cabecera aunque el cuerpo coincida.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       md5(pg_get_functiondef(p.oid))                                          as huella_original,
       md5(p.prosrc)                                                           as huella_cuerpo,
       md5(replace(p.prosrc, E'\r', ''))                                       as huella_sin_cr,
       md5(regexp_replace(replace(p.prosrc, E'\r', ''), '\s+', ' ', 'g'))      as huella_espacios_norm,
       position(E'\r' in p.prosrc) > 0                                         as cuerpo_con_cr,
       length(p.prosrc)                                                        as largo_cuerpo,
       md5(concat_ws('|', pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid), l.lanname,
                      p.prosecdef::text, p.provolatile::text, p.proparallel::text, p.proisstrict::text,
                      coalesce((select string_agg(split_part(x, '=', 1), ',' order by x) from unnest(p.proconfig) x), ''))) as atributos
from pg_proc p
join pg_language l on l.oid = p.prolang
where p.pronamespace = 'public'::regnamespace
order by 1, 2;
