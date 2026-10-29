-- 1) La cuenta de Oficina (secretaría) solo pide PIN si la parroquia tiene personas registradas. Si no hay ninguna, se entiende que
--    la usa una sola persona: lo que haga queda a nombre de la cuenta, sin PIN.
-- 2) Cada parroquia tiene un lugar «sede» con su propio nombre (con su lugar: «Nombre, lugar») para elegirlo al crear eventos;
--    si se cambia el nombre o el lugar de la parroquia, la sede se renombra sola.
-- Requiere 20261107 (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.

-- ---------- 1. Oficina sin personas registradas ----------------------------------------------------------------
create or replace function trg_eventos_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_interno boolean := coalesce(current_setting('agenda.interno', true), '') = '1';
  v_con_personas boolean := false;
begin
  new.updated_at := clock_timestamp();
  if mi_rol() = 'secretaria' then
    v_con_personas := exists (select 1 from secretarias where parroquia_id = new.parroquia_id and activo);
  end if;
  if tg_op = 'INSERT' then
    if new.misa_fija_id is null then
      new.creado_por := coalesce(auth.uid(), new.creado_por);
      if v_con_personas and new.secretaria_id is null then
        raise exception 'Falta identificarse con el PIN de la Oficina.';
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
        if v_con_personas then
          if new.editado_por_secretaria_id is null then
            raise exception 'Falta identificarse con el PIN de la Oficina.';
          end if;
        else
          new.editado_por_secretaria_id := null;   -- sin personas registradas: firma la cuenta
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
    raise exception 'La persona de la Oficina no es válida.';
  end if;
  if new.editado_por_secretaria_id is not null and (tg_op = 'INSERT' or new.editado_por_secretaria_id is distinct from old.editado_por_secretaria_id)
     and not exists (select 1 from secretarias where id = new.editado_por_secretaria_id and parroquia_id = new.parroquia_id and activo) then
    raise exception 'La persona de la Oficina no es válida.';
  end if;
  return new;
end $$;

-- ---------- 2. El lugar «sede» de cada parroquia ---------------------------------------------------------------
alter table lugares add column es_sede boolean not null default false;
create unique index lugares_sede_uq on lugares (parroquia_id) where es_sede;

-- «Nombre, lugar» (o solo el nombre si no tiene lugar).
create function nombre_completo_parroquia(p_nombre text, p_lugar text) returns text
language sql immutable as $$
  select btrim(p_nombre) || case when btrim(coalesce(p_lugar, '')) <> '' then ', ' || btrim(p_lugar) else '' end
$$;

-- A las parroquias que ya existen: si ya tienen un lugar con ese nombre, es la sede; si no, se crea.
do $$
declare q parroquias; v uuid;
begin
  for q in select * from parroquias loop
    select id into v from lugares
     where parroquia_id = q.id and lower(btrim(nombre)) = lower(nombre_completo_parroquia(q.nombre, q.lugar))
     order by created_at limit 1;
    if v is not null then
      update lugares set es_sede = true where id = v;
    else
      insert into lugares (parroquia_id, nombre, tipo, es_sede)
      values (q.id, nombre_completo_parroquia(q.nombre, q.lugar), 'templo', true);
    end if;
  end loop;
end $$;

-- A las nuevas, al crearlas; y si cambia su nombre o su lugar, la sede se renombra.
create function trg_parroquia_sede() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into lugares (parroquia_id, nombre, tipo, es_sede)
    values (new.id, nombre_completo_parroquia(new.nombre, new.lugar), 'templo', true);
  else
    update lugares set nombre = nombre_completo_parroquia(new.nombre, new.lugar)
     where parroquia_id = new.id and es_sede and nombre is distinct from nombre_completo_parroquia(new.nombre, new.lugar);
  end if;
  return null;
end $$;
create trigger parroquias_sede after insert or update of nombre, lugar on parroquias
  for each row execute function trg_parroquia_sede();
