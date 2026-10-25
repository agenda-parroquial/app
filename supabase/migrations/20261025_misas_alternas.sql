-- Misas fijas alternas (una semana sí, otra no) + corrección de conflictos
-- en misas fijas.
-- Para proyectos que ya ejecutaron schema.sql antes de este cambio.
-- Pegar completo en: Supabase → SQL Editor → Run.
-- Es seguro: las misas existentes quedan como "todas las semanas".

-- 1. Frecuencia de las misas fijas ------------------------------------
alter table misas_fijas
  add column cada_semanas smallint not null default 1 check (cada_semanas between 1 and 8),
  add column desde date,
  add constraint misas_fijas_alterna_ok check (
    cada_semanas = 1 or (desde is not null and extract(dow from desde)::int = dia_semana));

create or replace function _generar_misas_fijas(p_dias int) returns int
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

-- 2. Corrección: los eventos que nacen de una misa fija no se revisaban
--    contra el resto de la agenda (la regla de "cambio interno" por
--    profundidad de triggers también los saltaba). Ahora se usa una marca
--    explícita que solo activa el propio recálculo de conflictos.
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
  return new;
end $$;

create or replace function trg_eventos_despues() returns trigger
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

create or replace function trg_eventos_borrar() returns trigger
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

-- 3. Revisar una vez lo ya agendado, por si alguna misa fija ya chocaba ---
select revisar_conflictos(id) from eventos where estado <> 'cancelado' and inicio > now();
