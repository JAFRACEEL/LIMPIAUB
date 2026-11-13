-- ============================================================
-- PRODUCCIÓN INTERNA — bloque único para pegar en el SQL Editor de LIMPIA (rol postgres)
-- ============================================================
-- Una sola transacción: si algo falla, no cambia nada. Se puede pegar más de una vez.
-- ANTES DE PEGAR: reemplaza las dos contraseñas de la sección 3 (están marcadas con CAMBIAR). Si no las cambias, el bloque se niega.
-- Reversa: 01_reversa.sql
--
-- Qué hace
--   1. Crea el bucket `documentos` PRIVADO (no existía: las políticas sí, pero sin bucket la subida de documentos del
--      profesional, las fotos de referencia y las evidencias de pago fallan). Si ya existe, solo se asegura de que sea privado.
--   2. Dominios de producción de cada app para los enlaces de los avisos push (app_config.url_app_*).
--   3. Cambia la contraseña de admin.demo y de clienta.demo (la de clienta.demo quedó expuesta) y cierra sus sesiones abiertas.
-- Qué NO hace: no borra cuentas ni datos (eso es 02_borrar_cuentas_demo.sql, para DESPUÉS del recorrido). No hay migraciones
--   pendientes: la 0016 y la 0017 ya están aplicadas, y no queda ninguna función interna ejecutable por anon/authenticated.

begin;

-- 1. Bucket documentos, privado. Límite de 10 MB por archivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 10485760)
on conflict (id) do update set public = false;

-- 2. Dominios de producción (sin barra final).
update app_config
set url_app_cliente = 'https://limpi-fawn.vercel.app',
    url_app_profesional = 'https://yavi-pro.vercel.app',
    url_app_admin = 'https://yavi-admin.vercel.app'
where id = true;

-- 3. Contraseñas nuevas de las cuentas demo.
do $$
declare
  v_admin_demo text := 'CAMBIAR-admin-demo';      -- <- escribe aquí la contraseña nueva de admin.demo (mínimo 10 caracteres)
  v_clienta_demo text := 'CAMBIAR-clienta-demo';  -- <- escribe aquí la contraseña nueva de clienta.demo (mínimo 10 caracteres)
  n int;
begin
  if v_admin_demo like 'CAMBIAR%' or v_clienta_demo like 'CAMBIAR%' then
    raise exception 'Falta escribir las contraseñas nuevas en la sección 3. No se cambió nada.';
  end if;
  if length(v_admin_demo) < 10 or length(v_clienta_demo) < 10 or v_admin_demo = v_clienta_demo then
    raise exception 'Las contraseñas deben tener al menos 10 caracteres y ser distintas entre sí. No se cambió nada.';
  end if;

  update auth.users set encrypted_password = extensions.crypt(v_admin_demo, extensions.gen_salt('bf')), updated_at = now()
  where email = 'admin.demo@prueba.limpi.test';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'No se encontró admin.demo@prueba.limpi.test (filas: %). No se cambió nada.', n; end if;

  update auth.users set encrypted_password = extensions.crypt(v_clienta_demo, extensions.gen_salt('bf')), updated_at = now()
  where email = 'clienta.demo@prueba.limpi.test';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'No se encontró clienta.demo@prueba.limpi.test (filas: %). No se cambió nada.', n; end if;

  -- Cierra las sesiones abiertas de esas dos cuentas (quien tuviera la clave vieja queda fuera).
  delete from auth.sessions where user_id in (
    select id from auth.users where email in ('admin.demo@prueba.limpi.test', 'clienta.demo@prueba.limpi.test')
  );
end $$;

commit;

-- Comprobación (solo lectura): debe mostrar documentos=false (privado) y los tres dominios.
select (select public from storage.buckets where id = 'documentos') as documentos_publico,
       url_app_cliente, url_app_profesional, url_app_admin
from app_config where id = true;
