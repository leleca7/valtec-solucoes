-- Autoriza o e-mail administrativo inicial e cria o perfil de admin no primeiro login.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_allowlist (
  email text primary key,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into private.admin_allowlist (email, display_name, active)
values ('vl.valdemir7@gmail.com', 'Valdemir', true)
on conflict (email) do update
set display_name = excluded.display_name,
    active = excluded.active;

create or replace function private.bootstrap_admin_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from private.admin_allowlist a
    where lower(a.email) = lower(new.email)
      and a.active = true
  ) then
    insert into public.admin_profiles (user_id, display_name, active)
    select new.id, a.display_name, true
    from private.admin_allowlist a
    where lower(a.email) = lower(new.email)
      and a.active = true
    on conflict (user_id) do update
      set display_name = excluded.display_name,
          active = true;
  end if;
  return new;
end;
$$;

revoke execute on function private.bootstrap_admin_profile() from public, anon, authenticated;

drop trigger if exists on_valtec_admin_user_created on auth.users;
create trigger on_valtec_admin_user_created
after insert on auth.users
for each row execute function private.bootstrap_admin_profile();

insert into public.admin_profiles (user_id, display_name, active)
select u.id, a.display_name, true
from auth.users u
join private.admin_allowlist a on lower(a.email) = lower(u.email)
where a.active = true
on conflict (user_id) do update
set display_name = excluded.display_name,
    active = true;
