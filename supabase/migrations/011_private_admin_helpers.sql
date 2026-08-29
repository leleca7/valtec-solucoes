-- VALTEC — hardening dos helpers de autorização administrativa
-- Mantém SECURITY DEFINER para evitar recursão de RLS em admin_profiles,
-- mas remove as funções do schema public exposto pela Data API.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create or replace function private.is_valtec_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = (select auth.uid())
      and active = true
  );
$$;

create or replace function private.is_valtec_marketing_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = (select auth.uid())
      and active = true
      and role = 'marketing_admin'
  );
$$;

revoke all on function private.is_valtec_admin() from public;
revoke all on function private.is_valtec_admin() from anon;
revoke all on function private.is_valtec_marketing_admin() from public;
revoke all on function private.is_valtec_marketing_admin() from anon;
grant execute on function private.is_valtec_admin() to authenticated;
grant execute on function private.is_valtec_marketing_admin() to authenticated;

alter policy "admins manage audit log"
on public.admin_audit_log
using ((select private.is_valtec_admin()))
with check ((select private.is_valtec_admin()));

alter policy "admins can read team profiles"
on public.admin_profiles
using ((select private.is_valtec_admin()));

alter policy "admins can update team profiles"
on public.admin_profiles
using ((select private.is_valtec_admin()))
with check ((select private.is_valtec_admin()));

alter policy "marketing admin can read team"
on public.admin_profiles
using ((select private.is_valtec_marketing_admin()));

alter policy "admins manage expenses"
on public.expenses
using ((select private.is_valtec_admin()))
with check ((select private.is_valtec_admin()));

alter policy "admins manage image assets"
on public.image_assets
using ((select private.is_valtec_admin()))
with check ((select private.is_valtec_admin()));

alter policy "admins manage parts catalog"
on public.parts_catalog
using ((select private.is_valtec_admin()))
with check ((select private.is_valtec_admin()));

alter policy "admins manage receipts"
on public.receipts
using ((select private.is_valtec_admin()))
with check ((select private.is_valtec_admin()));

alter policy "admins manage site settings"
on public.site_settings
using ((select private.is_valtec_admin()))
with check ((select private.is_valtec_admin()));

alter policy "admins manage warranties"
on public.warranties
using ((select private.is_valtec_admin()))
with check ((select private.is_valtec_admin()));

alter policy "valtec admins delete media"
on storage.objects
using ((bucket_id = 'valtec-media'::text) and (select private.is_valtec_admin()));

alter policy "valtec admins update media"
on storage.objects
using ((bucket_id = 'valtec-media'::text) and (select private.is_valtec_admin()))
with check ((bucket_id = 'valtec-media'::text) and (select private.is_valtec_admin()));

alter policy "valtec admins upload media"
on storage.objects
with check ((bucket_id = 'valtec-media'::text) and (select private.is_valtec_admin()));

revoke all on function public.is_valtec_admin() from public;
revoke all on function public.is_valtec_admin() from anon;
revoke all on function public.is_valtec_admin() from authenticated;
revoke all on function public.is_valtec_marketing_admin() from public;
revoke all on function public.is_valtec_marketing_admin() from anon;
revoke all on function public.is_valtec_marketing_admin() from authenticated;

drop function public.is_valtec_admin();
drop function public.is_valtec_marketing_admin();

comment on function private.is_valtec_admin() is 'Helper privado de RLS para validar administrador ativo sem expor RPC no schema public.';
comment on function private.is_valtec_marketing_admin() is 'Helper privado de RLS para validar perfil marketing_admin ativo sem expor RPC no schema public.';
