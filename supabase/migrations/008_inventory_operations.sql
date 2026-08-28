-- VALTEC — estoque, fornecedores e consumo de peças por OS
-- Validar o tipo de parts_catalog.id no banco antes de aplicar esta migration.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.parts_catalog
  add column if not exists preferred_supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists storage_location text,
  add column if not exists last_purchase_cost numeric(12,2);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts_catalog(id) on delete restrict,
  service_order_id uuid references public.service_orders(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  movement_type text not null check (movement_type in ('entrada','saida','ajuste_entrada','ajuste_saida')),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.service_order_parts (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  part_id uuid not null references public.parts_catalog(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  unit_sale_price numeric(12,2) not null default 0 check (unit_sale_price >= 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_part_idx on public.inventory_movements(part_id, occurred_at desc);
create index if not exists inventory_movements_order_idx on public.inventory_movements(service_order_id) where service_order_id is not null;
create index if not exists inventory_movements_supplier_idx on public.inventory_movements(supplier_id) where supplier_id is not null;
create index if not exists service_order_parts_order_idx on public.service_order_parts(service_order_id);
create index if not exists service_order_parts_part_idx on public.service_order_parts(part_id);
create index if not exists parts_catalog_preferred_supplier_idx on public.parts_catalog(preferred_supplier_id) where preferred_supplier_id is not null;

grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update, delete on public.inventory_movements to authenticated;
grant select, insert, update, delete on public.service_order_parts to authenticated;

alter table public.suppliers enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.service_order_parts enable row level security;

drop policy if exists "admins manage suppliers" on public.suppliers;
create policy "admins manage suppliers" on public.suppliers
for all to authenticated
using (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true))
with check (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true));

drop policy if exists "admins manage inventory movements" on public.inventory_movements;
create policy "admins manage inventory movements" on public.inventory_movements
for all to authenticated
using (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true))
with check (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true));

drop policy if exists "admins manage service order parts" on public.service_order_parts;
create policy "admins manage service order parts" on public.service_order_parts
for all to authenticated
using (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true))
with check (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true));

create or replace function public.record_inventory_movement(
  p_part_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_unit_cost numeric default 0,
  p_supplier_id uuid default null,
  p_service_order_id uuid default null,
  p_note text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current_stock numeric;
  v_delta numeric;
  v_id uuid;
begin
  if p_movement_type not in ('entrada','saida','ajuste_entrada','ajuste_saida') then
    raise exception 'Tipo de movimento inválido';
  end if;
  if coalesce(p_quantity,0) <= 0 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;

  select coalesce(stock_qty,0) into v_current_stock
  from public.parts_catalog
  where id = p_part_id
  for update;

  if not found then raise exception 'Peça não encontrada'; end if;

  v_delta := case when p_movement_type in ('entrada','ajuste_entrada') then p_quantity else -p_quantity end;
  if v_current_stock + v_delta < 0 then
    raise exception 'Estoque insuficiente';
  end if;

  update public.parts_catalog
  set stock_qty = v_current_stock + v_delta,
      last_purchase_cost = case when p_movement_type = 'entrada' and coalesce(p_unit_cost,0) > 0 then p_unit_cost else last_purchase_cost end,
      updated_at = now()
  where id = p_part_id;

  insert into public.inventory_movements(part_id, service_order_id, supplier_id, movement_type, quantity, unit_cost, note)
  values (p_part_id, p_service_order_id, p_supplier_id, p_movement_type, p_quantity, coalesce(p_unit_cost,0), p_note)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.record_inventory_movement(uuid,text,numeric,numeric,uuid,uuid,text) to authenticated;

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

  select coalesce(stock_qty,0) into v_stock
  from public.parts_catalog
  where id = p_part_id
  for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_stock < p_quantity then raise exception 'Estoque insuficiente'; end if;

  insert into public.service_order_parts(service_order_id, part_id, quantity, unit_cost, unit_sale_price, note)
  values (p_service_order_id, p_part_id, p_quantity, coalesce(p_unit_cost,0), coalesce(p_unit_sale_price,0), p_note)
  returning id into v_item_id;

  update public.parts_catalog
  set stock_qty = v_stock - p_quantity, updated_at = now()
  where id = p_part_id;

  insert into public.inventory_movements(part_id, service_order_id, movement_type, quantity, unit_cost, note)
  values (p_part_id, p_service_order_id, 'saida', p_quantity, coalesce(p_unit_cost,0), coalesce(p_note,'Consumo em ordem de serviço'));

  select coalesce(sum(quantity * unit_cost),0), coalesce(sum(quantity * unit_sale_price),0)
  into v_parts_cost, v_parts_sale
  from public.service_order_parts
  where service_order_id = p_service_order_id;

  update public.service_orders
  set parts_cost = v_parts_cost,
      parts_amount = case when coalesce(parts_amount,0) = 0 then v_parts_sale else parts_amount end,
      updated_at = now()
  where id = p_service_order_id;

  return v_item_id;
end;
$$;

grant execute on function public.consume_part_for_service(uuid,uuid,numeric,numeric,numeric,text) to authenticated;

create or replace function public.remove_service_order_part(p_item_id uuid) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.service_order_parts%rowtype;
  v_stock numeric;
  v_parts_cost numeric;
begin
  select * into v_item from public.service_order_parts where id = p_item_id for update;
  if not found then return false; end if;

  select coalesce(stock_qty,0) into v_stock from public.parts_catalog where id = v_item.part_id for update;
  update public.parts_catalog set stock_qty = v_stock + v_item.quantity, updated_at = now() where id = v_item.part_id;

  insert into public.inventory_movements(part_id, service_order_id, movement_type, quantity, unit_cost, note)
  values (v_item.part_id, v_item.service_order_id, 'ajuste_entrada', v_item.quantity, v_item.unit_cost, 'Estorno de peça da ordem de serviço');

  delete from public.service_order_parts where id = p_item_id;

  select coalesce(sum(quantity * unit_cost),0) into v_parts_cost
  from public.service_order_parts where service_order_id = v_item.service_order_id;
  update public.service_orders set parts_cost = v_parts_cost, updated_at = now() where id = v_item.service_order_id;

  return true;
end;
$$;

grant execute on function public.remove_service_order_part(uuid) to authenticated;

comment on table public.inventory_movements is 'Livro de entradas, saídas e ajustes de estoque. O saldo do catálogo não deve ser alterado sem registro de movimento após ativação deste módulo.';
comment on table public.service_order_parts is 'Peças efetivamente consumidas em cada OS, com custo e preço praticado no atendimento.';
