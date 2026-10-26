-- Ajustes: tipos de evento personalizados, avisos parroquiales, invitaciones de usuarios
-- y quién creó cada evento.
-- Para proyectos que ya ejecutaron las migraciones anteriores.
-- Pegar completo en: Supabase -> SQL Editor -> Run.

-- 1. Tipo de evento escrito a mano (cuando el tipo es "otro") -------------
alter table eventos add column tipo_texto text;

create or replace function describir_evento(e eventos) returns text
language sql stable set search_path = public as $$
  select coalesce(nullif(e.titulo, ''), nullif(e.tipo_texto, ''), initcap(e.tipo::text)) || ' '
    || to_char(e.inicio at time zone (select valor from config where clave = 'zona_horaria'), 'DD/MM HH24:MI')
    || ' · ' || coalesce((select nombre from lugares where id = e.lugar_id), e.lugar_texto, '')
$$;

-- 2. Alta de usuario con invitación -----------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  primero    boolean;
  v_codigo   text;
  v_inv_id   uuid;
  v_inv_rol  rol_usuario;
  v_inv_nom  text;
begin
  select not exists (select 1 from perfiles) into primero;
  v_codigo := upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'codigo', ''), '[^A-Za-z0-9]', '', 'g'));
  if v_codigo <> '' and not primero then
    -- (variables sueltas y no el tipo de fila: la tabla invitaciones se crea más abajo)
    select id, rol, nombre into v_inv_id, v_inv_rol, v_inv_nom from invitaciones
     where activa and usada_por is null and email = lower(new.email) and codigo = v_codigo
     for update;
  end if;
  insert into perfiles (id, email, nombre, rol, activo)
  values (
    new.id, new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), v_inv_nom, ''),
    case when primero then 'parroco' when v_inv_id is not null then v_inv_rol else 'secretaria' end::rol_usuario,
    primero or v_inv_id is not null
  );
  if v_inv_id is not null then
    update invitaciones set usada_por = new.id, usada_en = now() where id = v_inv_id;
  end if;
  return new;
end $$;

-- =====================================================================
--  Tipos de evento personalizados, avisos parroquiales e invitaciones
-- =====================================================================

-- ---------- Tipos de evento que la parroquia crea ("Otro" → guardar) ----
create table tipos_evento (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (btrim(nombre) <> ''),
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tipos_evento_nombre_uq on tipos_evento (lower(btrim(nombre)));
create index tipos_evento_updated_idx on tipos_evento (updated_at);
create trigger tipos_evento_updated before update on tipos_evento
  for each row execute function set_updated_at();
alter table tipos_evento enable row level security;
create policy tipos_leer   on tipos_evento for select using (es_activo());
create policy tipos_crear  on tipos_evento for insert with check (es_activo());
create policy tipos_editar on tipos_evento for update using (mi_rol() in ('parroco', 'secretaria'));

-- ---------- Avisos parroquiales (los anuncios que se leen en misa) -------
create table avisos_parroquiales (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null check (btrim(titulo) <> ''),
  texto      text not null default '',
  desde      date not null default current_date,   -- primer día que se muestra
  hasta      date,                                 -- último día (vacío = sin fecha de fin)
  notificar  boolean not null default true,        -- avisar a todos al crearlo
  activo     boolean not null default true,        -- false = quitado
  creado_por uuid references perfiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hasta is null or hasta >= desde)
);
create index avisos_parroquiales_updated_idx on avisos_parroquiales (updated_at);
create trigger avisos_parroquiales_updated before update on avisos_parroquiales
  for each row execute function set_updated_at();
alter table avisos_parroquiales enable row level security;
create policy avisos_leer   on avisos_parroquiales for select using (es_activo());
create policy avisos_crear  on avisos_parroquiales for insert with check (mi_rol() in ('parroco', 'secretaria'));
create policy avisos_editar on avisos_parroquiales for update using (mi_rol() in ('parroco', 'secretaria'));

create function trg_aviso_parroquial_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.notificar and new.activo then
    perform notificar_a_otros(new.creado_por, 'aviso_parroquial', null, null, 'Aviso parroquial: ' || new.titulo);
  end if;
  return null;
end $$;
create trigger avisos_parroquiales_nuevo after insert on avisos_parroquiales
  for each row execute function trg_aviso_parroquial_nuevo();

alter publication supabase_realtime add table tipos_evento, avisos_parroquiales;

-- ---------- Invitaciones: el párroco "crea" usuarios con nombre, correo y rol --
-- La persona se registra con ese correo y el código y entra ya aprobada,
-- eligiendo su propia contraseña. Sin el código, el registro sigue siendo
-- por aprobación manual.
create table invitaciones (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  nombre     text not null default '',
  rol        rol_usuario not null,
  codigo     text not null unique,
  activa     boolean not null default true,
  creada_por uuid references perfiles (id) default auth.uid(),
  usada_por  uuid references perfiles (id) on delete set null,
  usada_en   timestamptz,
  created_at timestamptz not null default now()
);
create unique index invitaciones_email_pendiente_uq on invitaciones (email) where activa and usada_por is null;

create function trg_invitacion_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(btrim(new.email));
  if exists (select 1 from perfiles where lower(email) = new.email) then
    raise exception 'Ese correo ya tiene cuenta. Apruébalo en la lista de usuarios.';
  end if;
  if coalesce(new.codigo, '') = '' then
    new.codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  return new;
end $$;
create trigger invitaciones_antes before insert on invitaciones
  for each row execute function trg_invitacion_antes();

alter table invitaciones enable row level security;
create policy inv_leer   on invitaciones for select using (mi_rol() = 'parroco');
create policy inv_crear  on invitaciones for insert with check (mi_rol() = 'parroco');
create policy inv_editar on invitaciones for update using (mi_rol() = 'parroco');

-- Para avisar, antes de registrarse, si el código no corresponde al correo.
create function validar_invitacion(p_email text, p_codigo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from invitaciones
     where activa and usada_por is null
       and email = lower(btrim(p_email))
       and codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')))
$$;
revoke all on function validar_invitacion(text, text) from public;
grant execute on function validar_invitacion(text, text) to anon, authenticated;

-- Cada quien pone su propio nombre (el que aparece como "creado por").
create function actualizar_mi_nombre(p_nombre text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  update perfiles set nombre = btrim(p_nombre) where id = auth.uid();
end $$;
revoke all on function actualizar_mi_nombre(text) from public, anon;
grant execute on function actualizar_mi_nombre(text) to authenticated;
