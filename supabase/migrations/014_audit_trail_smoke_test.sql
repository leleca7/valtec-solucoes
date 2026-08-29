-- VALTEC — smoke test da auditoria automática
-- Usa uma chave aleatória, valida INSERT/UPDATE/DELETE e limpa todos os registros de teste.

do $$
declare
  v_key text := '__VALTEC_AUDIT_SMOKE__' || gen_random_uuid()::text;
  v_count integer;
  v_update_ok boolean;
begin
  insert into public.site_settings(key, value, updated_at)
  values (v_key, '{"phase":1}'::jsonb, now());

  update public.site_settings
  set value = '{"phase":2}'::jsonb,
      updated_at = now()
  where key = v_key;

  delete from public.site_settings where key = v_key;

  select count(*) into v_count
  from public.admin_audit_log
  where entity_type = 'site_settings'
    and entity_id = v_key
    and action in ('criou','atualizou','excluiu');

  if v_count <> 3 then
    raise exception 'Smoke test de auditoria falhou: esperava 3 eventos, recebeu %', v_count;
  end if;

  select exists (
    select 1
    from public.admin_audit_log
    where entity_type = 'site_settings'
      and entity_id = v_key
      and action = 'atualizou'
      and details -> 'changed_fields' @> '["value"]'::jsonb
  ) into v_update_ok;

  if not v_update_ok then
    raise exception 'Smoke test de auditoria falhou: UPDATE não registrou o campo value';
  end if;

  if has_table_privilege('anon', 'public.admin_audit_log', 'SELECT') then
    raise exception 'Smoke test de auditoria falhou: anon ainda possui SELECT no log';
  end if;

  if has_table_privilege('authenticated', 'public.admin_audit_log', 'INSERT')
     or has_table_privilege('authenticated', 'public.admin_audit_log', 'UPDATE')
     or has_table_privilege('authenticated', 'public.admin_audit_log', 'DELETE') then
    raise exception 'Smoke test de auditoria falhou: authenticated ainda pode alterar o log diretamente';
  end if;

  if not has_table_privilege('authenticated', 'public.admin_audit_log', 'SELECT') then
    raise exception 'Smoke test de auditoria falhou: authenticated perdeu SELECT necessário para leitura administrativa';
  end if;

  delete from public.admin_audit_log
  where entity_type = 'site_settings' and entity_id = v_key;

  if exists (select 1 from public.site_settings where key = v_key)
     or exists (select 1 from public.admin_audit_log where entity_type = 'site_settings' and entity_id = v_key) then
    raise exception 'Smoke test de auditoria falhou: limpeza incompleta';
  end if;
end;
$$;
