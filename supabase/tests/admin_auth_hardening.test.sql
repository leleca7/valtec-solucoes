-- Execute somente em um projeto Supabase local/isolado, após aplicar as migrations.
-- Não cria usuários, não insere dados de negócio e não consulta registros de clientes.
begin;

do $$
declare
  protected_table text;
  tables text[] := array[
    'admin_profiles', 'clients', 'leads', 'service_orders', 'quotes',
    'quote_items', 'receipts', 'expenses', 'parts_catalog', 'admin_audit_log',
    'business_accounts', 'business_assets', 'technicians', 'technician_skills',
    'whatsapp_threads', 'whatsapp_messages', 'inventory_movements',
    'service_order_parts', 'warranties', 'site_settings'
  ];
begin
  foreach protected_table in array tables loop
    if to_regclass(format('public.%I', protected_table)) is null then
      raise exception 'Tabela esperada ausente no banco isolado: public.%', protected_table;
    end if;
    if not (
      select c.relrowsecurity
      from pg_class c
      where c.oid = to_regclass(format('public.%I', protected_table))
    ) then
      raise exception 'RLS não está habilitado em public.%', protected_table;
    end if;
    if has_table_privilege('anon', format('public.%I', protected_table), 'SELECT') then
      raise exception 'Papel anon possui SELECT direto em public.%', protected_table;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.admin_profiles', 'INSERT')
     or has_table_privilege('authenticated', 'public.admin_profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.admin_profiles', 'DELETE') then
    raise exception 'O papel authenticated ainda consegue gravar admin_profiles';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_profiles'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'Há policy permissiva de escrita em admin_profiles';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'RLS não está habilitado em storage.objects';
  end if;

  if exists (
    select 1 from storage.buckets
    where id in ('lead-media', 'valtec-media')
      and public = true
  ) then
    raise exception 'Bucket de mídia administrativa não está privado';
  end if;
end;
$$;

-- Simula uma sessão authenticated sem perfil: RLS deve retornar zero linhas.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

do $$
declare
  row_count bigint;
begin
  select count(*) into row_count from public.clients;
  if row_count <> 0 then
    raise exception 'Usuário sem perfil conseguiu ler clientes';
  end if;
  select count(*) into row_count from public.admin_profiles;
  if row_count <> 0 then
    raise exception 'Usuário sem perfil conseguiu ler perfis administrativos';
  end if;
end;
$$;

rollback;
