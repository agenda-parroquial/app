-- La Secretaría vuelve a poder editar, cancelar y eliminar cualquier evento (con su PIN), y el evento
-- guarda quién lo editó: se muestra «Creado por …» y «Editado por …».
-- Requiere 20261103 (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.

-- La persona de la Secretaría que hizo la última edición (la app la manda al guardar, con su PIN).
alter table eventos add column editado_por_secretaria_id uuid references secretarias (id) on delete set null;

create or replace function trg_eventos_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_interno boolean := coalesce(current_setting('agenda.interno', true), '') = '1';
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'INSERT' then
    if new.misa_fija_id is null then
      new.creado_por := coalesce(auth.uid(), new.creado_por);
      if mi_rol() = 'secretaria' and new.secretaria_id is null then
        raise exception 'Falta identificarse con el PIN de la Secretaría.';
      end if;
    end if;
  else
    if v_interno then
      -- Cambios automáticos (empalmes, renombrar un tipo…): no cuentan como edición de nadie.
      new.version := old.version;
      new.modificado_por := old.modificado_por;
      new.editado_por_secretaria_id := old.editado_por_secretaria_id;
    else
      new.modificado_por := coalesce(auth.uid(), new.modificado_por);
      new.version := old.version + 1;
      if mi_rol() = 'secretaria' then
        new.secretaria_id := old.secretaria_id;   -- quién lo creó no se cambia
        if new.editado_por_secretaria_id is null then
          raise exception 'Falta identificarse con el PIN de la Secretaría.';
        end if;
      else
        new.editado_por_secretaria_id := null;     -- lo editó una cuenta con nombre propio
      end if;
    end if;
  end if;
  if new.lugar_id is not null and (tg_op = 'INSERT' or new.lugar_id is distinct from old.lugar_id)
     and not exists (select 1 from lugares where id = new.lugar_id and parroquia_id = new.parroquia_id) then
    raise exception 'El lugar no pertenece a esta parroquia';
  end if;
  if new.asignado_a is not null and (tg_op = 'INSERT' or new.asignado_a is distinct from old.asignado_a)
     and not exists (select 1 from perfiles where id = new.asignado_a and parroquia_id = new.parroquia_id) then
    raise exception 'La persona asignada no pertenece a esta parroquia';
  end if;
  if new.ministro_id is not null and (tg_op = 'INSERT' or new.ministro_id is distinct from old.ministro_id)
     and not exists (select 1 from ministros where id = new.ministro_id and parroquia_id = new.parroquia_id) then
    raise exception 'El ministro no pertenece a esta parroquia';
  end if;
  if new.secretaria_id is not null and (tg_op = 'INSERT' or new.secretaria_id is distinct from old.secretaria_id)
     and not exists (select 1 from secretarias where id = new.secretaria_id and parroquia_id = new.parroquia_id and activo) then
    raise exception 'La persona de la Secretaría no es válida.';
  end if;
  if new.editado_por_secretaria_id is not null and (tg_op = 'INSERT' or new.editado_por_secretaria_id is distinct from old.editado_por_secretaria_id)
     and not exists (select 1 from secretarias where id = new.editado_por_secretaria_id and parroquia_id = new.parroquia_id and activo) then
    raise exception 'La persona de la Secretaría no es válida.';
  end if;
  return new;
end $$;

-- Editar: cualquier evento de la parroquia. Eliminar: el párroco y la Secretaría cualquiera (menos las misas fijas, que se cancelan),
-- el vicario los que creó.
drop policy eventos_editar on eventos;
create policy eventos_editar on eventos for update
  using (parroquia_id = (select mi_parroquia()))
  with check (parroquia_id = (select mi_parroquia()));

drop policy eventos_borrar on eventos;
create policy eventos_borrar on eventos for delete
  using (parroquia_id = (select mi_parroquia())
         and misa_fija_id is null
         and (mi_rol() in ('parroco', 'secretaria')
              or (mi_rol() = 'vicario' and creado_por = auth.uid())));

-- Los avisos dicen quién fue: la persona de la Secretaría que editó o eliminó, si la hubo.
create or replace function trg_eventos_despues() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_quien text;
begin
  -- Los cambios de estado que hace el propio recalculo de conflictos no se reprocesan.
  if coalesce(current_setting('agenda.interno', true), '') = '1' then return null; end if;

  if tg_op = 'INSERT' then
    if new.misa_fija_id is null then
      select coalesce((select nullif(btrim(s.nombre), '') from secretarias s where s.id = new.secretaria_id),
                      (select nullif(btrim(p.nombre), '') from perfiles p where p.id = new.creado_por)) into v_quien;
      perform notificar_a_otros(new.parroquia_id, new.creado_por, 'evento_nuevo', new.id, null,
                                'Nuevo: ' || describir_evento(new) || coalesce(' (' || v_quien || ')', ''));
    end if;
  elsif (old.inicio, old.fin, old.lugar_id, old.lugar_texto, old.asignado_a, old.ministro_id, old.intencion, old.estado)
        is distinct from
        (new.inicio, new.fin, new.lugar_id, new.lugar_texto, new.asignado_a, new.ministro_id, new.intencion, new.estado) then
    select coalesce((select nullif(btrim(s.nombre), '') from secretarias s where s.id = new.editado_por_secretaria_id),
                    (select nullif(btrim(p.nombre), '') from perfiles p where p.id = new.modificado_por)) into v_quien;
    perform notificar_a_otros(
      new.parroquia_id,
      new.modificado_por,
      case when new.estado = 'cancelado' then 'evento_cancelado' else 'evento_editado' end,
      new.id, null,
      case when new.estado = 'cancelado' then 'Cancelado: ' else 'Modificado: ' end
        || describir_evento(new) || coalesce(' (' || v_quien || ')', ''));
  end if;

  perform revisar_conflictos(new.id);
  return null;
end $$;

-- Al eliminar, la app deja primero anotada a la persona de la Secretaría (editado_por_secretaria_id) para el aviso.
create or replace function trg_eventos_borrar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_quien text;
begin
  if old.misa_fija_id is null and auth.uid() is not null then
    select coalesce((select nullif(btrim(s.nombre), '') from secretarias s where s.id = old.editado_por_secretaria_id and mi_rol() = 'secretaria'),
                    (select nullif(btrim(p.nombre), '') from perfiles p where p.id = auth.uid())) into v_quien;
    perform notificar_a_otros(old.parroquia_id, auth.uid(), 'evento_cancelado', null, null,
                              'Eliminado: ' || describir_evento(old) || coalesce(' (' || v_quien || ')', ''));
  end if;

  -- Liberar de conflicto a sus contrapartes.
  perform set_config('agenda.interno', '1', true);
  update eventos x set estado = 'confirmado'
   where x.estado = 'en_conflicto'
     and x.id in (
       select case when c.evento_a = old.id then c.evento_b else c.evento_a end
         from conflictos c where c.estado = 'abierto' and old.id in (c.evento_a, c.evento_b))
     and not exists (
       select 1 from conflictos c2
        where c2.estado = 'abierto' and x.id in (c2.evento_a, c2.evento_b)
          and old.id not in (c2.evento_a, c2.evento_b));
  perform set_config('agenda.interno', '', true);
  return old;
end $$;
