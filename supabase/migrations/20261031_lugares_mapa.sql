-- Mapa de lugares: coordenadas válidas y alta de lugares de una parroquia por el superadmin.
-- Requiere 20261029_multi_parroquia.sql (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.
--
-- Un lugar que el superadmin crea para una parroquia es un lugar normal de esa parroquia:
-- aparece en su lista de lugares y en su mapa, y ella puede editarlo como los demás.
-- El superadmin solo ve y gestiona los lugares (no son datos de agenda); no ve eventos ni intenciones.

-- Las coordenadas van las dos o ninguna, y dentro del rango del planeta.
alter table lugares add constraint lugares_coordenadas_ok check (
  (lat is null) = (lng is null)
  and (lat is null or (lat between -90 and 90 and lng between -180 and 180))
);

-- Lugares de una parroquia (para el panel del superadmin).
create function listar_lugares_parroquia(p_parroquia uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'nombre', l.nombre, 'tipo', l.tipo, 'direccion', l.direccion,
             'lat', l.lat, 'lng', l.lng, 'activo', l.activo) order by l.nombre)
      from lugares l where l.parroquia_id = p_parroquia), '[]'::jsonb);
end $$;

-- Crea (p_id vacío) o edita un lugar de la parroquia indicada. Devuelve su id.
create function guardar_lugar_parroquia(
  p_parroquia uuid, p_id uuid, p_nombre text, p_tipo tipo_lugar, p_direccion text,
  p_lat double precision, p_lng double precision, p_activo boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  if not exists (select 1 from parroquias where id = p_parroquia) then raise exception 'La parroquia no existe.'; end if;
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe el nombre del lugar.'; end if;
  if p_id is null then
    insert into lugares (parroquia_id, nombre, tipo, direccion, lat, lng, activo)
    values (p_parroquia, btrim(p_nombre), p_tipo, nullif(btrim(coalesce(p_direccion, '')), ''), p_lat, p_lng, coalesce(p_activo, true))
    returning id into v_id;
  else
    update lugares
       set nombre = btrim(p_nombre), tipo = p_tipo, direccion = nullif(btrim(coalesce(p_direccion, '')), ''),
           lat = p_lat, lng = p_lng, activo = coalesce(p_activo, activo)
     where id = p_id and parroquia_id = p_parroquia
    returning id into v_id;
    if v_id is null then raise exception 'Ese lugar no pertenece a esa parroquia.'; end if;
  end if;
  return v_id;
end $$;

revoke all on function listar_lugares_parroquia(uuid) from public, anon;
revoke all on function guardar_lugar_parroquia(uuid, uuid, text, tipo_lugar, text, double precision, double precision, boolean) from public, anon;
grant execute on function listar_lugares_parroquia(uuid) to authenticated;
grant execute on function guardar_lugar_parroquia(uuid, uuid, text, tipo_lugar, text, double precision, double precision, boolean) to authenticated;
