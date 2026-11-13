-- ============================================================
-- Borrar las cuentas demo y de prueba — para DESPUÉS del recorrido, antes del lanzamiento al público
-- ============================================================
-- SQL Editor de LIMPIA (rol postgres). Una sola transacción. NO TIENE REVERSA: saca un respaldo antes
-- (Database > Backups) si quieres poder volver.
--
-- Qué borra: todas las cuentas @prueba.limpi.test y la cuenta de prueba de correo frd.grupo@frdinnovacion.com, con sus pedidos,
--   propuestas, postulaciones, pagos, calificaciones, préstamos de kit y suscripciones push.
-- Qué NO toca: las cuentas reales (correos que no son @prueba.limpi.test). Si algún pedido o préstamo mezcla una cuenta demo
--   con una cuenta real, el bloque se niega y no borra nada (hay que decidir ese caso a mano).
-- Ojo: admin.demo es una de las dos cuentas de administración; al borrarla queda solo la cuenta real de administración.
-- Para solo mirar qué se borraría, cambia  v_borrar boolean := true  por  false.

begin;

do $$
declare
  v_borrar boolean := true;
  v_demo uuid[];
  n_mezcla bigint;
  n_reservas bigint;
begin
  select array_agg(id) into v_demo from auth.users
  where email like '%@prueba.limpi.test' or email = 'frd.grupo@frdinnovacion.com';
  if v_demo is null then
    raise notice 'No hay cuentas demo: nada que borrar.';
    return;
  end if;

  -- Pedidos que mezclan una cuenta demo con una cuenta real: no se tocan sin decidirlo.
  select count(*) into n_mezcla from reservas r
  where r.trabajador_id is not null and (r.cliente_id = any(v_demo)) <> (r.trabajador_id = any(v_demo));
  if n_mezcla > 0 then
    raise exception 'Hay % pedido(s) entre una cuenta demo y una cuenta real. No se borró nada.', n_mezcla;
  end if;
  if exists (select 1 from candidaturas c join reservas r on r.id = c.reserva_id where c.trabajador_id = any(v_demo) and not (r.cliente_id = any(v_demo)))
     or exists (select 1 from propuestas p join reservas r on r.id = p.reserva_id where p.trabajador_id = any(v_demo) and not (r.cliente_id = any(v_demo)))
     or exists (select 1 from pagos p join reservas r on r.id = p.reserva_id where (p.registrado_por = any(v_demo) or p.verificado_por = any(v_demo)) and not (r.cliente_id = any(v_demo))) then
    raise exception 'Una cuenta demo tiene postulaciones, propuestas o pagos en pedidos de clientes reales. No se borró nada.';
  end if;

  select count(*) into n_reservas from reservas r where r.cliente_id = any(v_demo) or r.trabajador_id = any(v_demo);
  raise notice 'Cuentas demo: %. Pedidos de esas cuentas: %.', array_length(v_demo, 1), n_reservas;
  if not v_borrar then
    raise notice 'Modo solo mirar: no se borró nada.';
    return;
  end if;

  -- Orden: primero lo que cuelga de los pedidos y de los préstamos, luego los pedidos, al final las cuentas.
  delete from prestamo_kit_movimientos m
  where m.prestamo_id in (select id from prestamos_kit where trabajador_id = any(v_demo))
     or m.reserva_id in (select id from reservas r where r.cliente_id = any(v_demo) or r.trabajador_id = any(v_demo));
  delete from prestamos_kit where trabajador_id = any(v_demo);
  -- Al borrar el pedido caen en cascada sus postulaciones, propuestas, pagos y calificaciones.
  delete from reservas r where r.cliente_id = any(v_demo) or r.trabajador_id = any(v_demo);
  delete from calificaciones where de_id = any(v_demo) or para_id = any(v_demo);
  -- Archivos subidos por esas cuentas (carpeta = su id): Supabase no deja borrarlos por SQL. Si hay, se avisa para borrarlos
  -- desde el panel (Storage), carpeta por carpeta.
  if exists (select 1 from storage.objects o where split_part(o.name, '/', 1) in (select unnest(v_demo)::text)) then
    raise notice 'Quedan archivos de cuentas demo en Storage: bórralos desde el panel (Storage > fotos / documentos).';
  end if;
  -- Al borrar la cuenta caen en cascada perfil, perfil de profesional, precios, admins y suscripciones push.
  delete from auth.users where id = any(v_demo);
end $$;

commit;

-- Comprobación (solo lectura): no debe quedar ninguna.
select count(*) as cuentas_demo_restantes from auth.users where email like '%@prueba.limpi.test' or email = 'frd.grupo@frdinnovacion.com';
