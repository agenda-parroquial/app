-- =====================================================================
--  Agenda Parroquial · esquema de Supabase
--  Pegar completo en: Supabase → SQL Editor → New query → Run
--  Es re-ejecutable solo en un proyecto vacío (crea tipos y tablas).
-- =====================================================================

-- ---------- Configuración ---------------------------------------------
create table config (
  clave text primary key,
  valor text not null
);
-- Zona horaria de la parroquia (se usa para generar las misas fijas
-- y para los textos de las notificaciones). Cámbiala si no es esta.
insert into config (clave, valor) values ('zona_horaria', 'America/Mexico_City');

-- ---------- Tipos ------------------------------------------------------
create type rol_usuario   as enum ('parroco', 'vicario', 'secretaria');
create type tipo_lugar    as enum ('templo', 'capilla', 'oficina', 'otro');
create type tipo_evento   as enum ('misa', 'bautizo', 'boda', 'confesion', 'uncion', 'reunion', 'otro');
create type estado_evento as enum ('confirmado', 'en_conflicto', 'cancelado');

-- ---------- Perfiles (usuarios de la app) -----------------------------
create table perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  nombre     text not null default '',
  rol        rol_usuario not null default 'secretaria',
  activo     boolean not null default false,   -- el párroco aprueba
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Lugares ----------------------------------------------------
-- Lugares habituales (parroquia, capillas, oficina...). Los lugares de
-- una sola vez (unción en casa de...) van como texto dentro del evento.
create table lugares (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  tipo       tipo_lugar not null default 'capilla',
  direccion  text,
  lat        double precision,   -- para el mapa (fase posterior)
  lng        double precision,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Misas fijas (plantilla semanal) ---------------------------
create table misas_fijas (
  id           uuid primary key default gen_random_uuid(),
  dia_semana   smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  hora         time not null,
  duracion_min int not null default 60 check (duracion_min > 0),
  lugar_id     uuid not null references lugares (id),
  asignado_a   uuid references perfiles (id),
  intencion    text,
  activo       boolean not null default true,
  -- Frecuencia: 1 = todas las semanas; 2 = una sí y una no (alternas), etc.
  -- Con más de 1 se indica "desde": la primera fecha en que se celebra
  -- (debe caer en el día de la semana de la misa).
  cada_semanas smallint not null default 1 check (cada_semanas between 1 and 8),
  desde        date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint misas_fijas_alterna_ok check (
    cada_semanas = 1 or (desde is not null and extract(dow from desde)::int = dia_semana))
);

-- ---------- Eventos (la agenda) ---------------------------------------
create table eventos (
  id                uuid primary key default gen_random_uuid(),
  tipo              tipo_evento not null default 'misa',
  tipo_texto        text,                       -- nombre del tipo cuando tipo = 'otro'
  titulo            text,
  inicio            timestamptz not null,
  fin               timestamptz not null,
  lugar_id          uuid references lugares (id),
  lugar_texto       text,                       -- lugar de una sola vez
  asignado_a        uuid references perfiles (id),
  intencion         text,
  contacto_nombre   text,
  contacto_telefono text,
  notas             text,
  estado            estado_evento not null default 'confirmado',
  misa_fija_id      uuid references misas_fijas (id) on delete set null,
  fecha_origen      date,                       -- día de la misa fija que lo generó
  creado_por        uuid references perfiles (id),
  modificado_por    uuid references perfiles (id),
  version           int not null default 1,     -- sube con cada edición de usuario
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (fin > inicio),
  check (lugar_id is not null or coalesce(lugar_texto, '') <> '')
);
create index eventos_inicio_idx on eventos (inicio);
create index eventos_updated_idx on eventos (updated_at);
create unique index eventos_misa_fija_dia_uq on eventos (misa_fija_id, fecha_origen)
  where misa_fija_id is not null;

-- ---------- Conflictos (traslapes detectados) -------------------------
create table conflictos (
  id           uuid primary key default gen_random_uuid(),
  evento_a     uuid not null references eventos (id) on delete cascade,
  evento_b     uuid not null references eventos (id) on delete cascade,
  estado       text not null default 'abierto' check (estado in ('abierto', 'resuelto')),
  resolucion   text check (resolucion in ('coexisten', 'cancelado', 'movido')),
  resuelto_por uuid references perfiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (evento_a < evento_b)
);
create unique index conflictos_par_uq on conflictos (evento_a, evento_b);
create index conflictos_updated_idx on conflictos (updated_at);

-- ---------- Notificaciones (una fila por usuario) ---------------------
create table notificaciones (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references perfiles (id) on delete cascade,
  tipo         text not null,   -- evento_nuevo | evento_editado | evento_cancelado | conflicto
  evento_id    uuid references eventos (id) on delete cascade,
  conflicto_id uuid references conflictos (id) on delete cascade,
  mensaje      text not null,
  leida        boolean not null default false,
  created_at   timestamptz not null default now()
);
create index notificaciones_usuario_idx on notificaciones (usuario_id, created_at desc);

-- =====================================================================
--  Funciones auxiliares
-- =====================================================================

create function es_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and activo)
$$;

create function mi_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo
$$;

create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create trigger perfiles_updated    before update on perfiles    for each row execute function set_updated_at();
create trigger lugares_updated     before update on lugares     for each row execute function set_updated_at();
create trigger misas_fijas_updated before update on misas_fijas for each row execute function set_updated_at();
create trigger conflictos_updated  before update on conflictos  for each row execute function set_updated_at();

-- Alta de usuario: el PRIMERO que se registra es el párroco (activo). Quien se registra con
-- el correo y el código de una invitación del párroco entra ya aprobado y con el rol invitado.
-- Los demás quedan pendientes hasta que el párroco los apruebe.
create function handle_new_user() returns trigger
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

create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();

-- Nunca dejar la parroquia sin un párroco activo.
create function proteger_ultimo_parroco() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.rol = 'parroco' and old.activo and (new.rol <> 'parroco' or not new.activo)
     and not exists (select 1 from perfiles where rol = 'parroco' and activo and id <> old.id) then
    raise exception 'Debe existir al menos un párroco activo';
  end if;
  return new;
end $$;
create trigger perfiles_proteger before update on perfiles
  for each row execute function proteger_ultimo_parroco();

-- ---------- Descripción corta de un evento (para notificaciones) ------
create function describir_evento(e eventos) returns text
language sql stable set search_path = public as $$
  select coalesce(nullif(e.titulo, ''), nullif(e.tipo_texto, ''), initcap(e.tipo::text)) || ' '
    || to_char(e.inicio at time zone (select valor from config where clave = 'zona_horaria'), 'DD/MM HH24:MI')
    || ' · ' || coalesce((select nombre from lugares where id = e.lugar_id), e.lugar_texto, '')
$$;

create function notificar_a_otros(p_excluir uuid, p_tipo text, p_evento uuid, p_conflicto uuid, p_mensaje text)
returns void
language sql security definer set search_path = public as $$
  insert into notificaciones (usuario_id, tipo, evento_id, conflicto_id, mensaje)
  select id, p_tipo, p_evento, p_conflicto, p_mensaje
  from perfiles
  where activo and id is distinct from p_excluir
$$;
-- Solo la usan los triggers del servidor; ningún usuario debe poder llamarla.
revoke all on function notificar_a_otros(uuid, text, uuid, uuid, text) from public, anon, authenticated;

-- ---------- Regla de traslape -----------------------------------------
-- Dos eventos chocan si se cruzan en el tiempo Y comparten lugar
-- (de la lista) o la misma persona asignada.
create function eventos_traslapan(a eventos, b eventos) returns boolean
language sql immutable as $$
  select a.inicio < b.fin and b.inicio < a.fin and (
    (a.lugar_id is not null and a.lugar_id = b.lugar_id) or
    (a.asignado_a is not null and a.asignado_a = b.asignado_a)
  )
$$;

-- Recalcula los conflictos de UN evento y el estado de los afectados.
create function revisar_conflictos(p_id uuid) returns void
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

  -- 2. Abrir conflictos nuevos
  if e.estado <> 'cancelado' then
    for o in
      select x.* from eventos x
       where x.id <> p_id and x.estado <> 'cancelado' and eventos_traslapan(e, x)
    loop
      v_a := least(e.id, o.id);
      v_b := greatest(e.id, o.id);
      v_id := null;
      insert into conflictos (evento_a, evento_b) values (v_a, v_b)
      on conflict (evento_a, evento_b) do update
         set estado = 'abierto', resolucion = null, resuelto_por = null
       where conflictos.estado = 'resuelto' and conflictos.resolucion <> 'coexisten'
      returning id into v_id;

      if v_id is not null then   -- conflicto nuevo (o reabierto): avisar a todos
        perform notificar_a_otros(
          null, 'conflicto', p_id, v_id,
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

-- "Permitir ambos": los dos eventos pueden coexistir.
create function resolver_conflicto(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c conflictos;
begin
  if not es_activo() then raise exception 'No autorizado'; end if;
  update conflictos
     set estado = 'resuelto', resolucion = 'coexisten', resuelto_por = auth.uid()
   where id = p_id and estado = 'abierto'
  returning * into c;
  if found then
    perform revisar_conflictos(c.evento_a);
    perform revisar_conflictos(c.evento_b);
  end if;
end $$;
revoke all on function resolver_conflicto(uuid) from public, anon;
grant execute on function resolver_conflicto(uuid) to authenticated;

-- ---------- Triggers de eventos ---------------------------------------
create function trg_eventos_antes() returns trigger
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
  return new;
end $$;
create trigger eventos_antes before insert or update on eventos
  for each row execute function trg_eventos_antes();

create function trg_eventos_despues() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Los cambios de estado que hace el propio recalculo de conflictos no se reprocesan.
  if coalesce(current_setting('agenda.interno', true), '') = '1' then return null; end if;

  if tg_op = 'INSERT' then
    if new.misa_fija_id is null then
      perform notificar_a_otros(new.creado_por, 'evento_nuevo', new.id, null,
                                'Nuevo: ' || describir_evento(new));
    end if;
  elsif (old.inicio, old.fin, old.lugar_id, old.lugar_texto, old.asignado_a, old.intencion, old.estado)
        is distinct from
        (new.inicio, new.fin, new.lugar_id, new.lugar_texto, new.asignado_a, new.intencion, new.estado) then
    perform notificar_a_otros(
      new.modificado_por,
      case when new.estado = 'cancelado' then 'evento_cancelado' else 'evento_editado' end,
      new.id, null,
      case when new.estado = 'cancelado' then 'Cancelado: ' else 'Modificado: ' end
        || describir_evento(new));
  end if;

  perform revisar_conflictos(new.id);
  return null;
end $$;
create trigger eventos_despues after insert or update on eventos
  for each row execute function trg_eventos_despues();

-- Si se borra un evento (solo ocurre al regenerar misas fijas), liberar
-- a sus contrapartes de conflicto.
create function trg_eventos_borrar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('agenda.interno', '1', true);
  update eventos x set estado = 'confirmado'
   where x.estado = 'en_conflicto'
     and x.id in (
       select case when c.evento_a = old.id then c.evento_b else c.evento_a end
         from conflictos c where c.estado = 'abierto' and old.id in (c.evento_a, c.evento_b))
     and not exists (
       select 1 from conflictos c2
        where c2.estado = 'abierto' and x.id in (c2.evento_a, c2.evento_b)
          and old.id not in (c2.evento_a, c2.evento_b));
  perform set_config('agenda.interno', '', true);
  return old;
end $$;
create trigger eventos_borrar before delete on eventos
  for each row execute function trg_eventos_borrar();

-- ---------- Misas fijas → eventos reales ------------------------------
-- Cada misa fija se "materializa" como eventos para los próximos N días,
-- así los traslapes y las notificaciones funcionan igual que con
-- cualquier otro evento. Es idempotente (no duplica).
create function _generar_misas_fijas(p_dias int) returns int
language plpgsql security definer set search_path = public as $$
declare tz text; n int;
begin
  select valor into tz from config where clave = 'zona_horaria';
  insert into eventos (tipo, inicio, fin, lugar_id, asignado_a, intencion, misa_fija_id, fecha_origen)
  select 'misa',
         (d + m.hora) at time zone tz,
         (d + m.hora + make_interval(mins => m.duracion_min)) at time zone tz,
         m.lugar_id, m.asignado_a, m.intencion, m.id, d::date
    from misas_fijas m
   cross join generate_series(
           (now() at time zone tz)::date::timestamp,
           ((now() at time zone tz)::date + p_dias)::timestamp,
           interval '1 day') d
   where m.activo and extract(dow from d) = m.dia_semana
     and (m.cada_semanas = 1
          or (d::date >= m.desde and ((d::date - m.desde) / 7) % m.cada_semanas = 0))
  on conflict (misa_fija_id, fecha_origen) where misa_fija_id is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function _generar_misas_fijas(int) from public, anon, authenticated;

create function generar_misas_fijas(p_dias int default 90) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not es_activo() then raise exception 'No autorizado'; end if;
  return _generar_misas_fijas(least(greatest(p_dias, 1), 365));
end $$;
revoke all on function generar_misas_fijas(int) from public, anon;
grant execute on function generar_misas_fijas(int) to authenticated;

-- Al crear o editar una misa fija: rehacer las ocurrencias futuras que
-- nadie ha tocado a mano (version = 1) y volver a generar.
create function trg_misa_fija_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- (las fechas que ya tienen intenciones capturadas tampoco se tocan)
    delete from eventos
     where misa_fija_id = new.id and inicio > now() and version = 1
       and not exists (select 1 from intenciones i where i.evento_id = eventos.id and i.activa);
  end if;
  perform _generar_misas_fijas(90);
  return null;
end $$;
create trigger misas_fijas_cambio after insert or update on misas_fijas
  for each row execute function trg_misa_fija_cambio();

-- =====================================================================
--  Seguridad (Row Level Security)
--  parroco   : todo, incluida la gestión de usuarios
--  secretaria: agenda, lugares y misas fijas
--  vicario   : ve todo y crea/edita eventos
-- =====================================================================
alter table config          enable row level security;
alter table perfiles        enable row level security;
alter table lugares         enable row level security;
alter table misas_fijas     enable row level security;
alter table eventos         enable row level security;
alter table conflictos      enable row level security;
alter table notificaciones  enable row level security;

create policy config_leer on config for select using (es_activo());
create policy config_editar on config for update using (mi_rol() = 'parroco');

create policy perfiles_leer on perfiles for select using (es_activo() or id = auth.uid());
create policy perfiles_editar on perfiles for update using (mi_rol() = 'parroco');

create policy lugares_leer on lugares for select using (es_activo());
create policy lugares_crear on lugares for insert with check (mi_rol() in ('parroco', 'secretaria'));
create policy lugares_editar on lugares for update using (mi_rol() in ('parroco', 'secretaria'));

create policy misas_leer on misas_fijas for select using (es_activo());
create policy misas_crear on misas_fijas for insert with check (mi_rol() in ('parroco', 'secretaria'));
create policy misas_editar on misas_fijas for update using (mi_rol() in ('parroco', 'secretaria'));

create policy eventos_leer on eventos for select using (es_activo());
create policy eventos_crear on eventos for insert with check (es_activo());
create policy eventos_editar on eventos for update using (es_activo());
-- Sin DELETE para usuarios: los eventos se cancelan, no se borran.

create policy conflictos_leer on conflictos for select using (es_activo());
-- Los conflictos solo los escriben las funciones del servidor.

create policy notif_leer on notificaciones for select using (usuario_id = auth.uid());
create policy notif_marcar on notificaciones for update using (usuario_id = auth.uid());

-- =====================================================================
--  Tiempo real (Realtime)
-- =====================================================================
alter publication supabase_realtime add table
  perfiles, lugares, misas_fijas, eventos, conflictos, notificaciones;

-- =====================================================================
--  Intenciones de cada misa o evento (difuntos, acción de gracias, salud)
-- =====================================================================
create type tipo_intencion as enum ('difunto', 'accion_gracias', 'salud');

create table intenciones (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references eventos (id) on delete cascade,
  tipo       tipo_intencion not null,
  texto      text not null check (btrim(texto) <> ''),   -- nombre(s) o descripción
  activa     boolean not null default true,              -- false = quitada (no se borra)
  creado_por uuid references perfiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index intenciones_evento_idx on intenciones (evento_id);
create index intenciones_updated_idx on intenciones (updated_at);
create trigger intenciones_updated before update on intenciones
  for each row execute function set_updated_at();

alter table intenciones enable row level security;

-- Todos los usuarios activos pueden LEER las intenciones. Capturarlas o editarlas solo:
-- la secretaria (en todos los eventos) y el párroco o vicario (en los eventos que tienen asignados).
create function puede_editar_intenciones(p_evento uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_activo() and exists (
    select 1 from eventos e
     where e.id = p_evento and (mi_rol() = 'secretaria' or e.asignado_a = auth.uid()))
$$;
create policy intenciones_leer   on intenciones for select using (es_activo());
create policy intenciones_crear  on intenciones for insert with check (puede_editar_intenciones(evento_id));
create policy intenciones_editar on intenciones for update
  using (puede_editar_intenciones(evento_id)) with check (puede_editar_intenciones(evento_id));
alter publication supabase_realtime add table intenciones;   -- se sincronizan en tiempo real

-- =====================================================================
--  Avisos push (llegan aunque la app esté cerrada)
--  Flujo: se crea una notificación → trigger → función "enviar-push"
--  (Edge Function) → servicio push de Apple/Google → el teléfono.
-- =====================================================================
create extension if not exists pg_net with schema extensions;

-- Dispositivos que aceptaron recibir avisos.
create table push_suscripciones (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references perfiles (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth_secret text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index push_suscripciones_usuario_idx on push_suscripciones (usuario_id);
alter table push_suscripciones enable row level security;
create policy push_leer on push_suscripciones for select using (usuario_id = auth.uid());
-- Altas y bajas solo por registrar_push / quitar_push.

-- Claves del servidor de avisos. Sin políticas: solo las lee la función del servidor.
create table push_config (
  clave text primary key,
  valor text not null
);
alter table push_config enable row level security;
revoke all on push_config from anon, authenticated;
-- Secreto que la base de datos envía a la función para que sepa que la llamada es legítima.
insert into push_config (clave, valor)
values ('secreto', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

-- Dirección de las funciones de TU proyecto (cámbiala por la tuya).
insert into config (clave, valor) values ('funciones_url', 'https://TU-PROYECTO.supabase.co/functions/v1');

create function registrar_push(p_endpoint text, p_p256dh text, p_auth_secret text, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_activo() then raise exception 'No autorizado'; end if;
  insert into push_suscripciones (usuario_id, endpoint, p256dh, auth_secret, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth_secret, p_user_agent)
  on conflict (endpoint) do update
     set usuario_id = auth.uid(), p256dh = excluded.p256dh,
         auth_secret = excluded.auth_secret, user_agent = excluded.user_agent;
end $$;
revoke all on function registrar_push(text, text, text, text) from public, anon;
grant execute on function registrar_push(text, text, text, text) to authenticated;

create function quitar_push(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_suscripciones where endpoint = p_endpoint and usuario_id = auth.uid()
$$;
revoke all on function quitar_push(text) from public, anon;
grant execute on function quitar_push(text) to authenticated;

-- Botón "Mandarme un aviso de prueba" de la app: comprueba que el teléfono recibe avisos.
create function enviar_aviso_de_prueba() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_activo() then raise exception 'No autorizado'; end if;
  insert into notificaciones (usuario_id, tipo, mensaje)
  values (auth.uid(), 'prueba', 'Aviso de prueba: si lo ves en tu pantalla, los avisos funcionan.');
end $$;
revoke all on function enviar_aviso_de_prueba() from public, anon;
grant execute on function enviar_aviso_de_prueba() to authenticated;

-- Cada notificación nueva dispara el envío push. Nunca debe romper el alta de un evento:
-- cualquier falla aquí se ignora (la notificación igual queda dentro de la app).
create function trg_notificacion_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secreto text;
begin
  -- En una ráfaga del mismo tipo (p. ej. muchos empalmes de golpe) solo se envía el primero.
  if exists (select 1 from notificaciones n
              where n.usuario_id = new.usuario_id and n.tipo = new.tipo and n.id <> new.id
                and n.created_at > now() - interval '20 seconds') then
    return null;
  end if;
  if not exists (select 1 from push_suscripciones where usuario_id = new.usuario_id) then
    return null;
  end if;
  select valor into v_url from config where clave = 'funciones_url';
  select valor into v_secreto from push_config where clave = 'secreto';
  perform net.http_post(
    url := v_url || '/enviar-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secreto),
    body := jsonb_build_object('notificacion_id', new.id));
  return null;
exception when others then
  raise warning 'push no enviado: %', sqlerrm;
  return null;
end $$;
create trigger notificaciones_push after insert on notificaciones
  for each row execute function trg_notificacion_push();

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
