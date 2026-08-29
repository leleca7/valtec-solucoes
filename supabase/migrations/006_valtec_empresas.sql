-- VALTEC Empresas — prospecção, preventiva e receita recorrente

create table if not exists public.business_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  document_number text,
  segment text,
  contact_name text,
  phone text,
  email text,
  address text,
  neighborhood text,
  status text not null default 'prospect',
  next_action text,
  next_action_at timestamptz,
  preventive_frequency_days integer,
  monthly_value numeric(12,2) not null default 0,
  contract_status text not null default 'sem_contrato',
  contract_start date,
  contract_end date,
  assigned_technician text,
  next_visit_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_accounts(id) on delete cascade,
  equipment_type text not null,
  brand text,
  model text,
  quantity integer not null default 1 check (quantity > 0),
  condition text,
  location_notes text,
  last_service_at timestamptz,
  next_preventive_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_orders
  add column if not exists business_account_id uuid references public.business_accounts(id) on delete set null,
  add column if not exists business_asset_id uuid references public.business_assets(id) on delete set null;

create index if not exists business_accounts_status_idx on public.business_accounts(status);
create index if not exists business_accounts_next_action_idx on public.business_accounts(next_action_at) where next_action_at is not null;
create index if not exists business_accounts_next_visit_idx on public.business_accounts(next_visit_at) where next_visit_at is not null;
create index if not exists business_accounts_client_idx on public.business_accounts(client_id) where client_id is not null;
create index if not exists business_assets_business_idx on public.business_assets(business_id);
create index if not exists business_assets_next_preventive_idx on public.business_assets(next_preventive_at) where next_preventive_at is not null;
create index if not exists service_orders_business_account_idx on public.service_orders(business_account_id) where business_account_id is not null;
create index if not exists service_orders_business_asset_idx on public.service_orders(business_asset_id) where business_asset_id is not null;

grant select, insert, update, delete on public.business_accounts to authenticated;
grant select, insert, update, delete on public.business_assets to authenticated;

alter table public.business_accounts enable row level security;
alter table public.business_assets enable row level security;

drop policy if exists "admins manage business accounts" on public.business_accounts;
create policy "admins manage business accounts" on public.business_accounts
for all to authenticated
using (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true))
with check (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true));

drop policy if exists "admins manage business assets" on public.business_assets;
create policy "admins manage business assets" on public.business_assets
for all to authenticated
using (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true))
with check (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true));

comment on table public.business_accounts is 'Empresas prospectadas e clientes B2B da Valtec.';
comment on table public.business_assets is 'Equipamentos/ativos técnicos vinculados a uma empresa atendida pela Valtec.';
comment on column public.business_accounts.monthly_value is 'Receita mensal recorrente contratada ou proposta para acompanhamento comercial.';
comment on column public.business_accounts.preventive_frequency_days is 'Periodicidade planejada de manutenção preventiva.';
