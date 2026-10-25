-- Intenciones por evento + avisos push (llegan con la app cerrada).
-- Para proyectos que ya ejecutaron schema.sql y las migraciones anteriores.
-- Pegar completo en: Supabase -> SQL Editor -> Run.
-- Despues hay que desplegar la funcion supabase/functions/enviar-push (ver README).

-- Las fechas de una misa fija que ya tienen intenciones capturadas no se rehacen
-- cuando se cambia la plantilla.
create or replace function trg_misa_fija_cambio() returns trigger
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
create policy intenciones_leer   on intenciones for select using (es_activo());
create policy intenciones_crear  on intenciones for insert with check (es_activo());
create policy intenciones_editar on intenciones for update using (es_activo());
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

-- Dirección de las funciones de este proyecto.
insert into config (clave, valor) values ('funciones_url', 'https://xmtafskmklzvxhdxxrbl.supabase.co/functions/v1');

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
