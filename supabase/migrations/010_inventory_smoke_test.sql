-- VALTEC — smoke test transacional do estoque
-- Não deixa dados persistidos. Se qualquer premissa falhar, a migration aborta.

do $$
declare
  v_part_id uuid := gen_random_uuid();
  v_order_id uuid := gen_random_uuid();
  v_item_one uuid;
  v_item_two uuid;
  v_stock numeric;
  v_parts_cost numeric;
  v_parts_amount numeric;
  v_total_amount numeric;
  v_failed_negative boolean := false;
begin
  insert into public.parts_catalog(
    id, name, category, purchase_price, sale_price, stock_qty, min_stock, active
  ) values (
    v_part_id, '__VALTEC_SMOKE_TEST__', 'Teste interno', 10, 25, 5, 1, false
  );

  insert into public.service_orders(
    id, equipment, labor_amount, parts_amount, total_amount, status
  ) values (
    v_order_id, '__VALTEC_SMOKE_TEST__', 50, 0, 50, 'aberto'
  );

  perform public.record_inventory_movement(
    v_part_id, 'entrada', 2, 11, null, null, 'Smoke test: entrada'
  );

  select stock_qty into v_stock from public.parts_catalog where id = v_part_id;
  if v_stock <> 7 then raise exception 'Smoke test falhou na entrada'; end if;

  select public.consume_part_for_service(v_order_id, v_part_id, 2, 11, 25, 'Smoke test: primeiro consumo') into v_item_one;
  select stock_qty into v_stock from public.parts_catalog where id = v_part_id;
  select parts_cost, parts_amount, total_amount into v_parts_cost, v_parts_amount, v_total_amount from public.service_orders where id = v_order_id;
  if v_stock <> 5 or v_parts_cost <> 22 or v_parts_amount <> 50 or v_total_amount <> 100 then raise exception 'Smoke test falhou no primeiro consumo'; end if;

  select public.consume_part_for_service(v_order_id, v_part_id, 1, 12, 30, 'Smoke test: segundo consumo') into v_item_two;
  select stock_qty into v_stock from public.parts_catalog where id = v_part_id;
  select parts_cost, parts_amount, total_amount into v_parts_cost, v_parts_amount, v_total_amount from public.service_orders where id = v_order_id;
  if v_stock <> 4 or v_parts_cost <> 34 or v_parts_amount <> 80 or v_total_amount <> 130 then raise exception 'Smoke test falhou no segundo consumo'; end if;

  begin
    perform public.record_inventory_movement(v_part_id, 'saida', 999, 0, null, null, 'Smoke test: saída inválida');
  exception when others then
    if position('Estoque insuficiente' in sqlerrm) > 0 then v_failed_negative := true; else raise; end if;
  end;
  if not v_failed_negative then raise exception 'Smoke test falhou: estoque negativo não foi bloqueado'; end if;

  if not public.remove_service_order_part(v_item_one) then raise exception 'Smoke test falhou no estorno'; end if;
  select stock_qty into v_stock from public.parts_catalog where id = v_part_id;
  select parts_cost, parts_amount, total_amount into v_parts_cost, v_parts_amount, v_total_amount from public.service_orders where id = v_order_id;
  if v_stock <> 6 or v_parts_cost <> 12 or v_parts_amount <> 30 or v_total_amount <> 80 then raise exception 'Smoke test falhou após estorno'; end if;

  delete from public.inventory_movements where part_id = v_part_id;
  delete from public.service_order_parts where service_order_id = v_order_id;
  delete from public.service_orders where id = v_order_id;
  delete from public.parts_catalog where id = v_part_id;

  if exists (select 1 from public.parts_catalog where id = v_part_id)
     or exists (select 1 from public.service_orders where id = v_order_id)
     or exists (select 1 from public.inventory_movements where part_id = v_part_id)
     or exists (select 1 from public.service_order_parts where service_order_id = v_order_id) then
    raise exception 'Smoke test falhou na limpeza';
  end if;
end;
$$;