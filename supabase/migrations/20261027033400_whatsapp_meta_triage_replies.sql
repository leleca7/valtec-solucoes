-- Idempotência por mensagem recebida; nenhuma leitura pública.
create table if not exists public.whatsapp_meta_triage_replies (
  inbound_message_id text primary key,
  thread_id uuid not null references public.whatsapp_threads(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists whatsapp_meta_triage_by_thread
  on public.whatsapp_meta_triage_replies(thread_id,created_at desc);
alter table public.whatsapp_meta_triage_replies enable row level security;
revoke all on public.whatsapp_meta_triage_replies from anon,authenticated;
