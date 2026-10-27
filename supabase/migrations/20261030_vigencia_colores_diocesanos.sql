-- Vigencia automática de cada parroquia, colores por tipo de evento y eventos diocesanos.
-- Requiere haber ejecutado antes 20261029_multi_parroquia.sql (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.
--
-- Qué hace con una base ya en uso:
--   * las parroquias que ya existen quedan SIN límite de fecha (no pierden acceso);
--   * nada cambia para los usuarios hasta que el superadmin fije una fecha de vigencia.

-- =====================================================================
--  1. Vigencia automática
--     vigente_hasta = último día con acceso (en la zona horaria de la parroquia);
--     vacío = sin límite. Al pasar esa fecha la parroquia se comporta como suspendida,
--     sin ninguna tarea programada: la fecha se compara en cada consulta.
-- =====================================================================
alter table parroquias add column vigente_hasta date;
-- Colores por tipo de evento: { "misa": "#aabbcc", "t:retiro": "#112233", ... }
alter table parroquias add column colores jsonb not null default '{}'::jsonb
  check (jsonb_typeof(colores) = 'object');
update parroquias set colores = colores;   -- sube updated_at: los teléfonos reciben las columnas nuevas

create function parroquia_al_dia(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select q.activa and (q.vigente_hasta is null or q.vigente_hasta >= (now() at time zone q.zona_horaria)::date)
      from parroquias q where q.id = p_id), false)
$$;
revoke all on function parroquia_al_dia(uuid) from public, anon, authenticated;

-- La parroquia del usuario, solo si su cuenta está activa y la parroquia está activa y vigente.
create or replace function mi_parroquia() returns uuid
language sql stable security definer set search_path = public as $$
  select p.parroquia_id
    from perfiles p
   where p.id = auth.uid() and p.activo and parroquia_al_dia(p.parroquia_id)
$$;

-- Nadie crea cuenta en una parroquia suspendida o vencida.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_codigo   text;
  v_inv_id   uuid;
  v_inv_rol  rol_usuario;
  v_inv_nom  text;
  v_inv_parr uuid;
begin
  v_codigo := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'codigo', ''), '[^A-Za-z0-9]', '', 'g'));
  if v_codigo <> '' then
    select i.id, i.rol, i.nombre, i.parroquia_id into v_inv_id, v_inv_rol, v_inv_nom, v_inv_parr
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
  update invitaciones set usada_por = new.id, usada_en = now() where id = v_inv_id;
  return new;
end $$;

create or replace function validar_invitacion(p_email text, p_codigo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from invitaciones i join parroquias q on q.id = i.parroquia_id
     where i.activa and i.usada_por is null and parroquia_al_dia(q.id)
       and i.email = lower(btrim(p_email))
       and i.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')))
$$;

-- =====================================================================
--  2. Panel del superadmin: vigencia
-- =====================================================================
-- Fija el último día de acceso; null = sin límite.
create function fijar_vigencia(p_id uuid, p_hasta date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  update parroquias set vigente_hasta = p_hasta where id = p_id;
  if not found then raise exception 'La parroquia no existe.'; end if;
end $$;
revoke all on function fijar_vigencia(uuid, date) from public, anon;
grant execute on function fijar_vigencia(uuid, date) to authenticated;

-- crear_parroquia ahora también recibe la fecha de vigencia (vacía = sin límite).
drop function crear_parroquia(text, text, text, text);
create function crear_parroquia(
  p_nombre text, p_zona text, p_email text, p_nombre_parroco text default '', p_vigente_hasta date default null
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
  insert into invitaciones (parroquia_id, email, nombre, rol)
  values (v_id, p_email, btrim(coalesce(p_nombre_parroco, '')), 'parroco')
  returning codigo into v_codigo;
  return jsonb_build_object('parroquia_id', v_id, 'codigo', v_codigo);
end $$;
revoke all on function crear_parroquia(text, text, text, text, date) from public, anon;
grant execute on function crear_parroquia(text, text, text, text, date) to authenticated;

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
          'parrocos', (select coalesce(jsonb_agg(jsonb_build_object('nombre', p.nombre, 'email', p.email)), '[]'::jsonb)
                         from perfiles p where p.parroquia_id = q.id and p.rol = 'parroco' and p.activo),
          'invitaciones', (select coalesce(jsonb_agg(jsonb_build_object(
                               'id', i.id, 'email', i.email, 'nombre', i.nombre, 'codigo', i.codigo)), '[]'::jsonb)
                             from invitaciones i
                            where i.parroquia_id = q.id and i.rol = 'parroco' and i.activa and i.usada_por is null)
        ) as x
        from parroquias q
      ) t), '[]'::jsonb);
end $$;

-- =====================================================================
--  3. Colores por tipo de evento (los comparte toda la parroquia)
-- =====================================================================
create function guardar_colores(p_colores jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v text;
begin
  if mi_rol() is null or mi_rol() not in ('parroco', 'secretaria') then raise exception 'No autorizado'; end if;
  if jsonb_typeof(p_colores) is distinct from 'object' then raise exception 'Colores no válidos.'; end if;
  if (select count(*) from jsonb_object_keys(p_colores)) > 100 then raise exception 'Demasiados colores.'; end if;
  for k, v in select key, value from jsonb_each_text(p_colores) loop
    if length(k) > 80 or v !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Color no válido para "%".', k; end if;
  end loop;
  update parroquias set colores = p_colores where id = mi_parroquia();
end $$;
revoke all on function guardar_colores(jsonb) from public, anon;
grant execute on function guardar_colores(jsonb) to authenticated;

-- =====================================================================
--  4. Eventos diocesanos
--     Los sube el superadmin y los ven todas las parroquias activas. Son indicativos:
--     no generan empalmes ni se pueden editar desde las parroquias.
-- =====================================================================
create table eventos_diocesanos (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null check (btrim(titulo) <> ''),
  inicio     timestamptz not null,
  fin        timestamptz not null,
  lugar      text,
  notas      text,
  notificar  boolean not null default false,   -- solo cuenta al crearlo
  activo     boolean not null default true,    -- false = quitado
  creado_por uuid references perfiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin > inicio)
);
create index eventos_diocesanos_updated_idx on eventos_diocesanos (updated_at, id);
create index eventos_diocesanos_inicio_idx  on eventos_diocesanos (inicio);
create trigger eventos_diocesanos_updated before update on eventos_diocesanos
  for each row execute function set_updated_at();

alter table eventos_diocesanos enable row level security;
create policy diocesanos_leer on eventos_diocesanos for select to authenticated
  using (es_activo() or soy_superadmin());
create policy diocesanos_crear on eventos_diocesanos for insert to authenticated
  with check (soy_superadmin());
create policy diocesanos_editar on eventos_diocesanos for update to authenticated
  using (soy_superadmin()) with check (soy_superadmin());

-- Aviso opcional a todos los usuarios de las parroquias con acceso (cada uno con la hora de su parroquia).
create function trg_evento_diocesano_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.notificar and new.activo then
    insert into notificaciones (usuario_id, tipo, mensaje)
    select p.id, 'evento_diocesano',
           'Diocesano: ' || new.titulo || ' · ' || to_char(new.inicio at time zone q.zona_horaria, 'DD/MM HH24:MI')
      from perfiles p join parroquias q on q.id = p.parroquia_id
     where p.activo and parroquia_al_dia(q.id) and p.id is distinct from new.creado_por;
  end if;
  return null;
end $$;
create trigger eventos_diocesanos_nuevo after insert on eventos_diocesanos
  for each row execute function trg_evento_diocesano_nuevo();

alter publication supabase_realtime add table eventos_diocesanos;
