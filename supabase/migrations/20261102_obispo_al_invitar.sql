-- El creador (superadmin) puede crear al obispo desde donde crea parroquias y párrocos:
-- una invitación marcada «es obispo» y, al registrarse, esa persona queda también con permiso
-- de publicar eventos diocesanos. Por lo demás es una cuenta normal (párroco) de su parroquia.
-- Requiere 20261101_calendario_avisos_ministros.sql (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.

alter table invitaciones add column es_obispo boolean not null default false;

-- Solo el creador puede marcar una invitación como de obispo (un párroco no puede darse ese permiso).
create or replace function trg_invitacion_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(btrim(new.email));
  if tg_op = 'INSERT' and exists (select 1 from perfiles where lower(email) = new.email) then
    raise exception 'Ese correo ya tiene cuenta. Apruébalo en la lista de usuarios.';
  end if;
  if new.es_obispo and (tg_op = 'INSERT' or new.es_obispo is distinct from old.es_obispo) and not soy_superadmin() then
    raise exception 'No autorizado';
  end if;
  if coalesce(new.codigo, '') = '' then
    new.codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  return new;
end $$;

drop trigger invitaciones_antes on invitaciones;
create trigger invitaciones_antes before insert or update on invitaciones
  for each row execute function trg_invitacion_antes();

-- Al registrarse con una invitación de obispo, queda con permiso de publicar eventos diocesanos.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_codigo   text;
  v_inv_id   uuid;
  v_inv_rol  rol_usuario;
  v_inv_nom  text;
  v_inv_parr uuid;
  v_inv_obis boolean;
begin
  v_codigo := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'codigo', ''), '[^A-Za-z0-9]', '', 'g'));
  if v_codigo <> '' then
    select i.id, i.rol, i.nombre, i.parroquia_id, i.es_obispo into v_inv_id, v_inv_rol, v_inv_nom, v_inv_parr, v_inv_obis
      from invitaciones i join parroquias q on q.id = i.parroquia_id
     where i.activa and i.usada_por is null and parroquia_al_dia(q.id)
       and i.email = lower(new.email) and i.codigo = v_codigo
     for update of i;
  end if;

  if v_inv_id is null then
    if exists (select 1 from superadmins) or exists (select 1 from parroquias) then
      raise exception 'Se necesita una invitación válida para crear una cuenta.';
    end if;
    -- Instalación nueva: el primero es el superadmin (sin parroquia todavía).
    insert into perfiles (id, email, nombre, rol, activo, parroquia_id)
    values (new.id, new.email, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), ''), 'parroco', true, null);
    insert into superadmins (id) values (new.id);
    return new;
  end if;

  insert into perfiles (id, email, nombre, rol, activo, parroquia_id)
  values (
    new.id, new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), v_inv_nom, ''),
    v_inv_rol, true, v_inv_parr
  );
  if v_inv_obis then insert into obispos (id) values (new.id) on conflict do nothing; end if;
  update invitaciones set usada_por = new.id, usada_en = now() where id = v_inv_id;
  return new;
end $$;

-- Crear parroquia + invitación de su primer párroco, que puede ser el obispo.
drop function crear_parroquia(text, text, text, text, date);
create function crear_parroquia(
  p_nombre text, p_zona text, p_email text, p_nombre_parroco text default '', p_vigente_hasta date default null,
  p_es_obispo boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_codigo text;
  v_zona   text := coalesce(nullif(btrim(p_zona), ''), 'America/Mexico_City');
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe el nombre de la parroquia.'; end if;
  if btrim(coalesce(p_email, '')) = '' then raise exception 'Escribe el correo del párroco.'; end if;
  perform now() at time zone v_zona;   -- falla si la zona horaria no existe
  insert into parroquias (nombre, zona_horaria, vigente_hasta) values (btrim(p_nombre), v_zona, p_vigente_hasta)
  returning id into v_id;
  insert into invitaciones (parroquia_id, email, nombre, rol, es_obispo)
  values (v_id, p_email, btrim(coalesce(p_nombre_parroco, '')), 'parroco', coalesce(p_es_obispo, false))
  returning codigo into v_codigo;
  return jsonb_build_object('parroquia_id', v_id, 'codigo', v_codigo);
end $$;
revoke all on function crear_parroquia(text, text, text, text, date, boolean) from public, anon;
grant execute on function crear_parroquia(text, text, text, text, date, boolean) to authenticated;

-- Invitar a otro párroco (o al obispo) a una parroquia que ya existe.
drop function invitar_parroco(uuid, text, text);
create function invitar_parroco(p_parroquia uuid, p_email text, p_nombre text default '', p_es_obispo boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  if not exists (select 1 from parroquias where id = p_parroquia) then raise exception 'La parroquia no existe.'; end if;
  insert into invitaciones (parroquia_id, email, nombre, rol, es_obispo)
  values (p_parroquia, p_email, btrim(coalesce(p_nombre, '')), 'parroco', coalesce(p_es_obispo, false))
  returning codigo into v_codigo;
  return v_codigo;
end $$;
revoke all on function invitar_parroco(uuid, text, text, boolean) from public, anon;
grant execute on function invitar_parroco(uuid, text, text, boolean) to authenticated;

-- El panel muestra quién es obispo y qué invitaciones son de obispo.
create or replace function listar_parroquias() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  return coalesce((
    select jsonb_agg(t.x order by t.x ->> 'nombre')
      from (
        select jsonb_build_object(
          'id', q.id, 'nombre', q.nombre, 'zona_horaria', q.zona_horaria,
          'activa', q.activa, 'vigente_hasta', q.vigente_hasta, 'created_at', q.created_at,
          'usuarios',   (select count(*) from perfiles p where p.parroquia_id = q.id and p.activo),
          'pendientes', (select count(*) from perfiles p where p.parroquia_id = q.id and not p.activo),
          'parrocos', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'nombre', p.nombre, 'email', p.email,
                                 'obispo', exists (select 1 from obispos o where o.id = p.id))), '[]'::jsonb)
                         from perfiles p where p.parroquia_id = q.id and p.rol = 'parroco' and p.activo),
          'invitaciones', (select coalesce(jsonb_agg(jsonb_build_object(
                               'id', i.id, 'email', i.email, 'nombre', i.nombre, 'codigo', i.codigo,
                               'obispo', i.es_obispo)), '[]'::jsonb)
                             from invitaciones i
                            where i.parroquia_id = q.id and i.rol = 'parroco' and i.activa and i.usada_por is null)
        ) as x
        from parroquias q
      ) t), '[]'::jsonb);
end $$;
