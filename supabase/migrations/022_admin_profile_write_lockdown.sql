-- VALTEC — bloqueio de autoelevação e alterações diretas de perfis administrativos
-- Esta migration não altera registros existentes nem escolhe a matriz de acesso por módulo.
-- Até o proprietário aprovar quem pode gerenciar cargos/ativação, a Data API não pode gravar admin_profiles.
begin;

alter table public.admin_profiles enable row level security;

revoke all privileges on table public.admin_profiles from public, anon, authenticated;
grant select on table public.admin_profiles to authenticated;

drop policy if exists "admins can update team profiles" on public.admin_profiles;
drop policy if exists "admins can insert team profiles" on public.admin_profiles;
drop policy if exists "admins can delete team profiles" on public.admin_profiles;
drop policy if exists "admins manage team profiles" on public.admin_profiles;

comment on table public.admin_profiles is
  'Perfis administrativos Valtec. A leitura permanece sob RLS; gravações de cargo/ativação exigem um fluxo server-side autorizado, ainda não habilitado nesta release.';

commit;
