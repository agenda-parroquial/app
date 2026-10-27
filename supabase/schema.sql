-- =====================================================================
--  Agenda Parroquial · esquema de Supabase
--  Pegar completo en: Supabase → SQL Editor → New query → Run
--  Es re-ejecutable solo en un proyecto vacío (crea tipos y tablas).
--  Incluye al final la capa multi-parroquia (superadmin + una parroquia por párroco)
--  y la de vigencia automática, colores por tipo de evento y eventos diocesanos.
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


-- =====================================================================
--  PARTE FINAL · Multi-parroquia (igual a migrations/20261029_multi_parroquia.sql)
--  En una instalación nueva, la primera persona que se registra queda como
--  superadmin; ella crea las parroquias e invita a sus párrocos.
-- =====================================================================

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


-- =====================================================================
--  PARTE FINAL 2 · Vigencia, colores y eventos diocesanos (igual a migrations/20261030_vigencia_colores_diocesanos.sql)
-- =====================================================================

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
