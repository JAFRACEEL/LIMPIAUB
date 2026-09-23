-- Limpi: distingue "pendiente de revisión" de "rechazado" en la verificación
-- general del admin (el booleano `verificado` por sí solo no alcanza para
-- sacar a alguien de la cola de pendientes sin marcarlo como verificado).
-- Idempotente.

alter table trabajadores add column if not exists verificacion_rechazada boolean not null default false;
alter table trabajadores add column if not exists motivo_rechazo text;

-- Solo un admin puede tocar estos campos, igual que verificado/estado_migratorio.
create or replace function fn_trabajador_guardas() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and mi_rol() is distinct from 'admin' then
    if new.verificado is distinct from old.verificado then
      raise exception 'Solo un administrador puede verificar';
    end if;
    if new.verificacion_rechazada is distinct from old.verificacion_rechazada then
      raise exception 'Solo un administrador puede rechazar una verificación';
    end if;
    if new.estado_migratorio in ('validado','rechazado')
       and new.estado_migratorio is distinct from old.estado_migratorio then
      raise exception 'Solo un administrador puede validar el estatus migratorio';
    end if;
    -- Si no, alguien extranjera con estatus migratorio pendiente/rechazado
    -- podría declararse "peruana" desde su propio perfil y autohabilitarse
    -- sin pasar por el admin.
    if new.nacionalidad is distinct from old.nacionalidad then
      raise exception 'Solo un administrador puede cambiar la nacionalidad declarada';
    end if;
  end if;

  new.habilitado_trabajar := new.verificado
    and (new.nacionalidad = 'peruana' or new.estado_migratorio = 'validado');

  if not new.habilitado_trabajar then
    new.disponible_ahora := false;
  end if;

  return new;
end $$;
