-- Assistente privado Valtec: isolado do CRM e do WhatsApp comercial.
-- O backend usa chave de serviço; clientes anon/authenticated não leem este estado.
create table if not exists public.whatsapp_assistant_sessions (
  operator_phone text primary key,
  thread_id uuid references public.whatsapp_threads(id) on delete set null,
  draft text not null default '',
  overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_assistant_sessions enable row level security;
revoke all on public.whatsapp_assistant_sessions from anon, authenticated;

create table if not exists public.whatsapp_assistant_commands (
  provider_message_id text primary key,
  operator_phone text not null,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_assistant_commands enable row level security;
revoke all on public.whatsapp_assistant_commands from anon, authenticated;

create table if not exists public.whatsapp_assistant_notices (
  provider_message_id text primary key,
  thread_id uuid not null references public.whatsapp_threads(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_assistant_notices_thread_sent_idx
  on public.whatsapp_assistant_notices(thread_id, sent_at desc);
alter table public.whatsapp_assistant_notices enable row level security;
revoke all on public.whatsapp_assistant_notices from anon, authenticated;
