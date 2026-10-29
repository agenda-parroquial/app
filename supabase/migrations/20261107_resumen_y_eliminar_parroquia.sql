-- Panel de Creador: el listado de parroquias trae también cuántos eventos y lugares tiene cada una, y el Creador puede
-- eliminar una parroquia con todo lo que tiene (la app pide escribir su nombre para confirmar).
-- Requiere 20261106 (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.

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
          'eventos',    (select count(*) from eventos e where e.parroquia_id = q.id),
          'eventos_proximos', (select count(*) from eventos e where e.parroquia_id = q.id and e.inicio >= now() and e.estado <> 'cancelado'),
          'lugares',    (select count(*) from lugares l where l.parroquia_id = q.id),
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

-- Elimina una parroquia con todo lo suyo: eventos, intenciones, lugares, misas fijas, ministros, secretaría, tipos, avisos,
-- invitaciones y las cuentas de sus usuarios. Solo el Creador, y hay que escribir el nombre de la parroquia («Nombre, lugar»).
create function eliminar_parroquia(p_id uuid, p_confirmacion text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q      parroquias;
  v_ids  uuid[];
  v_res  jsonb;
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  select * into q from parroquias where id = p_id;
  if not found then raise exception 'La parroquia no existe.'; end if;
  if lower(btrim(coalesce(p_confirmacion, ''))) <> lower(btrim(q.nombre || case when btrim(q.lugar) <> '' then ', ' || btrim(q.lugar) else '' end)) then
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
revoke all on function eliminar_parroquia(uuid, text) from public, anon;
grant execute on function eliminar_parroquia(uuid, text) to authenticated;
