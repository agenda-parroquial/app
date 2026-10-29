-- «Misas fijas» pasa a «Eventos fijos»: cada horario que se repite puede ser de cualquier tipo de evento (misa, hora santa,
-- confesiones, reunión…). Lo que ya existía queda como misa.
-- Requiere 20261110 (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.

alter table misas_fijas add column tipo tipo_evento not null default 'misa';
alter table misas_fijas add column tipo_texto text;   -- el nombre del tipo cuando tipo = 'otro' (p. ej. «Hora Santa»)
alter table misas_fijas add constraint misas_fijas_tipo_ok check (tipo <> 'otro' or nullif(btrim(tipo_texto), '') is not null);

-- Los eventos que se generan heredan el tipo.
create or replace function _generar_misas_fijas(p_dias int, p_parroquia uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into eventos (parroquia_id, tipo, tipo_texto, inicio, fin, lugar_id, asignado_a, ministro_id, intencion, misa_fija_id, fecha_origen)
  select m.parroquia_id, m.tipo, case when m.tipo = 'otro' then btrim(m.tipo_texto) end,
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

-- Al renombrar un tipo que agregó la parroquia, también cambia en sus eventos fijos (si no, volverían a generarse con el nombre viejo).
create or replace function renombrar_tipo(p_id uuid, p_nombre text) returns void
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
  update misas_fijas set tipo_texto = v_nuevo
   where parroquia_id = v_parr and tipo = 'otro' and lower(btrim(tipo_texto)) = lower(btrim(v_viejo));
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
