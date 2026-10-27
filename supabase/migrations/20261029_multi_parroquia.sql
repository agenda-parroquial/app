-- Multi-parroquia: varias parroquias en un mismo proyecto, cada una aislada de las demás,
-- y un superadmin que decide quién entra.
-- Para proyectos que ya ejecutaron las migraciones anteriores (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.
--
-- Qué hace con una base ya en uso:
--   * crea la "Parroquia principal" y le asigna TODOS los datos y usuarios actuales;
--   * convierte en superadmin al primer párroco activo (tú). Puedes cambiarlo después
--     con:  insert into superadmins (id) values ('<id del usuario>');
--   * desde ahora nadie puede crear una cuenta sin invitación.

-- =====================================================================
--  1. Tablas nuevas
-- =====================================================================
create table parroquias (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null check (btrim(nombre) <> ''),
  zona_horaria text not null default 'America/Mexico_City',
  activa       boolean not null default true,   -- false = suspendida (nadie de ella entra)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index parroquias_updated_idx on parroquias (updated_at);
create trigger parroquias_updated before update on parroquias
  for each row execute function set_updated_at();

-- Superadmins: quienes crean parroquias y dan acceso a los párrocos.
-- Sin políticas ni permisos: solo la leen las funciones del servidor.
create table superadmins (
  id         uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table superadmins enable row level security;
revoke all on superadmins from anon, authenticated;

-- =====================================================================
--  2. Cada dato pertenece a una parroquia
--     (con una base en uso, todo lo existente pasa a la "Parroquia principal";
--      se agrega la columna con valor fijo, así no se disparan los triggers
--      ni cambian las fechas de actualización)
-- =====================================================================
do $$
declare
  p uuid;
  t text;
begin
  if exists (select 1 from perfiles) then
    insert into parroquias (nombre, zona_horaria)
    values ('Parroquia principal',
            coalesce((select valor from config where clave = 'zona_horaria'), 'America/Mexico_City'))
    returning id into p;
  end if;

  foreach t in array array[
    'lugares', 'misas_fijas', 'eventos', 'conflictos', 'intenciones',
    'tipos_evento', 'avisos_parroquiales', 'invitaciones'
  ] loop
    if p is not null then
      execute format('alter table %I add column parroquia_id uuid not null default %L references parroquias (id)', t, p);
      execute format('alter table %I alter column parroquia_id drop default', t);
    else
      execute format('alter table %I add column parroquia_id uuid not null references parroquias (id)', t);
    end if;
  end loop;

  -- Los perfiles sí pueden no tener parroquia (el superadmin puro).
  if p is not null then
    execute format('alter table perfiles add column parroquia_id uuid default %L references parroquias (id)', p);
    execute 'alter table perfiles alter column parroquia_id drop default';
  else
    alter table perfiles add column parroquia_id uuid references parroquias (id);
  end if;
end $$;

-- El primer párroco activo es el superadmin (en una base nueva no hay nadie aún).
insert into superadmins (id)
select id from perfiles where rol = 'parroco' and activo order by created_at limit 1;

-- =====================================================================
--  3. Funciones auxiliares
-- =====================================================================
-- La parroquia del usuario, solo si su cuenta está activa y la parroquia no está suspendida.
create function mi_parroquia() returns uuid
language sql stable security definer set search_path = public as $$
  select p.parroquia_id
    from perfiles p join parroquias q on q.id = p.parroquia_id
   where p.id = auth.uid() and p.activo and q.activa
$$;

create or replace function es_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select mi_parroquia() is not null
$$;

create or replace function mi_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo and mi_parroquia() is not null
$$;

create function soy_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from superadmins where id = auth.uid())
$$;
revoke all on function soy_superadmin() from public, anon;
grant execute on function soy_superadmin() to authenticated;

-- Todo lo nuevo que se inserta queda en la parroquia de quien lo crea.
alter table lugares             alter column parroquia_id set default mi_parroquia();
alter table misas_fijas         alter column parroquia_id set default mi_parroquia();
alter table eventos             alter column parroquia_id set default mi_parroquia();
alter table conflictos          alter column parroquia_id set default mi_parroquia();
alter table intenciones         alter column parroquia_id set default mi_parroquia();
alter table tipos_evento        alter column parroquia_id set default mi_parroquia();
alter table avisos_parroquiales alter column parroquia_id set default mi_parroquia();
alter table invitaciones        alter column parroquia_id set default mi_parroquia();

-- Índices para que cada parroquia lea solo lo suyo sin recorrer lo de las demás.
create index perfiles_parroquia_idx            on perfiles (parroquia_id);
create index lugares_parroquia_idx             on lugares (parroquia_id, updated_at, id);
create index misas_fijas_parroquia_idx         on misas_fijas (parroquia_id, updated_at, id);
create index eventos_parroquia_updated_idx     on eventos (parroquia_id, updated_at, id);
create index eventos_parroquia_inicio_idx      on eventos (parroquia_id, inicio);
create index conflictos_parroquia_idx          on conflictos (parroquia_id, updated_at, id);
create index intenciones_parroquia_idx         on intenciones (parroquia_id, updated_at, id);
create index tipos_evento_parroquia_idx        on tipos_evento (parroquia_id, updated_at, id);
create index avisos_parroquiales_parroquia_idx on avisos_parroquiales (parroquia_id, updated_at, id);
create index invitaciones_parroquia_idx        on invitaciones (parroquia_id);

-- El nombre de un tipo de evento solo debe ser único dentro de su parroquia.
drop index tipos_evento_nombre_uq;
create unique index tipos_evento_nombre_uq on tipos_evento (parroquia_id, lower(btrim(nombre)));

-- La zona horaria ahora es de cada parroquia; `config` queda solo para uso interno del servidor.
delete from config where clave = 'zona_horaria';

-- =====================================================================
--  4. Notificaciones, empalmes y misas fijas, por parroquia
-- =====================================================================
create function notificar_a_otros(p_parroquia uuid, p_excluir uuid, p_tipo text, p_evento uuid, p_conflicto uuid, p_mensaje text)
returns void
language sql security definer set search_path = public as $$
  insert into notificaciones (usuario_id, tipo, evento_id, conflicto_id, mensaje)
  select id, p_tipo, p_evento, p_conflicto, p_mensaje
  from perfiles
  where activo and parroquia_id = p_parroquia and id is distinct from p_excluir
$$;
revoke all on function notificar_a_otros(uuid, uuid, text, uuid, uuid, text) from public, anon, authenticated;

create or replace function describir_evento(e eventos) returns text
language sql stable set search_path = public as $$
  select coalesce(nullif(e.titulo, ''), nullif(e.tipo_texto, ''), initcap(e.tipo::text)) || ' '
    || to_char(e.inicio at time zone (select zona_horaria from parroquias where id = e.parroquia_id), 'DD/MM HH24:MI')
    || ' · ' || coalesce((select nombre from lugares where id = e.lugar_id), e.lugar_texto, '')
$$;

create or replace function eventos_traslapan(a eventos, b eventos) returns boolean
language sql immutable as $$
  select a.parroquia_id = b.parroquia_id and a.inicio < b.fin and b.inicio < a.fin and (
    (a.lugar_id is not null and a.lugar_id = b.lugar_id) or
    (a.asignado_a is not null and a.asignado_a = b.asignado_a)
  )
$$;

create or replace function revisar_conflictos(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e      eventos;
  o      eventos;
  v_a    uuid;
  v_b    uuid;
  v_id   uuid;
begin
  select * into e from eventos where id = p_id;
  if not found then return; end if;

  -- Marca "cambio interno": los updates de más abajo no suben versión ni se reprocesan.
  perform set_config('agenda.interno', '1', true);

  -- 1. Cerrar conflictos abiertos que ya no aplican (cancelado o movido)
  update conflictos c
     set estado = 'resuelto',
         resolucion = case when e.estado = 'cancelado' then 'cancelado' else 'movido' end
   where c.estado = 'abierto'
     and p_id in (c.evento_a, c.evento_b)
     and not exists (
       select 1 from eventos x
        where x.id = case when c.evento_a = p_id then c.evento_b else c.evento_a end
          and x.estado <> 'cancelado'
          and e.estado <> 'cancelado'
          and eventos_traslapan(e, x));

  -- 2. Abrir conflictos nuevos (solo contra eventos de la misma parroquia)
  if e.estado <> 'cancelado' then
    for o in
      select x.* from eventos x
       where x.parroquia_id = e.parroquia_id
         and x.inicio < e.fin and x.fin > e.inicio
         and x.id <> p_id and x.estado <> 'cancelado' and eventos_traslapan(e, x)
    loop
      v_a := least(e.id, o.id);
      v_b := greatest(e.id, o.id);
      v_id := null;
      insert into conflictos (evento_a, evento_b, parroquia_id) values (v_a, v_b, e.parroquia_id)
      on conflict (evento_a, evento_b) do update
         set estado = 'abierto', resolucion = null, resuelto_por = null
       where conflictos.estado = 'resuelto' and conflictos.resolucion <> 'coexisten'
      returning id into v_id;

      if v_id is not null then   -- conflicto nuevo (o reabierto): avisar a todos
        perform notificar_a_otros(
          e.parroquia_id, null, 'conflicto', p_id, v_id,
          'Traslape: ' || describir_evento(e) || '  ⟷  ' || describir_evento(o));
      end if;
    end loop;
  end if;

  -- 3. Estado de este evento y de sus contrapartes
  update eventos x
     set estado = case when exists (
           select 1 from conflictos c
            where c.estado = 'abierto' and x.id in (c.evento_a, c.evento_b))
         then 'en_conflicto'::estado_evento else 'confirmado'::estado_evento end
   where x.estado <> 'cancelado'
     and (x.id = p_id or x.id in (
           select case when c.evento_a = p_id then c.evento_b else c.evento_a end
             from conflictos c where p_id in (c.evento_a, c.evento_b)))
     and x.estado is distinct from case when exists (
           select 1 from conflictos c
            where c.estado = 'abierto' and x.id in (c.evento_a, c.evento_b))
         then 'en_conflicto'::estado_evento else 'confirmado'::estado_evento end;

  perform set_config('agenda.interno', '', true);
end $$;
revoke all on function revisar_conflictos(uuid) from public, anon, authenticated;

create or replace function resolver_conflicto(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c conflictos;
begin
  if not es_activo() then raise exception 'No autorizado'; end if;
  update conflictos
     set estado = 'resuelto', resolucion = 'coexisten', resuelto_por = auth.uid()
   where id = p_id and estado = 'abierto' and parroquia_id = mi_parroquia()
  returning * into c;
  if found then
    perform revisar_conflictos(c.evento_a);
    perform revisar_conflictos(c.evento_b);
  end if;
end $$;

create or replace function trg_eventos_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'INSERT' then
    if new.misa_fija_id is null then
      new.creado_por := coalesce(auth.uid(), new.creado_por);
    end if;
  else
    new.modificado_por := coalesce(auth.uid(), new.modificado_por);
    -- Solo las ediciones de un usuario suben la versión; los cambios
    -- automáticos de estado (traslapes) no, para no provocar falsos
    -- choques de edición en los teléfonos. Esos cambios van marcados con
    -- 'agenda.interno' (ver revisar_conflictos).
    if coalesce(current_setting('agenda.interno', true), '') = '1' then
      new.version := old.version;
    else
      new.version := old.version + 1;
    end if;
  end if;
  -- El lugar y el sacerdote asignado deben ser de la misma parroquia que el evento.
  if new.lugar_id is not null and (tg_op = 'INSERT' or new.lugar_id is distinct from old.lugar_id)
     and not exists (select 1 from lugares where id = new.lugar_id and parroquia_id = new.parroquia_id) then
    raise exception 'El lugar no pertenece a esta parroquia';
  end if;
  if new.asignado_a is not null and (tg_op = 'INSERT' or new.asignado_a is distinct from old.asignado_a)
     and not exists (select 1 from perfiles where id = new.asignado_a and parroquia_id = new.parroquia_id) then
    raise exception 'La persona asignada no pertenece a esta parroquia';
  end if;
  return new;
end $$;

create or replace function trg_eventos_despues() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Los cambios de estado que hace el propio recalculo de conflictos no se reprocesan.
  if coalesce(current_setting('agenda.interno', true), '') = '1' then return null; end if;

  if tg_op = 'INSERT' then
    if new.misa_fija_id is null then
      perform notificar_a_otros(new.parroquia_id, new.creado_por, 'evento_nuevo', new.id, null,
                                'Nuevo: ' || describir_evento(new));
    end if;
  elsif (old.inicio, old.fin, old.lugar_id, old.lugar_texto, old.asignado_a, old.intencion, old.estado)
        is distinct from
        (new.inicio, new.fin, new.lugar_id, new.lugar_texto, new.asignado_a, new.intencion, new.estado) then
    perform notificar_a_otros(
      new.parroquia_id,
      new.modificado_por,
      case when new.estado = 'cancelado' then 'evento_cancelado' else 'evento_editado' end,
      new.id, null,
      case when new.estado = 'cancelado' then 'Cancelado: ' else 'Modificado: ' end
        || describir_evento(new));
  end if;

  perform revisar_conflictos(new.id);
  return null;
end $$;

-- Misas fijas → eventos reales, cada parroquia con su zona horaria.
create function _generar_misas_fijas(p_dias int, p_parroquia uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into eventos (parroquia_id, tipo, inicio, fin, lugar_id, asignado_a, intencion, misa_fija_id, fecha_origen)
  select m.parroquia_id, 'misa',
         (d + m.hora) at time zone q.zona_horaria,
         (d + m.hora + make_interval(mins => m.duracion_min)) at time zone q.zona_horaria,
         m.lugar_id, m.asignado_a, m.intencion, m.id, d::date
    from misas_fijas m
    join parroquias q on q.id = m.parroquia_id
   cross join lateral generate_series(
           (now() at time zone q.zona_horaria)::date::timestamp,
           ((now() at time zone q.zona_horaria)::date + p_dias)::timestamp,
           interval '1 day') d
   where m.parroquia_id = p_parroquia and q.activa
     and m.activo and extract(dow from d) = m.dia_semana
     and (m.cada_semanas = 1
          or (d::date >= m.desde and ((d::date - m.desde) / 7) % m.cada_semanas = 0))
  on conflict (misa_fija_id, fecha_origen) where misa_fija_id is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function _generar_misas_fijas(int, uuid) from public, anon, authenticated;

create or replace function generar_misas_fijas(p_dias int default 90) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not es_activo() then raise exception 'No autorizado'; end if;
  return _generar_misas_fijas(least(greatest(p_dias, 1), 365), mi_parroquia());
end $$;

create or replace function trg_misa_fija_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- (las fechas que ya tienen intenciones capturadas tampoco se tocan)
    delete from eventos
     where misa_fija_id = new.id and inicio > now() and version = 1
       and not exists (select 1 from intenciones i where i.evento_id = eventos.id and i.activa);
  end if;
  perform _generar_misas_fijas(90, new.parroquia_id);
  return null;
end $$;

drop function _generar_misas_fijas(int);

create or replace function trg_aviso_parroquial_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.notificar and new.activo then
    perform notificar_a_otros(new.parroquia_id, new.creado_por, 'aviso_parroquial', null, null,
                              'Aviso parroquial: ' || new.titulo);
  end if;
  return null;
end $$;

drop function notificar_a_otros(uuid, text, uuid, uuid, text);

-- Nunca dejar una parroquia sin un párroco activo.
create or replace function proteger_ultimo_parroco() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.rol = 'parroco' and old.activo and (new.rol <> 'parroco' or not new.activo)
     and not exists (select 1 from perfiles
                      where rol = 'parroco' and activo and id <> old.id
                        and parroquia_id is not distinct from old.parroquia_id) then
    raise exception 'Debe existir al menos un párroco activo';
  end if;
  return new;
end $$;

create or replace function puede_editar_intenciones(p_evento uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_activo() and exists (
    select 1 from eventos e
     where e.id = p_evento and e.parroquia_id = mi_parroquia()
       and (mi_rol() = 'secretaria' or e.asignado_a = auth.uid()))
$$;

-- =====================================================================
--  5. Alta de usuarios: solo con invitación
--     (la única excepción: en una instalación totalmente nueva, la primera
--      persona que se registra queda como superadmin)
-- =====================================================================
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
     where i.activa and i.usada_por is null and q.activa
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
     where i.activa and i.usada_por is null and q.activa
       and i.email = lower(btrim(p_email))
       and i.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')))
$$;

-- =====================================================================
--  6. Seguridad (RLS): cada quien solo ve lo de SU parroquia
-- =====================================================================
alter table parroquias enable row level security;

drop policy config_leer     on config;
drop policy config_editar   on config;
revoke all on config from anon, authenticated;   -- solo el servidor la usa

drop policy perfiles_leer   on perfiles;
drop policy perfiles_editar on perfiles;
drop policy lugares_leer    on lugares;
drop policy lugares_crear   on lugares;
drop policy lugares_editar  on lugares;
drop policy misas_leer      on misas_fijas;
drop policy misas_crear     on misas_fijas;
drop policy misas_editar    on misas_fijas;
drop policy eventos_leer    on eventos;
drop policy eventos_crear   on eventos;
drop policy eventos_editar  on eventos;
drop policy conflictos_leer on conflictos;
drop policy intenciones_leer   on intenciones;
drop policy intenciones_crear  on intenciones;
drop policy intenciones_editar on intenciones;
drop policy tipos_leer      on tipos_evento;
drop policy tipos_crear     on tipos_evento;
drop policy tipos_editar    on tipos_evento;
drop policy avisos_leer     on avisos_parroquiales;
drop policy avisos_crear    on avisos_parroquiales;
drop policy avisos_editar   on avisos_parroquiales;
drop policy inv_leer        on invitaciones;
drop policy inv_crear       on invitaciones;
drop policy inv_editar      on invitaciones;

-- (el "(select ...)" hace que la parroquia se calcule una sola vez por consulta)
create policy parroquias_leer on parroquias for select
  using (id in (select parroquia_id from perfiles where id = auth.uid()));
-- Las parroquias solo se crean y cambian con las funciones del superadmin.

create policy perfiles_leer on perfiles for select
  using (id = auth.uid() or parroquia_id = (select mi_parroquia()));
create policy perfiles_editar on perfiles for update
  using (mi_rol() = 'parroco' and parroquia_id = (select mi_parroquia()))
  with check (mi_rol() = 'parroco' and parroquia_id = (select mi_parroquia()));

create policy lugares_leer on lugares for select using (parroquia_id = (select mi_parroquia()));
create policy lugares_crear on lugares for insert
  with check (mi_rol() in ('parroco', 'secretaria') and parroquia_id = (select mi_parroquia()));
create policy lugares_editar on lugares for update
  using (mi_rol() in ('parroco', 'secretaria') and parroquia_id = (select mi_parroquia()))
  with check (parroquia_id = (select mi_parroquia()));

create policy misas_leer on misas_fijas for select using (parroquia_id = (select mi_parroquia()));
create policy misas_crear on misas_fijas for insert
  with check (mi_rol() in ('parroco', 'secretaria') and parroquia_id = (select mi_parroquia()));
create policy misas_editar on misas_fijas for update
  using (mi_rol() in ('parroco', 'secretaria') and parroquia_id = (select mi_parroquia()))
  with check (parroquia_id = (select mi_parroquia()));

create policy eventos_leer on eventos for select using (parroquia_id = (select mi_parroquia()));
create policy eventos_crear on eventos for insert with check (parroquia_id = (select mi_parroquia()));
create policy eventos_editar on eventos for update
  using (parroquia_id = (select mi_parroquia()))
  with check (parroquia_id = (select mi_parroquia()));

create policy conflictos_leer on conflictos for select using (parroquia_id = (select mi_parroquia()));

create policy intenciones_leer on intenciones for select using (parroquia_id = (select mi_parroquia()));
create policy intenciones_crear on intenciones for insert
  with check (parroquia_id = (select mi_parroquia()) and puede_editar_intenciones(evento_id));
create policy intenciones_editar on intenciones for update
  using (parroquia_id = (select mi_parroquia()) and puede_editar_intenciones(evento_id))
  with check (parroquia_id = (select mi_parroquia()) and puede_editar_intenciones(evento_id));

create policy tipos_leer on tipos_evento for select using (parroquia_id = (select mi_parroquia()));
create policy tipos_crear on tipos_evento for insert
  with check (es_activo() and parroquia_id = (select mi_parroquia()));
create policy tipos_editar on tipos_evento for update
  using (mi_rol() in ('parroco', 'secretaria') and parroquia_id = (select mi_parroquia()))
  with check (parroquia_id = (select mi_parroquia()));

create policy avisos_leer on avisos_parroquiales for select using (parroquia_id = (select mi_parroquia()));
create policy avisos_crear on avisos_parroquiales for insert
  with check (mi_rol() in ('parroco', 'secretaria') and parroquia_id = (select mi_parroquia()));
create policy avisos_editar on avisos_parroquiales for update
  using (mi_rol() in ('parroco', 'secretaria') and parroquia_id = (select mi_parroquia()))
  with check (parroquia_id = (select mi_parroquia()));

create policy inv_leer on invitaciones for select
  using (mi_rol() = 'parroco' and parroquia_id = (select mi_parroquia()));
create policy inv_crear on invitaciones for insert
  with check (mi_rol() = 'parroco' and parroquia_id = (select mi_parroquia()));
create policy inv_editar on invitaciones for update
  using (mi_rol() = 'parroco' and parroquia_id = (select mi_parroquia()))
  with check (parroquia_id = (select mi_parroquia()));

alter publication supabase_realtime add table parroquias;

-- =====================================================================
--  7. Panel del superadmin (solo se usa con internet; todo pasa por estas funciones)
--     El superadmin gestiona parroquias y accesos, no ve su agenda ni sus intenciones.
-- =====================================================================
create function listar_parroquias() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  return coalesce((
    select jsonb_agg(t.x order by t.x ->> 'nombre')
      from (
        select jsonb_build_object(
          'id', q.id, 'nombre', q.nombre, 'zona_horaria', q.zona_horaria,
          'activa', q.activa, 'created_at', q.created_at,
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

-- Crea la parroquia y la invitación de su primer párroco. Devuelve el código para dárselo.
create function crear_parroquia(p_nombre text, p_zona text, p_email text, p_nombre_parroco text default '')
returns jsonb
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
  insert into parroquias (nombre, zona_horaria) values (btrim(p_nombre), v_zona) returning id into v_id;
  insert into invitaciones (parroquia_id, email, nombre, rol)
  values (v_id, p_email, btrim(coalesce(p_nombre_parroco, '')), 'parroco')
  returning codigo into v_codigo;
  return jsonb_build_object('parroquia_id', v_id, 'codigo', v_codigo);
end $$;

-- Invitación para otro párroco de una parroquia que ya existe.
create function invitar_parroco(p_parroquia uuid, p_email text, p_nombre text default '') returns text
language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  if not exists (select 1 from parroquias where id = p_parroquia) then raise exception 'La parroquia no existe.'; end if;
  insert into invitaciones (parroquia_id, email, nombre, rol)
  values (p_parroquia, p_email, btrim(coalesce(p_nombre, '')), 'parroco')
  returning codigo into v_codigo;
  return v_codigo;
end $$;

create function cancelar_invitacion_parroco(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  update invitaciones set activa = false where id = p_id and rol = 'parroco' and usada_por is null;
end $$;

-- Renombrar, cambiar la zona horaria o suspender / reactivar (los parámetros vacíos no cambian nada).
create function editar_parroquia(p_id uuid, p_nombre text default null, p_activa boolean default null, p_zona text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  if p_zona is not null then perform now() at time zone p_zona; end if;
  update parroquias
     set nombre       = coalesce(nullif(btrim(p_nombre), ''), nombre),
         activa       = coalesce(p_activa, activa),
         zona_horaria = coalesce(nullif(btrim(p_zona), ''), zona_horaria)
   where id = p_id;
end $$;

-- Para un superadmin sin parroquia propia: pasar a ser párroco de una parroquia (p. ej. la primera de una instalación nueva).
create function asignarme_como_parroco(p_parroquia uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  if not exists (select 1 from parroquias where id = p_parroquia) then raise exception 'La parroquia no existe.'; end if;
  update perfiles set parroquia_id = p_parroquia, rol = 'parroco', activo = true
   where id = auth.uid() and parroquia_id is null;
  if not found then raise exception 'Tu cuenta ya pertenece a una parroquia.'; end if;
end $$;

revoke all on function listar_parroquias() from public, anon;
revoke all on function crear_parroquia(text, text, text, text) from public, anon;
revoke all on function invitar_parroco(uuid, text, text) from public, anon;
revoke all on function cancelar_invitacion_parroco(uuid) from public, anon;
revoke all on function editar_parroquia(uuid, text, boolean, text) from public, anon;
revoke all on function asignarme_como_parroco(uuid) from public, anon;
grant execute on function listar_parroquias() to authenticated;
grant execute on function crear_parroquia(text, text, text, text) to authenticated;
grant execute on function invitar_parroco(uuid, text, text) to authenticated;
grant execute on function cancelar_invitacion_parroco(uuid) to authenticated;
grant execute on function editar_parroquia(uuid, text, boolean, text) to authenticated;
grant execute on function asignarme_como_parroco(uuid) to authenticated;
