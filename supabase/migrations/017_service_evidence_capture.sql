-- VALTEC — Evidências operacionais de serviço via WhatsApp
-- Registra antes/durante/depois com contexto de lead/OS e trilha de auditoria.

create table if not exists public.service_evidence_sessions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  service_order_id uuid references public.service_orders(id) on delete set null,
  whatsapp_thread_id uuid references public.whatsapp_threads(id) on delete set null,
  customer_name text,
  customer_phone text,
  equipment text,
  service_summary text,
  status text not null default 'open' check (status in ('open','closed')),
  created_by_phone text not null,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_evidence_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.service_evidence_sessions(id) on delete cascade,
  phase text not null default 'note' check (phase in ('before','during','after','note')),
  media_type text not null default 'text' check (media_type in ('text','image','video','audio','document')),
  media_path text,
  provider_media_id text,
  provider_message_id text unique,
  description text,
  captured_by_phone text not null,
  captured_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_whatsapp_states (
  phone text primary key,
  session_id uuid references public.service_evidence_sessions(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  service_order_id uuid references public.service_orders(id) on delete set null,
  pending_phase text not null default 'before' check (pending_phase in ('before','during','after','note')),
  pending_description text,
  updated_at timestamptz not null default now()
);

create index if not exists service_evidence_sessions_lead_idx
  on public.service_evidence_sessions(lead_id, started_at desc);
create index if not exists service_evidence_sessions_order_idx
  on public.service_evidence_sessions(service_order_id, started_at desc);
create index if not exists service_evidence_sessions_status_idx
  on public.service_evidence_sessions(status, updated_at desc);
create index if not exists service_evidence_items_session_idx
  on public.service_evidence_items(session_id, captured_at asc);
create index if not exists service_evidence_items_phase_idx
  on public.service_evidence_items(session_id, phase, captured_at asc);

comment on table public.service_evidence_sessions is
  'Sessões de documentação técnica de um atendimento: antes, durante e depois.';
comment on table public.service_evidence_items is
  'Fotos, vídeos, documentos e notas vinculados a uma sessão de evidência.';
comment on table public.staff_whatsapp_states is
  'Contexto temporário por número interno autorizado para operar a Valtec via WhatsApp.';

-- Somente administradores autenticados visualizam as evidências no painel.
revoke all on public.service_evidence_sessions from anon, authenticated;
revoke all on public.service_evidence_items from anon, authenticated;
revoke all on public.staff_whatsapp_states from anon, authenticated;

grant select on public.service_evidence_sessions to authenticated;
grant select on public.service_evidence_items to authenticated;

alter table public.service_evidence_sessions enable row level security;
alter table public.service_evidence_items enable row level security;
alter table public.staff_whatsapp_states enable row level security;

drop policy if exists "admins read service evidence sessions" on public.service_evidence_sessions;
create policy "admins read service evidence sessions"
on public.service_evidence_sessions
for select
to authenticated
using (exists (
  select 1
  from public.admin_profiles ap
  where ap.user_id = (select auth.uid())
    and ap.active = true
));

drop policy if exists "admins read service evidence items" on public.service_evidence_items;
create policy "admins read service evidence items"
on public.service_evidence_items
for select
to authenticated
using (exists (
  select 1
  from public.admin_profiles ap
  where ap.user_id = (select auth.uid())
    and ap.active = true
));

-- staff_whatsapp_states é backend-only; não há política para clientes autenticados.
