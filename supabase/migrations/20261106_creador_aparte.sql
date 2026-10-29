-- La cuenta de Creador (superadmin) queda totalmente aparte de las parroquias:
--  · ya no puede hacerse párroco de una parroquia ni pertenecer a ninguna;
--  · la protección del «último párroco» solo aplica a cuentas de una parroquia (la de Creador queda fuera);
--  · si cambia su correo (o el de cualquier cuenta) en Authentication, el perfil lo copia solo.
-- Requiere 20261105 (también se incluye al final de schema.sql).
-- Pegar completo en: Supabase -> SQL Editor -> Run.

drop function asignarme_como_parroco(uuid);

-- Un superadmin no puede tener parroquia.
create function trg_perfil_creador() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parroquia_id is not null and exists (select 1 from superadmins where id = new.id) then
    raise exception 'La cuenta de Creador no puede pertenecer a una parroquia.';
  end if;
  return new;
end $$;
create trigger perfiles_creador before insert or update of parroquia_id on perfiles
  for each row execute function trg_perfil_creador();

-- Nunca dejar una parroquia sin un párroco activo (la cuenta de Creador no pertenece a ninguna).
create or replace function proteger_ultimo_parroco() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.parroquia_id is not null
     and old.rol = 'parroco' and old.activo and (new.rol <> 'parroco' or not new.activo)
     and not exists (select 1 from perfiles where parroquia_id = old.parroquia_id and rol = 'parroco' and activo and id <> old.id) then
    raise exception 'Debe existir al menos un párroco activo';
  end if;
  return new;
end $$;

-- Si se cambia el correo de una cuenta en Authentication, el perfil (que se muestra en las listas) lo copia.
create function handle_email_cambiado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update perfiles set email = new.email where id = new.id and email is distinct from new.email;
  return null;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function handle_email_cambiado();
