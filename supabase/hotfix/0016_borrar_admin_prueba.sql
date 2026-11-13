-- ============================================================
-- Eliminar por completo la cuenta admin@prueba.limpi.test (decisión del dueño, 2026-11-11)
-- ============================================================
-- ESTADO: PREPARADO, NO EJECUTADO. Se pega en el SQL Editor de LIMPIA (rol postgres). Independiente de la 0016, pero pégalo
-- DESPUÉS de ella (la cuenta no se migra a `admins`, así que ya no tiene ningún poder).
--
-- Qué hace (todo en UNA sola sentencia: si algo falla o hay dependencias, NO se borra nada)
--   1. Comprueba que el id corresponde a admin@prueba.limpi.test y que no figura en `admins`.
--   2. Comprueba que NINGUNA columna uuid de ninguna tabla de `public` (y ningún archivo de Storage) hace referencia a esa cuenta:
--      reservas, pagos, calificaciones, candidaturas, propuestas, préstamos, notificaciones, trabajadores, etc.
--      (se revisan TODAS las columnas uuid, tengan clave foránea o no). Si hay alguna, se niega y lista cuáles.
--   3. Si todo está limpio, borra de perfiles y de auth.users. Las tablas internas de Auth (identidades, sesiones) caen en cascada.
-- Si la cuenta ya no existe, avisa y no hace nada (se puede ejecutar más de una vez).
-- Antes de pegar el borrado, si quieres solo mirar las dependencias: cambia  v_borrar boolean := true  por  false.

do $$
declare
  v_id uuid := '2a8a649d-7ec5-4c33-8e13-9e4414bb15aa';
  v_borrar boolean := true;
  v_email text;
  c record;
  n bigint;
  v_detalle text := '';
begin
  select email into v_email from auth.users where id = v_id;
  if v_email is null and not exists (select 1 from public.perfiles where id = v_id) then
    raise notice 'La cuenta % ya no existe: no hay nada que borrar.', v_id;
    return;
  end if;
  if v_email is distinct from 'admin@prueba.limpi.test' then
    raise exception 'El id % no corresponde a admin@prueba.limpi.test (correo encontrado: %). No se borra nada.', v_id, coalesce(v_email, 'ninguno');
  end if;
  if exists (select 1 from public.admins where user_id = v_id) then
    raise exception 'La cuenta figura en la tabla admins. Quítala primero de admins si de verdad quieres borrarla. No se borra nada.';
  end if;

  -- Toda columna uuid de public (salvo la fila propia en perfiles) que apunte a esta cuenta
  for c in
    select t.table_name, t.column_name
    from information_schema.columns t
    join information_schema.tables x on x.table_schema = t.table_schema and x.table_name = t.table_name and x.table_type = 'BASE TABLE'
    where t.table_schema = 'public' and t.data_type = 'uuid' and not (t.table_name = 'perfiles' and t.column_name = 'id')
    order by 1, 2
  loop
    execute format('select count(*) from public.%I where %I = $1', c.table_name, c.column_name) into n using v_id;
    if n > 0 then v_detalle := v_detalle || format(E'\n   - %s.%s: %s fila(s)', c.table_name, c.column_name, n); end if;
  end loop;

  -- Archivos en Storage (carpeta con su id o propietario)
  if to_regclass('storage.objects') is not null then
    execute $q$select count(*) from storage.objects o
                where (storage.foldername(o.name))[1] = $1::text
                   or to_jsonb(o)->>'owner' = $1::text or to_jsonb(o)->>'owner_id' = $1::text$q$ into n using v_id;
    if n > 0 then v_detalle := v_detalle || format(E'\n   - storage.objects: %s archivo(s)', n); end if;
  end if;

  if v_detalle <> '' then
    raise exception 'No se borra nada: la cuenta admin@prueba tiene filas que dependen de ella:%', v_detalle;
  end if;

  if not v_borrar then
    raise notice 'Sin dependencias: la cuenta se puede borrar (v_borrar = false: no se borró).';
    return;
  end if;

  delete from public.perfiles where id = v_id;
  delete from auth.users where id = v_id;
  raise notice 'Cuenta admin@prueba.limpi.test eliminada de perfiles y de auth.users.';
end $$;
