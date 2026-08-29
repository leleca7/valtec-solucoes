-- VALTEC — smoke test integrado da Release Candidate
-- Valida o fluxo operacional completo sem deixar dados persistidos.

do $$
declare
  v_tag text := '__VALTEC_RELEASE_SMOKE__';
  v_lead_id uuid := gen_random_uuid();
  v_client_id uuid := gen_random_uuid();
  v_business_id uuid := gen_random_uuid();
  v_asset_id uuid := gen_random_uuid();
  v_technician_id uuid := gen_random_uuid();
  v_supplier_id uuid := gen_random_uuid();
  v_part_id uuid := gen_random_uuid();
  v_order_id uuid := gen_random_uuid();
  v_quote_id uuid := gen_random_uuid();
  v_receipt_id uuid := gen_random_uuid();
  v_warranty_id uuid := gen_random_uuid();
  v_item_id uuid;
  v_stock numeric;
  v_parts_cost numeric;
  v_parts_amount numeric;
  v_total_amount numeric;
  v_revenue numeric;
  v_variable_cost numeric;
  v_margin numeric;
  v_receivable numeric;
  v_count integer;
begin
  insert into public.leads(
    id, customer_name, phone, equipment, problems, description, neighborhood,
    source, status, urgency, next_action, next_action_at, contacted_at
  ) values (
    v_lead_id, v_tag || ' LEAD', '71999990000', 'Fogão teste', array['Não acende'],
    'Registro temporário do smoke test integrado', 'Teste', 'manual', 'contato_realizado',
    'alta', 'Preparar orçamento', now() + interval '1 hour', now()
  );

  insert into public.clients(
    id, name, phone, neighborhood, notes, source
  ) values (
    v_client_id, v_tag || ' CLIENTE', '71999990000', 'Teste',
    'Registro temporário do smoke test integrado', 'manual'
  );

  update public.leads
  set client_id = v_client_id,
      status = 'agendado',
      converted_at = now(),
      updated_at = now()
  where id = v_lead_id;

  insert into public.business_accounts(
    id, client_id, name, segment, contact_name, phone, status,
    next_action, next_action_at, preventive_frequency_days, monthly_value,
    contract_status, contract_start, assigned_technician, next_visit_at, notes
  ) values (
    v_business_id, v_client_id, v_tag || ' EMPRESA', 'Teste', 'Contato teste',
    '71999990000', 'cliente', 'Revisar preventiva', now() + interval '30 days',
    90, 300, 'ativo', current_date, 'Técnico teste', now() + interval '90 days',
    'Registro temporário do smoke test integrado'
  );

  insert into public.business_assets(
    id, business_id, equipment_type, brand, model, quantity, condition,
    next_preventive_at, notes
  ) values (
    v_asset_id, v_business_id, 'Fogão industrial', 'Marca teste', 'Modelo teste',
    1, 'operacional', now() + interval '90 days',
    'Registro temporário do smoke test integrado'
  );

  insert into public.technicians(
    id, name, status, career_level, autonomy_level, can_work_solo, route_ready,
    start_date, notes, active
  ) values (
    v_technician_id, v_tag || ' TECNICO', 'ativo', 'tecnico', 'autonomo', true, true,
    current_date, 'Registro temporário do smoke test integrado', true
  );

  insert into public.suppliers(
    id, name, contact_name, active, notes
  ) values (
    v_supplier_id, v_tag || ' FORNECEDOR', 'Contato teste', true,
    'Registro temporário do smoke test integrado'
  );

  insert into public.parts_catalog(
    id, name, category, purchase_price, sale_price, stock_qty, min_stock,
    active, preferred_supplier_id, storage_location
  ) values (
    v_part_id, v_tag || ' PECA', 'Teste interno', 20, 40, 0, 1,
    false, v_supplier_id, 'TESTE'
  );

  perform public.record_inventory_movement(
    v_part_id, 'entrada', 3, 20, v_supplier_id, null,
    'Release smoke: entrada'
  );

  select stock_qty into v_stock
  from public.parts_catalog where id = v_part_id;
  if v_stock <> 3 then
    raise exception 'Release smoke falhou: estoque após entrada esperado 3, recebeu %', v_stock;
  end if;

  insert into public.service_orders(
    id, client_id, lead_id, equipment, problem, service_description, status,
    scheduled_for, order_number, diagnosis, parts_amount, labor_amount,
    total_amount, payment_status, payment_method, warranty_days,
    equipment_brand, equipment_model, assigned_technician, service_type,
    priority, started_at, technician_minutes, discount_amount, parts_cost,
    consumables_cost, travel_cost, payment_fee, warranty_rework_cost,
    other_variable_cost, amount_received, payment_due_at, founder_executed,
    completion_notes, business_account_id, business_asset_id, technician_id
  ) values (
    v_order_id, v_client_id, v_lead_id, 'Fogão industrial teste', 'Não acende',
    'Diagnóstico e reparo de teste', 'concluido', now(), 'SMOKE-001',
    'Diagnóstico temporário', 0, 100, 100, 'parcial', 'pix', 90,
    'Marca teste', 'Modelo teste', v_tag || ' TECNICO', 'corretiva', 'normal',
    now(), 60, 10, 0, 5, 10, 2, 0, 3, 80, now() + interval '7 days',
    false, 'Concluído no smoke test', v_business_id, v_asset_id, v_technician_id
  );

  select public.consume_part_for_service(
    v_order_id, v_part_id, 1, 20, 40,
    'Release smoke: consumo'
  ) into v_item_id;

  select stock_qty into v_stock
  from public.parts_catalog where id = v_part_id;

  select parts_cost, parts_amount, total_amount
  into v_parts_cost, v_parts_amount, v_total_amount
  from public.service_orders where id = v_order_id;

  if v_stock <> 2 or v_parts_cost <> 20 or v_parts_amount <> 40 or v_total_amount <> 140 then
    raise exception 'Release smoke falhou no estoque/OS: estoque %, custo %, venda %, total %',
      v_stock, v_parts_cost, v_parts_amount, v_total_amount;
  end if;

  insert into public.quotes(
    id, client_id, lead_id, service_order_id, title, parts_total,
    labor_amount, original_total, negotiated_total, status, quote_number, notes
  ) values (
    v_quote_id, v_client_id, v_lead_id, v_order_id, v_tag || ' ORCAMENTO',
    40, 100, 140, 130, 'aprovado', 'SMOKE-Q-001',
    'Registro temporário do smoke test integrado'
  );

  insert into public.receipts(
    id, client_id, service_order_id, receipt_number, client_name, amount,
    service_description, payment_method, issued_at
  ) values (
    v_receipt_id, v_client_id, v_order_id, 'SMOKE-R-001', v_tag || ' CLIENTE',
    80, 'Pagamento parcial de teste', 'pix', current_date
  );

  insert into public.warranties(
    id, client_id, service_order_id, starts_at, ends_at, notes, status
  ) values (
    v_warranty_id, v_client_id, v_order_id, current_date, current_date + 90,
    'Garantia temporária do smoke test integrado', 'ativa'
  );

  update public.leads
  set status = 'finalizado',
      next_action = null,
      next_action_at = null,
      updated_at = now()
  where id = v_lead_id;

  select
    coalesce(parts_amount,0) + coalesce(labor_amount,0) - coalesce(discount_amount,0),
    coalesce(parts_cost,0) + coalesce(consumables_cost,0) + coalesce(travel_cost,0)
      + coalesce(payment_fee,0) + coalesce(warranty_rework_cost,0)
      + coalesce(other_variable_cost,0),
    (coalesce(parts_amount,0) + coalesce(labor_amount,0) - coalesce(discount_amount,0))
      - (coalesce(parts_cost,0) + coalesce(consumables_cost,0) + coalesce(travel_cost,0)
      + coalesce(payment_fee,0) + coalesce(warranty_rework_cost,0)
      + coalesce(other_variable_cost,0)),
    (coalesce(parts_amount,0) + coalesce(labor_amount,0) - coalesce(discount_amount,0))
      - coalesce(amount_received,0)
  into v_revenue, v_variable_cost, v_margin, v_receivable
  from public.service_orders where id = v_order_id;

  if v_revenue <> 130 or v_variable_cost <> 40 or v_margin <> 90 or v_receivable <> 50 then
    raise exception 'Release smoke falhou no financeiro: receita %, custo %, margem %, a receber %',
      v_revenue, v_variable_cost, v_margin, v_receivable;
  end if;

  if not exists (
    select 1 from public.service_orders
    where id = v_order_id
      and client_id = v_client_id
      and lead_id = v_lead_id
      and business_account_id = v_business_id
      and business_asset_id = v_asset_id
      and technician_id = v_technician_id
      and founder_executed = false
  ) then
    raise exception 'Release smoke falhou: vínculos estruturados da OS não foram preservados';
  end if;

  if not exists (
    select 1 from public.quotes
    where id = v_quote_id
      and client_id = v_client_id
      and lead_id = v_lead_id
      and service_order_id = v_order_id
      and status = 'aprovado'
  ) then
    raise exception 'Release smoke falhou: orçamento não ficou ligado ao fluxo completo';
  end if;

  select
    (select count(*) from public.service_orders where client_id = v_client_id)
    + (select count(*) from public.quotes where client_id = v_client_id)
    + (select count(*) from public.receipts where client_id = v_client_id)
    + (select count(*) from public.warranties where client_id = v_client_id and status = 'ativa')
  into v_count;

  if v_count <> 4 then
    raise exception 'Release smoke falhou: Cliente 360 esperava 4 entidades relacionadas, recebeu %', v_count;
  end if;

  if not exists (
    select 1 from public.business_accounts
    where id = v_business_id
      and client_id = v_client_id
      and contract_status = 'ativo'
      and monthly_value = 300
  ) then
    raise exception 'Release smoke falhou: vínculo B2B/receita recorrente inválido';
  end if;

  if not exists (
    select 1 from public.technicians
    where id = v_technician_id
      and active = true
      and can_work_solo = true
      and route_ready = true
  ) then
    raise exception 'Release smoke falhou: técnico autônomo/rota não foi persistido';
  end if;

  if not exists (
    select 1 from public.admin_audit_log
    where entity_type = 'service_orders'
      and entity_id = v_order_id::text
  ) then
    raise exception 'Release smoke falhou: auditoria automática não registrou a OS';
  end if;

  -- Limpeza em ordem segura de foreign keys.
  delete from public.inventory_movements where part_id = v_part_id or service_order_id = v_order_id;
  delete from public.service_order_parts where service_order_id = v_order_id;
  delete from public.receipts where id = v_receipt_id;
  delete from public.warranties where id = v_warranty_id;
  delete from public.quotes where id = v_quote_id;
  delete from public.service_orders where id = v_order_id;
  delete from public.business_assets where id = v_asset_id;
  delete from public.business_accounts where id = v_business_id;
  delete from public.technicians where id = v_technician_id;
  delete from public.parts_catalog where id = v_part_id;
  delete from public.suppliers where id = v_supplier_id;
  delete from public.leads where id = v_lead_id;
  delete from public.clients where id = v_client_id;

  delete from public.admin_audit_log
  where entity_id in (
    v_lead_id::text,
    v_client_id::text,
    v_business_id::text,
    v_asset_id::text,
    v_technician_id::text,
    v_supplier_id::text,
    v_part_id::text,
    v_order_id::text,
    v_quote_id::text,
    v_receipt_id::text,
    v_warranty_id::text,
    v_item_id::text
  );

  if exists (select 1 from public.leads where id = v_lead_id)
    or exists (select 1 from public.clients where id = v_client_id)
    or exists (select 1 from public.business_accounts where id = v_business_id)
    or exists (select 1 from public.business_assets where id = v_asset_id)
    or exists (select 1 from public.technicians where id = v_technician_id)
    or exists (select 1 from public.suppliers where id = v_supplier_id)
    or exists (select 1 from public.parts_catalog where id = v_part_id)
    or exists (select 1 from public.service_orders where id = v_order_id)
    or exists (select 1 from public.quotes where id = v_quote_id)
    or exists (select 1 from public.receipts where id = v_receipt_id)
    or exists (select 1 from public.warranties where id = v_warranty_id)
    or exists (select 1 from public.inventory_movements where part_id = v_part_id or service_order_id = v_order_id)
    or exists (select 1 from public.service_order_parts where service_order_id = v_order_id)
    or exists (select 1 from public.admin_audit_log where entity_id in (
      v_lead_id::text, v_client_id::text, v_business_id::text, v_asset_id::text,
      v_technician_id::text, v_supplier_id::text, v_part_id::text, v_order_id::text,
      v_quote_id::text, v_receipt_id::text, v_warranty_id::text, v_item_id::text
    )) then
    raise exception 'Release smoke falhou: limpeza dos dados temporários incompleta';
  end if;
end;
$$;
