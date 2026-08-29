-- VALTEC — trilha de auditoria automática e append-only

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log(created_at desc);

create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log(actor_id, created_at desc)
  where actor_id is not null;

create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log(entity_type, entity_id, created_at desc);

create or replace function private.audit_valtec_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else '{}'::jsonb end;
  v_new jsonb := case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) else '{}'::jsonb end;
  v_record jsonb;
  v_entity_id text;
  v_action text;
  v_changed_fields jsonb := '[]'::jsonb;
  v_details jsonb := '{}'::jsonb;
begin
  if TG_OP = 'UPDATE' then
    select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
      into v_changed_fields
    from (
      select key
      from jsonb_object_keys(v_old || v_new) as keys(key)
      where key not in ('updated_at')
        and (v_old -> key) is distinct from (v_new -> key)
    ) changed;

    if jsonb_array_length(v_changed_fields) = 0 then
      return NEW;
    end if;
  end if;

  v_record := case when TG_OP = 'DELETE' then v_old else v_new end;
  v_entity_id := coalesce(v_record ->> 'id', v_record ->> 'user_id', v_record ->> 'key');
  v_action := case TG_OP
    when 'INSERT' then 'criou'
    when 'UPDATE' then 'atualizou'
    when 'DELETE' then 'excluiu'
    else lower(TG_OP)
  end;

  v_details := jsonb_build_object(
    'operation', lower(TG_OP),
    'table', TG_TABLE_NAME,
    'changed_fields', v_changed_fields
  );

  if (v_old ->> 'status') is distinct from (v_new ->> 'status') then
    v_details := v_details || jsonb_strip_nulls(jsonb_build_object(
      'status_before', v_old ->> 'status',
      'status_after', v_new ->> 'status'
    ));
  end if;

  if (v_old ->> 'payment_status') is distinct from (v_new ->> 'payment_status') then
    v_details := v_details || jsonb_strip_nulls(jsonb_build_object(
      'payment_status_before', v_old ->> 'payment_status',
      'payment_status_after', v_new ->> 'payment_status'
    ));
  end if;

  if (v_old ->> 'contract_status') is distinct from (v_new ->> 'contract_status') then
    v_details := v_details || jsonb_strip_nulls(jsonb_build_object(
      'contract_status_before', v_old ->> 'contract_status',
      'contract_status_after', v_new ->> 'contract_status'
    ));
  end if;

  if (v_old ->> 'autonomy_level') is distinct from (v_new ->> 'autonomy_level') then
    v_details := v_details || jsonb_strip_nulls(jsonb_build_object(
      'autonomy_before', v_old ->> 'autonomy_level',
      'autonomy_after', v_new ->> 'autonomy_level'
    ));
  end if;

  if (v_old ->> 'role') is distinct from (v_new ->> 'role') then
    v_details := v_details || jsonb_strip_nulls(jsonb_build_object(
      'role_before', v_old ->> 'role',
      'role_after', v_new ->> 'role'
    ));
  end if;

  if TG_TABLE_NAME = 'inventory_movements' then
    v_details := v_details || jsonb_strip_nulls(jsonb_build_object(
      'movement_type', v_record ->> 'movement_type'
    ));
  end if;

  insert into public.admin_audit_log(actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), v_action, TG_TABLE_NAME, v_entity_id, v_details);

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

revoke all on function private.audit_valtec_change() from public;
revoke all on function private.audit_valtec_change() from anon;
revoke all on function private.audit_valtec_change() from authenticated;

-- O histórico é leitura administrativa; inserts reais vêm exclusivamente dos triggers.
drop policy if exists "admins manage audit log" on public.admin_audit_log;
drop policy if exists "admins read audit log" on public.admin_audit_log;
create policy "admins read audit log"
on public.admin_audit_log
for select
to authenticated
using ((select private.is_valtec_admin()));

revoke all on public.admin_audit_log from anon;
revoke insert, update, delete, truncate on public.admin_audit_log from authenticated;
grant select on public.admin_audit_log to authenticated;

revoke all on sequence public.admin_audit_log_id_seq from anon;
revoke all on sequence public.admin_audit_log_id_seq from authenticated;

-- Remove e recria triggers de forma idempotente.
drop trigger if exists audit_clients on public.clients;
create trigger audit_clients after insert or update or delete on public.clients
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_leads on public.leads;
create trigger audit_leads after insert or update or delete on public.leads
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_quotes on public.quotes;
create trigger audit_quotes after insert or update or delete on public.quotes
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_quote_items on public.quote_items;
create trigger audit_quote_items after insert or update or delete on public.quote_items
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_service_orders on public.service_orders;
create trigger audit_service_orders after insert or update or delete on public.service_orders
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_receipts on public.receipts;
create trigger audit_receipts after insert or update or delete on public.receipts
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_warranties on public.warranties;
create trigger audit_warranties after insert or update or delete on public.warranties
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_expenses on public.expenses;
create trigger audit_expenses after insert or update or delete on public.expenses
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_parts_catalog on public.parts_catalog;
create trigger audit_parts_catalog after insert or update or delete on public.parts_catalog
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_site_settings on public.site_settings;
create trigger audit_site_settings after insert or update or delete on public.site_settings
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_admin_profiles on public.admin_profiles;
create trigger audit_admin_profiles after insert or update or delete on public.admin_profiles
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_business_accounts on public.business_accounts;
create trigger audit_business_accounts after insert or update or delete on public.business_accounts
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_business_assets on public.business_assets;
create trigger audit_business_assets after insert or update or delete on public.business_assets
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_technicians on public.technicians;
create trigger audit_technicians after insert or update or delete on public.technicians
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_technician_skills on public.technician_skills;
create trigger audit_technician_skills after insert or update or delete on public.technician_skills
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_suppliers on public.suppliers;
create trigger audit_suppliers after insert or update or delete on public.suppliers
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_inventory_movements on public.inventory_movements;
create trigger audit_inventory_movements after insert or update or delete on public.inventory_movements
for each row execute function private.audit_valtec_change();

drop trigger if exists audit_service_order_parts on public.service_order_parts;
create trigger audit_service_order_parts after insert or update or delete on public.service_order_parts
for each row execute function private.audit_valtec_change();
