-- 1) Las parroquias llevan «lugar» (hay parroquias con el mismo nombre en lugares distintos) y ya no se pide la zona horaria
--    al crearlas: la nueva toma la de la última parroquia creada (o la de México si es la primera).
-- 2) Cada parroquia decide qué tipos de evento de siempre (misa, bautizo…) llevan intenciones.
-- Requiere 20261104 (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.

alter table parroquias add column lugar text not null default '';
alter table parroquias add column intenciones_tipos jsonb not null default '{}'::jsonb;   -- {'confesion': true, 'misa': false…}; lo que falta usa el valor de origen (solo la misa lleva)

create function guardar_intenciones_tipos(p_valores jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  if mi_rol() is null or mi_rol() not in ('parroco', 'secretaria') then raise exception 'No autorizado'; end if;
  if jsonb_typeof(p_valores) is distinct from 'object' then raise exception 'Valores no válidos.'; end if;
  for k, v in select key, value from jsonb_each(p_valores) loop
    if k not in ('misa', 'bautizo', 'boda', 'confesion', 'uncion', 'reunion') then raise exception 'Tipo no válido: %', k; end if;
    if jsonb_typeof(v) is distinct from 'boolean' then raise exception 'El valor de "%" no es válido.', k; end if;
  end loop;
  update parroquias set intenciones_tipos = p_valores where id = mi_parroquia();
end $$;
revoke all on function guardar_intenciones_tipos(jsonb) from public, anon;
grant execute on function guardar_intenciones_tipos(jsonb) to authenticated;

-- Crear parroquia (+ invitación de su primer párroco, que puede ser el obispo): con lugar y sin zona horaria.
drop function crear_parroquia(text, text, text, text, date, boolean);
create function crear_parroquia(
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
revoke all on function crear_parroquia(text, text, text, text, date, boolean) from public, anon;
grant execute on function crear_parroquia(text, text, text, text, date, boolean) to authenticated;

-- Editar: nombre, lugar, zona o suspender / reactivar (los parámetros vacíos no cambian nada).
drop function editar_parroquia(uuid, text, boolean, text);
create function editar_parroquia(
  p_id uuid, p_nombre text default null, p_activa boolean default null, p_zona text default null, p_lugar text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  if p_zona is not null then perform now() at time zone p_zona; end if;
  update parroquias
     set nombre       = coalesce(nullif(btrim(p_nombre), ''), nombre),
         lugar        = coalesce(btrim(p_lugar), lugar),
         activa       = coalesce(p_activa, activa),
         zona_horaria = coalesce(nullif(btrim(p_zona), ''), zona_horaria)
   where id = p_id;
end $$;
revoke all on function editar_parroquia(uuid, text, boolean, text, text) from public, anon;
grant execute on function editar_parroquia(uuid, text, boolean, text, text) to authenticated;

-- El panel muestra el lugar.
create or replace function listar_parroquias() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  return coalesce((
    select jsonb_agg(t.x order by t.x ->> 'nombre', t.x ->> 'lugar')
      from (
        select jsonb_build_object(
          'id', q.id, 'nombre', q.nombre, 'lugar', q.lugar, 'zona_horaria', q.zona_horaria,
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
