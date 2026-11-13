-- Reversa de 01_pegar_ahora.sql (SQL Editor de LIMPIA, rol postgres).
-- 1. Dominios: vuelve a los de la vista previa (como estaban antes).
-- 2. Bucket documentos: Supabase no deja borrar buckets por SQL. Si de verdad hay que quitarlo, hazlo desde el panel
--    (Storage > documentos > Delete bucket) y solo si está vacío. Dejarlo creado y privado no causa ningún problema.
-- 3. Contraseñas: no se pueden "des-cambiar" (la anterior no se guarda). Para poner otra, vuelve a pegar la sección 3 de
--    01_pegar_ahora.sql con la contraseña que quieras.

begin;

update app_config
set url_app_cliente = 'https://yavi-pruebas.vercel.app',
    url_app_profesional = 'https://yavi-pro-pruebas.vercel.app',
    url_app_admin = null
where id = true;

commit;
