-- Quién puede capturar o editar intenciones.
-- Todos los usuarios activos las pueden LEER. Capturarlas o editarlas solo:
--   · la secretaria, en todos los eventos;
--   · el párroco o el vicario, en los eventos que tienen asignados.
-- Para proyectos que ya ejecutaron 20261026_intenciones_y_push.sql.
-- Pegar completo en: Supabase -> SQL Editor -> Run.

create function puede_editar_intenciones(p_evento uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_activo() and exists (
    select 1 from eventos e
     where e.id = p_evento and (mi_rol() = 'secretaria' or e.asignado_a = auth.uid()))
$$;

alter policy intenciones_crear on intenciones
  with check (puede_editar_intenciones(evento_id));
alter policy intenciones_editar on intenciones
  using (puede_editar_intenciones(evento_id)) with check (puede_editar_intenciones(evento_id));
