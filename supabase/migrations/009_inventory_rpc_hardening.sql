-- VALTEC — correção e hardening das funções de estoque
-- Recalcula custo e venda de peças a cada consumo/estorno e restringe execução a usuários autenticados.

create or replace function public.consume_part_for_service(
  p_service_order_id uuid,
  p_part_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_unit_sale_price numeric default 0,
  p_note text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item_id uuid;
  v_stock numeric;
  v_parts_cost numeric;
  v_parts_sale numeric;
begin
  if coalesce(p_quantity,0) <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;
  select coalesce(stock_qty,0) into v_stock from public.parts_catalog where id = p_part_id for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_stock < p_quantity then raise exception 'Estoque insuficiente'; end if;
  insert into public.service_order_parts(service_order_id, part_id, quantity, unit_cost, unit_sale_price, note)
  values (p_service_order_id, p_part_id, p_quantity, coalesce(p_unit_cost,0), coalesce(p_unit_sale_price,0), p_note)
  returning id into v_item_id;
  update public.parts_catalog set stock_qty = v_stock - p_quantity, updated_at = now() where id = p_part_id;
  insert into public.inventory_movements(part_id, service_order_id, movement_type, quantity, unit_cost, note)
  values (p_part_id, p_service_order_id, 'saida', p_quantity, coalesce(p_unit_cost,0), coalesce(p_note,'Consumo em ordem de serviço'));
  select coalesce(sum(quantity * unit_cost),0), coalesce(sum(quantity * unit_sale_price),0)
    into v_parts_cost, v_parts_sale
  from public.service_order_parts where service_order_id = p_service_order_id;
  update public.service_orders
  set parts_cost = v_parts_cost, parts_amount = v_parts_sale, total_amount = v_parts_sale + coalesce(labor_amount,0), updated_at = now()
  where id = p_service_order_id;
  return v_item_id;
end;
$$;

create or replace function public.remove_service_order_part(p_item_id uuid) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.service_order_parts%rowtype;
  v_stock numeric;
  v_parts_cost numeric;
  v_parts_sale numeric;
begin
  select * into v_item from public.service_order_parts where id = p_item_id for update;
  if not found then return false; end if;
  select coalesce(stock_qty,0) into v_stock from public.parts_catalog where id = v_item.part_id for update;
  update public.parts_catalog set stock_qty = v_stock + v_item.quantity, updated_at = now() where id = v_item.part_id;
  insert into public.inventory_movements(part_id, service_order_id, movement_type, quantity, unit_cost, note)
  values (v_item.part_id, v_item.service_order_id, 'ajuste_entrada', v_item.quantity, v_item.unit_cost, 'Estorno de peça da ordem de serviço');
  delete from public.service_order_parts where id = p_item_id;
  select coalesce(sum(quantity * unit_cost),0), coalesce(sum(quantity * unit_sale_price),0)
    into v_parts_cost, v_parts_sale
  from public.service_order_parts where service_order_id = v_item.service_order_id;
  update public.service_orders
  set parts_cost = v_parts_cost, parts_amount = v_parts_sale, total_amount = v_parts_sale + coalesce(labor_amount,0), updated_at = now()
  where id = v_item.service_order_id;
  return true;
end;
$$;

revoke execute on function public.record_inventory_movement(uuid,text,numeric,numeric,uuid,uuid,text) from public;
revoke execute on function public.record_inventory_movement(uuid,text,numeric,numeric,uuid,uuid,text) from anon;
revoke execute on function public.consume_part_for_service(uuid,uuid,numeric,numeric,numeric,text) from public;
revoke execute on function public.consume_part_for_service(uuid,uuid,numeric,numeric,numeric,text) from anon;
revoke execute on function public.remove_service_order_part(uuid) from public;
revoke execute on function public.remove_service_order_part(uuid) from anon;

grant execute on function public.record_inventory_movement(uuid,text,numeric,numeric,uuid,uuid,text) to authenticated;
grant execute on function public.consume_part_for_service(uuid,uuid,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.remove_service_order_part(uuid) to authenticated;