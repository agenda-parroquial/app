-- El lugar de la parroquia ya no es obligatorio al crearla (la app ya no lo pide; el nombre basta).
-- Requiere 20261108 (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.

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
  if btrim(coalesce(p_email, '')) = '' then raise exception 'Escribe el correo del párroco.'; end if;
  insert into parroquias (nombre, lugar, zona_horaria, vigente_hasta)
  values (btrim(p_nombre), btrim(coalesce(p_lugar, '')), v_zona, p_vigente_hasta)
  returning id into v_id;
  insert into invitaciones (parroquia_id, email, nombre, rol, es_obispo)
  values (v_id, p_email, btrim(coalesce(p_nombre_parroco, '')), 'parroco', coalesce(p_es_obispo, false))
  returning codigo into v_codigo;
  return jsonb_build_object('parroquia_id', v_id, 'codigo', v_codigo);
end $$;
