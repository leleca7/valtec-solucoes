-- Registro idempotente das primeiras respostas, exclusivo do backend de produção.
create table if not exists public.whatsapp_meta_first_replies (
  thread_id uuid primary key references public.whatsapp_threads(id) on delete cascade,
  inbound_message_id text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_meta_first_replies_status_idx
  on public.whatsapp_meta_first_replies(status,created_at desc);
alter table public.whatsapp_meta_first_replies enable row level security;
revoke all on public.whatsapp_meta_first_replies from anon,authenticated;
