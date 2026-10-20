-- Execute somente em Supabase local/isolado após aplicar migrations 001–024.
-- Sem usuários reais, dados de negócio ou conexão com produção.
-- Separa privilégios SQL (GRANT) do resultado efetivo das políticas RLS.
begin;
do $$
declare t text; tables text[] := array[
'admin_profiles','clients','leads','service_orders','quotes','quote_items','receipts','expenses','parts_catalog','admin_audit_log',
'business_accounts','business_assets','technicians','technician_skills','whatsapp_threads','whatsapp_messages','inventory_movements',
'service_order_parts','warranties','site_settings'];
begin
 foreach t in array tables loop
  if to_regclass(format('public.%I',t)) is null then raise exception 'Tabela ausente: public.%',t; end if;
  if not (select relrowsecurity from pg_class where oid=to_regclass(format('public.%I',t))) then raise exception 'RLS desabilitado: public.%',t; end if;
 end loop;
 if has_table_privilege('authenticated','public.admin_profiles','INSERT')
 or has_table_privilege('authenticated','public.admin_profiles','UPDATE')
 or has_table_privilege('authenticated','public.admin_profiles','DELETE') then
  raise exception 'authenticated tem GRANT de escrita em admin_profiles';
 end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename='admin_profiles' and cmd in ('INSERT','UPDATE','DELETE','ALL')) then
  raise exception 'Existe policy de escrita em admin_profiles; revisar mesmo sem GRANT';
 end if;
 if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then raise exception 'RLS desabilitado em storage.objects'; end if;
 if exists(select 1 from storage.buckets where id in ('lead-media','valtec-media') and public=true) then raise exception 'Bucket de mídia administrativa público'; end if;
end $$;

-- Anon: GRANT de SELECT, isoladamente, não significa exposição; teste o resultado real de RLS.
set local role anon;
do $$
declare t text; n bigint; tables text[] := array[
'admin_profiles','clients','leads','service_orders','quotes','quote_items','receipts','expenses','admin_audit_log',
'business_accounts','business_assets','technicians','technician_skills','whatsapp_threads','whatsapp_messages','inventory_movements','service_order_parts','warranties'];
begin
 foreach t in array tables loop
  if has_table_privilege(current_user,format('public.%I',t),'SELECT') then
   begin
    execute format('select count(*) from public.%I',t) into n;
    if n<>0 then raise exception 'anon leu % linha(s) de public.%',n,t; end if;
   exception when insufficient_privilege then null;
   end;
  end if;
 end loop;
end $$;

-- Authenticated sem perfil administrativo: mesmo teste de resultado de RLS.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare t text; n bigint; tables text[] := array[
'clients','leads','service_orders','quotes','quote_items','receipts','expenses','admin_audit_log',
'business_accounts','business_assets','technicians','technician_skills','whatsapp_threads','whatsapp_messages','inventory_movements','service_order_parts','warranties'];
begin
 select count(*) into n from public.admin_profiles;
 if n<>0 then raise exception 'Usuário sem perfil leu admin_profiles'; end if;
 foreach t in array tables loop
  if has_table_privilege(current_user,format('public.%I',t),'SELECT') then
   begin
    execute format('select count(*) from public.%I',t) into n;
    if n<>0 then raise exception 'Usuário sem perfil leu % linha(s) de public.%',n,t; end if;
   exception when insufficient_privilege then null;
   end;
  end if;
 end loop;
 if has_table_privilege(current_user,'public.admin_profiles','UPDATE')
 or has_table_privilege(current_user,'public.admin_profiles','INSERT')
 or has_table_privilege(current_user,'public.admin_profiles','DELETE') then
  raise exception 'Usuário sem perfil pode escrever em admin_profiles';
 end if;
end $$;
rollback;
