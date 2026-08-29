-- VALTEC — equipe técnica, formação e autonomia

create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  neighborhood text,
  source text,
  status text not null default 'candidato',
  career_level text not null default 'auxiliar',
  autonomy_level text not null default 'observa',
  can_work_solo boolean not null default false,
  route_ready boolean not null default false,
  start_date date,
  availability_notes text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.technician_skills (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.technicians(id) on delete cascade,
  competency text not null,
  level text not null default 'observa',
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(technician_id, competency)
);

alter table public.service_orders
  add column if not exists technician_id uuid references public.technicians(id) on delete set null;

create index if not exists technicians_status_idx on public.technicians(status);
create index if not exists technicians_autonomy_idx on public.technicians(autonomy_level);
create index if not exists technician_skills_technician_idx on public.technician_skills(technician_id);
create index if not exists service_orders_technician_id_idx on public.service_orders(technician_id) where technician_id is not null;

grant select, insert, update, delete on public.technicians to authenticated;
grant select, insert, update, delete on public.technician_skills to authenticated;

alter table public.technicians enable row level security;
alter table public.technician_skills enable row level security;

drop policy if exists "admins manage technicians" on public.technicians;
create policy "admins manage technicians" on public.technicians
for all to authenticated
using (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true))
with check (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true));

drop policy if exists "admins manage technician skills" on public.technician_skills;
create policy "admins manage technician skills" on public.technician_skills
for all to authenticated
using (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true))
with check (exists (select 1 from public.admin_profiles ap where ap.user_id = (select auth.uid()) and ap.active = true));

comment on table public.technicians is 'Candidatos e profissionais técnicos da Valtec, separados de usuários administrativos.';
comment on column public.technicians.career_level is 'Trilha: auxiliar, formação, técnico, sênior ou líder de rota.';
comment on column public.technicians.autonomy_level is 'Autonomia prática: observa, auxilia, supervisionado, autônomo ou ensina.';
comment on column public.technicians.can_work_solo is 'Indica se o profissional pode assumir OS comum sem acompanhamento físico.';
comment on column public.technicians.route_ready is 'Indica se pode assumir rota/agenda própria dentro do padrão Valtec.';
