-- Las notificaciones ya leídas se borran solas una semana después de leerlas (las que nunca se han leído no se borran).
-- Cada cuenta limpia las suyas al abrir la app, una vez al día.
-- Requiere 20261111 (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.

alter table notificaciones add column leida_en timestamptz;   -- cuándo se leyó (para contar la semana)

-- Al marcarla como leída se anota cuándo (lo hace la base de datos, no hay que confiar en el reloj del teléfono).
create function trg_notificacion_leida() returns trigger
language plpgsql as $$
begin
  if new.leida and not old.leida then
    new.leida_en := now();
  elsif not new.leida then
    new.leida_en := null;
  end if;
  return new;
end $$;
create trigger notificaciones_leida before update on notificaciones
  for each row execute function trg_notificacion_leida();

-- Borra las notificaciones leídas hace más de 7 días (si no se sabe cuándo se leyeron, cuenta desde que se crearon).
-- Solo las de quien la llama.
create function limpiar_mis_notificaciones() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from notificaciones
   where usuario_id = auth.uid() and leida
     and coalesce(leida_en, created_at) < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function limpiar_mis_notificaciones() from public, anon;
grant execute on function limpiar_mis_notificaciones() to authenticated;
