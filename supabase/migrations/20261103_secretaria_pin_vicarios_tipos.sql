-- Personas de la Secretaría con PIN, vicarios y ministros por separado, intenciones solo en los tipos que las llevan
-- y nombres de tipos editables.
-- Requiere 20261101 y 20261102 (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.

-- =====================================================================
--  1. Personas de la Secretaría
--     Varias personas usan la misma cuenta de Secretaría; cada una se identifica con su PIN al agendar.
--     El PIN llega ya convertido en huella (la app la calcula); aquí nunca se guarda el PIN.
--     Es para saber quién hizo cada cosa, no una barrera de seguridad: una huella de un PIN corto se puede adivinar.
-- =====================================================================
create table secretarias (
  id           uuid primary key default gen_random_uuid(),
  parroquia_id uuid not null default mi_parroquia() references parroquias (id),
  nombre       text not null check (btrim(nombre) <> ''),
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index secretarias_parroquia_idx on secretarias (parroquia_id, updated_at, id);
create trigger secretarias_updated before update on secretarias
  for each row execute function set_updated_at();

-- La huella del PIN: solo la ve la cuenta de Secretaría (para comprobar el PIN sin internet).
create table secretarias_pin (
  id           uuid primary key references secretarias (id) on delete cascade,
  parroquia_id uuid not null references parroquias (id),
  pin_hash     text not null check (pin_hash ~ '^[0-9a-f]{64}$'),
  updated_at   timestamptz not null default now()
);
create unique index secretarias_pin_uq on secretarias_pin (parroquia_id, pin_hash);   -- dos personas no comparten PIN
create index secretarias_pin_parroquia_idx on secretarias_pin (parroquia_id, updated_at, id);
create trigger secretarias_pin_updated before update on secretarias_pin
  for each row execute function set_updated_at();

alter table secretarias enable row level security;
alter table secretarias_pin enable row level security;
create policy secretarias_leer on secretarias for select using (parroquia_id = (select mi_parroquia()));
create policy secretarias_pin_leer on secretarias_pin for select
  using (mi_rol() = 'secretaria' and parroquia_id = (select mi_parroquia()));
-- Se escribe solo con guardar_secretaria (sin políticas de insert/update/delete).
alter publication supabase_realtime add table secretarias;
alter publication supabase_realtime add table secretarias_pin;

-- Crea (p_id vacío) o edita a una persona de la Secretaría. Solo el párroco.
--   p_pin_hash: huella del PIN nuevo (vacío = no cambiarlo). Al desactivar, su PIN se borra.
create function guardar_secretaria(p_id uuid, p_nombre text, p_pin_hash text, p_activo boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid := p_id;
  v_parr uuid := mi_parroquia();
begin
  if mi_rol() is distinct from 'parroco' or v_parr is null then raise exception 'No autorizado'; end if;
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe el nombre.'; end if;
  if p_pin_hash is not null and p_pin_hash !~ '^[0-9a-f]{64}$' then raise exception 'PIN no válido.'; end if;

  if v_id is null then
    if p_pin_hash is null then raise exception 'Pon un PIN.'; end if;
    insert into secretarias (parroquia_id, nombre, activo) values (v_parr, btrim(p_nombre), true) returning id into v_id;
  else
    update secretarias set nombre = btrim(p_nombre), activo = coalesce(p_activo, activo)
     where id = v_id and parroquia_id = v_parr;
    if not found then raise exception 'Esa persona no existe.'; end if;
  end if;

  if not coalesce(p_activo, true) then
    delete from secretarias_pin where id = v_id;
  elsif p_pin_hash is not null then
    begin
      insert into secretarias_pin (id, parroquia_id, pin_hash) values (v_id, v_parr, p_pin_hash)
      on conflict (id) do update set pin_hash = excluded.pin_hash;
    exception when unique_violation then
      raise exception 'Ese PIN ya lo usa otra persona. Elige otro.';
    end;
  elsif not exists (select 1 from secretarias_pin where id = v_id) then
    raise exception 'Pon un PIN para activarla.';
  end if;
  return v_id;
end $$;
revoke all on function guardar_secretaria(uuid, text, text, boolean) from public, anon;
grant execute on function guardar_secretaria(uuid, text, text, boolean) to authenticated;

-- Cada evento que agenda la cuenta de Secretaría lleva a la persona que lo hizo.
alter table eventos add column secretaria_id uuid references secretarias (id) on delete set null;

-- =====================================================================
--  2. Reglas de la Secretaría sobre los eventos
--     - Para agendar necesita identificarse (secretaria_id); no puede cambiar quién fue.
--     - Solo edita y elimina los que agendó alguien de la Secretaría (la app comprueba, con el PIN, que sea ella).
-- =====================================================================
create or replace function trg_eventos_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'INSERT' then
    if new.misa_fija_id is null then
      new.creado_por := coalesce(auth.uid(), new.creado_por);
      if mi_rol() = 'secretaria' and new.secretaria_id is null then
        raise exception 'Falta identificarse con el PIN de la Secretaría.';
      end if;
    end if;
  else
    new.modificado_por := coalesce(auth.uid(), new.modificado_por);
    if coalesce(current_setting('agenda.interno', true), '') = '1' then
      new.version := old.version;
    else
      new.version := old.version + 1;
    end if;
    if mi_rol() = 'secretaria' then new.secretaria_id := old.secretaria_id; end if;
  end if;
  if new.lugar_id is not null and (tg_op = 'INSERT' or new.lugar_id is distinct from old.lugar_id)
     and not exists (select 1 from lugares where id = new.lugar_id and parroquia_id = new.parroquia_id) then
    raise exception 'El lugar no pertenece a esta parroquia';
  end if;
  if new.asignado_a is not null and (tg_op = 'INSERT' or new.asignado_a is distinct from old.asignado_a)
     and not exists (select 1 from perfiles where id = new.asignado_a and parroquia_id = new.parroquia_id) then
    raise exception 'La persona asignada no pertenece a esta parroquia';
  end if;
  if new.ministro_id is not null and (tg_op = 'INSERT' or new.ministro_id is distinct from old.ministro_id)
     and not exists (select 1 from ministros where id = new.ministro_id and parroquia_id = new.parroquia_id) then
    raise exception 'El ministro no pertenece a esta parroquia';
  end if;
  if new.secretaria_id is not null and (tg_op = 'INSERT' or new.secretaria_id is distinct from old.secretaria_id)
     and not exists (select 1 from secretarias where id = new.secretaria_id and parroquia_id = new.parroquia_id and activo) then
    raise exception 'La persona de la Secretaría no es válida.';
  end if;
  return new;
end $$;

drop policy eventos_editar on eventos;
create policy eventos_editar on eventos for update
  using (parroquia_id = (select mi_parroquia())
         and (mi_rol() is distinct from 'secretaria' or secretaria_id is not null))
  with check (parroquia_id = (select mi_parroquia()));

drop policy eventos_borrar on eventos;
create policy eventos_borrar on eventos for delete
  using (parroquia_id = (select mi_parroquia())
         and misa_fija_id is null
         and (mi_rol() = 'parroco'
              or (mi_rol() = 'secretaria' and secretaria_id is not null)
              or (mi_rol() = 'vicario' and creado_por = auth.uid())));

-- Los avisos dicen quién fue: la persona de la Secretaría, si la hubo.
create or replace function trg_eventos_despues() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_quien text;
begin
  -- Los cambios de estado que hace el propio recalculo de conflictos no se reprocesan.
  if coalesce(current_setting('agenda.interno', true), '') = '1' then return null; end if;

  if tg_op = 'INSERT' then
    if new.misa_fija_id is null then
      select coalesce((select nullif(btrim(s.nombre), '') from secretarias s where s.id = new.secretaria_id),
                      (select nullif(btrim(p.nombre), '') from perfiles p where p.id = new.creado_por)) into v_quien;
      perform notificar_a_otros(new.parroquia_id, new.creado_por, 'evento_nuevo', new.id, null,
                                'Nuevo: ' || describir_evento(new) || coalesce(' (' || v_quien || ')', ''));
    end if;
  elsif (old.inicio, old.fin, old.lugar_id, old.lugar_texto, old.asignado_a, old.ministro_id, old.intencion, old.estado)
        is distinct from
        (new.inicio, new.fin, new.lugar_id, new.lugar_texto, new.asignado_a, new.ministro_id, new.intencion, new.estado) then
    select coalesce((select nullif(btrim(s.nombre), '') from secretarias s where s.id = new.secretaria_id and mi_rol() = 'secretaria'),
                    (select nullif(btrim(p.nombre), '') from perfiles p where p.id = new.modificado_por)) into v_quien;
    perform notificar_a_otros(
      new.parroquia_id,
      new.modificado_por,
      case when new.estado = 'cancelado' then 'evento_cancelado' else 'evento_editado' end,
      new.id, null,
      case when new.estado = 'cancelado' then 'Cancelado: ' else 'Modificado: ' end
        || describir_evento(new) || coalesce(' (' || v_quien || ')', ''));
  end if;

  perform revisar_conflictos(new.id);
  return null;
end $$;

create or replace function trg_eventos_borrar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_quien text;
begin
  -- Avisar a los demás (las misas fijas que se rehacen solas, y los borrados internos, no avisan).
  if old.misa_fija_id is null and auth.uid() is not null then
    select coalesce((select nullif(btrim(s.nombre), '') from secretarias s where s.id = old.secretaria_id and mi_rol() = 'secretaria'),
                    (select nullif(btrim(p.nombre), '') from perfiles p where p.id = auth.uid())) into v_quien;
    perform notificar_a_otros(old.parroquia_id, auth.uid(), 'evento_cancelado', null, null,
                              'Eliminado: ' || describir_evento(old) || coalesce(' (' || v_quien || ')', ''));
  end if;

  -- Liberar de conflicto a sus contrapartes.
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

-- =====================================================================
--  3. Vicarios (sacerdotes) y ministros extraordinarios, por separado
--     Un vicario sin cuenta puede después tener cuenta: se vincula y sus eventos pasan a ella.
--     Un ministro extraordinario nunca tiene cuenta. Solo el párroco los registra.
-- =====================================================================
alter table ministros add column perfil_id uuid references perfiles (id) on delete set null;   -- cuenta del vicario, si ya la tiene

drop policy ministros_crear on ministros;
drop policy ministros_editar on ministros;
create policy ministros_crear on ministros for insert
  with check (mi_rol() = 'parroco' and parroquia_id = (select mi_parroquia()));
create policy ministros_editar on ministros for update
  using (mi_rol() = 'parroco' and parroquia_id = (select mi_parroquia()))
  with check (parroquia_id = (select mi_parroquia()));

-- Vincula a un vicario registrado sin cuenta con su cuenta (rol vicario): lo que tenía asignado pasa a su cuenta.
create function vincular_vicario(p_vicario uuid, p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_parr uuid := mi_parroquia();
  v_ids  uuid[];
  v_id   uuid;
begin
  if mi_rol() is distinct from 'parroco' or v_parr is null then raise exception 'No autorizado'; end if;
  if not exists (select 1 from ministros where id = p_vicario and parroquia_id = v_parr and tipo = 'vicario') then
    raise exception 'Ese vicario no existe.';
  end if;
  if not exists (select 1 from perfiles where id = p_perfil and parroquia_id = v_parr and activo and rol in ('vicario', 'parroco')) then
    raise exception 'Esa cuenta no es de un sacerdote de esta parroquia.';
  end if;

  -- Los cambios de celebrante no son una modificación del evento: sin avisos ni nueva versión.
  perform set_config('agenda.interno', '1', true);
  select coalesce(array_agg(id), '{}') into v_ids from eventos where ministro_id = p_vicario;
  update eventos set asignado_a = p_perfil, ministro_id = null where ministro_id = p_vicario;
  perform set_config('agenda.interno', '', true);
  update misas_fijas set asignado_a = p_perfil, ministro_id = null where ministro_id = p_vicario;
  update ministros set perfil_id = p_perfil, activo = false where id = p_vicario;
  foreach v_id in array v_ids loop perform revisar_conflictos(v_id); end loop;
end $$;
revoke all on function vincular_vicario(uuid, uuid) from public, anon;
grant execute on function vincular_vicario(uuid, uuid) to authenticated;

-- =====================================================================
--  4. Intenciones solo en los tipos que las llevan
--     Misa sí. Bautizo, boda, confesiones, unción de enfermos y reunión no.
--     Los tipos que agrega la parroquia lo deciden con «lleva_intenciones» (por omisión, no).
-- =====================================================================
alter table tipos_evento add column lleva_intenciones boolean not null default false;

-- =====================================================================
--  5. Nombres de los tipos (para corregir la ortografía o usar otro nombre)
-- =====================================================================
alter table parroquias add column nombres_tipos jsonb not null default '{}'::jsonb;   -- nombre propio de los tipos de siempre

create function guardar_nombres_tipos(p_nombres jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v text;
begin
  if mi_rol() is null or mi_rol() not in ('parroco', 'secretaria') then raise exception 'No autorizado'; end if;
  if jsonb_typeof(p_nombres) is distinct from 'object' then raise exception 'Nombres no válidos.'; end if;
  for k, v in select key, value from jsonb_each_text(p_nombres) loop
    if k not in ('misa', 'bautizo', 'boda', 'confesion', 'uncion', 'reunion') then raise exception 'Tipo no válido: %', k; end if;
    if btrim(v) = '' or length(v) > 60 then raise exception 'El nombre de "%" no es válido.', k; end if;
  end loop;
  update parroquias set nombres_tipos = p_nombres where id = mi_parroquia();
end $$;
revoke all on function guardar_nombres_tipos(jsonb) from public, anon;
grant execute on function guardar_nombres_tipos(jsonb) to authenticated;

-- Renombra un tipo que agregó la parroquia: también cambia el nombre en sus eventos y en su color.
create function renombrar_tipo(p_id uuid, p_nombre text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_parr  uuid := mi_parroquia();
  v_viejo text;
  v_nuevo text := btrim(coalesce(p_nombre, ''));
begin
  if mi_rol() is null or mi_rol() not in ('parroco', 'secretaria') then raise exception 'No autorizado'; end if;
  if v_nuevo = '' or length(v_nuevo) > 60 then raise exception 'Escribe el nombre del tipo.'; end if;
  select nombre into v_viejo from tipos_evento where id = p_id and parroquia_id = v_parr;
  if v_viejo is null then raise exception 'Ese tipo no existe.'; end if;
  if exists (select 1 from tipos_evento where parroquia_id = v_parr and id <> p_id and lower(btrim(nombre)) = lower(v_nuevo)) then
    raise exception 'Ya hay un tipo con ese nombre.';
  end if;

  update tipos_evento set nombre = v_nuevo where id = p_id;
  -- Los eventos que lo usan guardan el nombre: se actualizan sin avisos ni nueva versión.
  perform set_config('agenda.interno', '1', true);
  update eventos set tipo_texto = v_nuevo
   where parroquia_id = v_parr and tipo = 'otro' and lower(btrim(tipo_texto)) = lower(btrim(v_viejo));
  perform set_config('agenda.interno', '', true);
  update parroquias
     set colores = case when colores ? ('t:' || lower(btrim(v_viejo)))
                        then (colores - ('t:' || lower(btrim(v_viejo)))) || jsonb_build_object('t:' || lower(v_nuevo), colores -> ('t:' || lower(btrim(v_viejo))))
                        else colores end
   where id = v_parr;
end $$;
revoke all on function renombrar_tipo(uuid, text) from public, anon;
grant execute on function renombrar_tipo(uuid, text) to authenticated;

-- Las notificaciones usan el nombre propio del tipo (y con sus acentos).
create or replace function describir_evento(e eventos) returns text
language sql stable set search_path = public as $$
  select coalesce(
           nullif(e.titulo, ''), nullif(e.tipo_texto, ''),
           nullif(q.nombres_tipos ->> e.tipo::text, ''),
           case e.tipo when 'confesion' then 'Confesiones' when 'uncion' then 'Unción de enfermos' else initcap(e.tipo::text) end)
         || ' ' || to_char(e.inicio at time zone q.zona_horaria, 'DD/MM HH24:MI')
         || ' · ' || coalesce((select nombre from lugares where id = e.lugar_id), e.lugar_texto, '')
    from parroquias q where q.id = e.parroquia_id
$$;
