-- Ministros y vicarios sin cuenta, borrar eventos, obispo y avisos de eventos diocesanos.
-- Requiere 20261029, 20261030 y 20261031 (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.

-- =====================================================================
--  1. Ministros y vicarios (personas sin cuenta que pueden ser celebrantes)
-- =====================================================================
create table ministros (
  id          uuid primary key default gen_random_uuid(),
  parroquia_id uuid not null default mi_parroquia() references parroquias (id),
  nombre      text not null check (btrim(nombre) <> ''),
  tipo        text not null default 'ministro' check (tipo in ('ministro', 'vicario')),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ministros_parroquia_idx on ministros (parroquia_id, updated_at, id);
create trigger ministros_updated before update on ministros
  for each row execute function set_updated_at();

alter table ministros enable row level security;
create policy ministros_leer on ministros for select using (parroquia_id = (select mi_parroquia()));
create policy ministros_crear on ministros for insert
  with check (mi_rol() in ('parroco', 'secretaria') and parroquia_id = (select mi_parroquia()));
create policy ministros_editar on ministros for update
  using (mi_rol() in ('parroco', 'secretaria') and parroquia_id = (select mi_parroquia()))
  with check (parroquia_id = (select mi_parroquia()));
alter publication supabase_realtime add table ministros;

-- El celebrante de un evento (o de una misa fija) es una persona con cuenta (asignado_a)
-- o un ministro sin cuenta (ministro_id), nunca los dos.
alter table eventos     add column ministro_id uuid references ministros (id) on delete set null;
alter table misas_fijas add column ministro_id uuid references ministros (id) on delete set null;
alter table eventos     add constraint eventos_celebrante_ok     check (asignado_a is null or ministro_id is null);
alter table misas_fijas add constraint misas_fijas_celebrante_ok check (asignado_a is null or ministro_id is null);

-- Dos eventos también chocan si comparten ministro.
create or replace function eventos_traslapan(a eventos, b eventos) returns boolean
language sql immutable as $$
  select a.parroquia_id = b.parroquia_id and a.inicio < b.fin and b.inicio < a.fin and (
    (a.lugar_id is not null and a.lugar_id = b.lugar_id) or
    (a.asignado_a is not null and a.asignado_a = b.asignado_a) or
    (a.ministro_id is not null and a.ministro_id = b.ministro_id)
  )
$$;

-- El lugar, el sacerdote o el ministro de un evento deben ser de su misma parroquia.
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
    if coalesce(current_setting('agenda.interno', true), '') = '1' then
      new.version := old.version;
    else
      new.version := old.version + 1;
    end if;
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
  return new;
end $$;

-- Las misas fijas generadas heredan también el ministro.
create or replace function _generar_misas_fijas(p_dias int, p_parroquia uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into eventos (parroquia_id, tipo, inicio, fin, lugar_id, asignado_a, ministro_id, intencion, misa_fija_id, fecha_origen)
  select m.parroquia_id, 'misa',
         (d + m.hora) at time zone q.zona_horaria,
         (d + m.hora + make_interval(mins => m.duracion_min)) at time zone q.zona_horaria,
         m.lugar_id, m.asignado_a, m.ministro_id, m.intencion, m.id, d::date
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

-- =====================================================================
--  2. Avisos a los demás usuarios de la parroquia (con el nombre de quien lo hizo)
-- =====================================================================
create or replace function trg_eventos_despues() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_quien text;
begin
  -- Los cambios de estado que hace el propio recalculo de conflictos no se reprocesan.
  if coalesce(current_setting('agenda.interno', true), '') = '1' then return null; end if;

  if tg_op = 'INSERT' then
    if new.misa_fija_id is null then
      select nullif(btrim(nombre), '') into v_quien from perfiles where id = new.creado_por;
      perform notificar_a_otros(new.parroquia_id, new.creado_por, 'evento_nuevo', new.id, null,
                                'Nuevo: ' || describir_evento(new) || coalesce(' (' || v_quien || ')', ''));
    end if;
  elsif (old.inicio, old.fin, old.lugar_id, old.lugar_texto, old.asignado_a, old.ministro_id, old.intencion, old.estado)
        is distinct from
        (new.inicio, new.fin, new.lugar_id, new.lugar_texto, new.asignado_a, new.ministro_id, new.intencion, new.estado) then
    select nullif(btrim(nombre), '') into v_quien from perfiles where id = new.modificado_por;
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

-- =====================================================================
--  3. Eliminar eventos
--     Solo los que se agendaron a mano (una misa fija se cancela: si no, el calendario la volvería a crear).
--     El párroco y la secretaria pueden borrar cualquiera de su parroquia; los demás, los que ellos crearon.
-- =====================================================================
create policy eventos_borrar on eventos for delete
  using (parroquia_id = (select mi_parroquia())
         and misa_fija_id is null
         and (mi_rol() in ('parroco', 'secretaria') or creado_por = auth.uid()));

create or replace function trg_eventos_borrar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_quien text;
begin
  -- Avisar a los demás (las misas fijas que se rehacen solas, y los borrados internos, no avisan).
  if old.misa_fija_id is null and auth.uid() is not null then
    select nullif(btrim(nombre), '') into v_quien from perfiles where id = auth.uid();
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
--  4. Obispo: puede publicar eventos diocesanos igual que el superadmin
--     (sin acceso al resto del panel). Primero debe tener cuenta, p. ej. invitado a una parroquia.
-- =====================================================================
create table obispos (
  id         uuid primary key references perfiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table obispos enable row level security;
revoke all on obispos from anon, authenticated;

create function soy_obispo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from obispos where id = auth.uid())
$$;
revoke all on function soy_obispo() from public, anon;
grant execute on function soy_obispo() to authenticated;

-- Quien puede publicar eventos diocesanos: el superadmin y los obispos.
create function soy_diocesano() returns boolean
language sql stable security definer set search_path = public as $$
  select soy_superadmin() or soy_obispo()
$$;
revoke all on function soy_diocesano() from public, anon;
grant execute on function soy_diocesano() to authenticated;

drop policy diocesanos_leer   on eventos_diocesanos;
drop policy diocesanos_crear  on eventos_diocesanos;
drop policy diocesanos_editar on eventos_diocesanos;
create policy diocesanos_leer on eventos_diocesanos for select to authenticated
  using (es_activo() or soy_diocesano());
create policy diocesanos_crear on eventos_diocesanos for insert to authenticated
  with check (soy_diocesano());
create policy diocesanos_editar on eventos_diocesanos for update to authenticated
  using (soy_diocesano()) with check (soy_diocesano());

create function listar_obispos() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'email', p.email) order by p.nombre)
      from obispos o join perfiles p on p.id = o.id), '[]'::jsonb);
end $$;

create function autorizar_obispo(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  select id into v_id from perfiles where lower(email) = lower(btrim(p_email)) and activo;
  if v_id is null then
    raise exception 'Ese correo todavía no tiene cuenta. Invítalo primero a una parroquia (por ejemplo, la del obispado) y cuando se registre vuelve aquí.';
  end if;
  insert into obispos (id) values (v_id) on conflict do nothing;
end $$;

create function quitar_obispo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not soy_superadmin() then raise exception 'No autorizado'; end if;
  delete from obispos where id = p_id;
end $$;

revoke all on function listar_obispos() from public, anon;
revoke all on function autorizar_obispo(text) from public, anon;
revoke all on function quitar_obispo(uuid) from public, anon;
grant execute on function listar_obispos() to authenticated;
grant execute on function autorizar_obispo(text) to authenticated;
grant execute on function quitar_obispo(uuid) to authenticated;

-- =====================================================================
--  5. Avisos de eventos diocesanos: al crearlos, al cambiar su día, hora, lugar o título, y al quitarlos.
--     `notificar` ahora es «avisar de ESTA acción» (el formulario lo manda en cada guardado).
--     Los usuarios de las parroquias con acceso lo reciben con la hora de su parroquia.
-- =====================================================================
create or replace function trg_evento_diocesano_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prefijo text;
begin
  if tg_op = 'INSERT' then
    if new.notificar and new.activo then v_prefijo := 'Diocesano: '; end if;
  elsif old.activo and not new.activo then
    v_prefijo := 'Diocesano cancelado: ';
  elsif new.activo and new.notificar
        and (old.titulo, old.inicio, old.fin, old.lugar) is distinct from (new.titulo, new.inicio, new.fin, new.lugar) then
    v_prefijo := 'Diocesano modificado: ';
  end if;

  if v_prefijo is not null then
    insert into notificaciones (usuario_id, tipo, mensaje)
    select p.id, 'evento_diocesano',
           v_prefijo || new.titulo || ' · ' || to_char(new.inicio at time zone q.zona_horaria, 'DD/MM HH24:MI')
      from perfiles p join parroquias q on q.id = p.parroquia_id
     where p.activo and parroquia_al_dia(q.id) and p.id is distinct from auth.uid();
  end if;
  return null;
end $$;

drop trigger eventos_diocesanos_nuevo on eventos_diocesanos;
create trigger eventos_diocesanos_nuevo after insert or update on eventos_diocesanos
  for each row execute function trg_evento_diocesano_nuevo();
