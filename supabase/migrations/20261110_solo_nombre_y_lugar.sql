-- En pantalla la parroquia se muestra solo con su nombre; el «lugar» sigue existiendo (se pide al crearla y se edita en
-- Parroquias) únicamente para distinguir parroquias con el mismo nombre. Así:
--  · la sede (el lugar con el nombre de la parroquia) se llama solo como la parroquia;
--  · al eliminar una parroquia se escribe solo su nombre;
--  · el lugar vuelve a ser obligatorio al crear una parroquia.
-- Requiere 20261109 (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.

create or replace function nombre_completo_parroquia(p_nombre text, p_lugar text) returns text
language sql immutable as $$
  select btrim(p_nombre)
$$;

-- Las sedes que ya existen toman solo el nombre.
update lugares l set nombre = btrim(q.nombre)
  from parroquias q
 where l.es_sede and l.parroquia_id = q.id and l.nombre is distinct from btrim(q.nombre);

create or replace function crear_parroquia(
  p_nombre text, p_lugar text, p_email text, p_nombre_parroco text default '', p_vigente_hasta date default null,
  p_es_obispo boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_codigo text;
  v_zona   text := coalesce((select zona_horaria from parroquias order by created_at desc limit 1), 'America/Mexico_City');
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe el nombre de la parroquia.'; end if;
  if btrim(coalesce(p_lugar, '')) = '' then raise exception 'Escribe el lugar de la parroquia.'; end if;
  if btrim(coalesce(p_email, '')) = '' then raise exception 'Escribe el correo del párroco.'; end if;
  insert into parroquias (nombre, lugar, zona_horaria, vigente_hasta)
  values (btrim(p_nombre), btrim(p_lugar), v_zona, p_vigente_hasta)
  returning id into v_id;
  insert into invitaciones (parroquia_id, email, nombre, rol, es_obispo)
  values (v_id, p_email, btrim(coalesce(p_nombre_parroco, '')), 'parroco', coalesce(p_es_obispo, false))
  returning codigo into v_codigo;
  return jsonb_build_object('parroquia_id', v_id, 'codigo', v_codigo);
end $$;

-- Eliminar: ahora se confirma escribiendo solo el nombre de la parroquia.
create or replace function eliminar_parroquia(p_id uuid, p_confirmacion text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q      parroquias;
  v_ids  uuid[];
  v_res  jsonb;
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  select * into q from parroquias where id = p_id;
  if not found then raise exception 'La parroquia no existe.'; end if;
  if lower(btrim(coalesce(p_confirmacion, ''))) <> lower(btrim(q.nombre)) then
    raise exception 'El nombre escrito no coincide con el de la parroquia.';
  end if;
  select coalesce(array_agg(id), '{}') into v_ids from perfiles where parroquia_id = p_id;
  if exists (select 1 from superadmins where id = any(v_ids)) then raise exception 'La cuenta de Creador no puede pertenecer a una parroquia.'; end if;

  v_res := jsonb_build_object(
    'eventos', (select count(*) from eventos where parroquia_id = p_id),
    'usuarios', coalesce(array_length(v_ids, 1), 0),
    'lugares', (select count(*) from lugares where parroquia_id = p_id));

  -- Sin avisos push al borrar los eventos: antes de nada, esos teléfonos dejan de estar suscritos.
  delete from push_suscripciones where usuario_id = any(v_ids);
  delete from invitaciones        where parroquia_id = p_id;
  delete from conflictos          where parroquia_id = p_id;   -- antes que los eventos, para que su trigger no toque a los que se borran a la vez
  delete from eventos             where parroquia_id = p_id;   -- también conflictos, intenciones y avisos de esos eventos
  delete from misas_fijas         where parroquia_id = p_id;
  delete from lugares             where parroquia_id = p_id;
  delete from ministros           where parroquia_id = p_id;
  delete from secretarias         where parroquia_id = p_id;   -- y sus PIN
  delete from tipos_evento        where parroquia_id = p_id;
  delete from avisos_parroquiales where parroquia_id = p_id;
  delete from notificaciones      where usuario_id = any(v_ids);
  delete from auth.users          where id = any(v_ids);       -- sus cuentas (y sus perfiles)
  delete from parroquias          where id = p_id;
  return v_res;
end $$;
