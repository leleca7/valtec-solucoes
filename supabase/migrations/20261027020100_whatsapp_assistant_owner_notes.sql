-- Estado de acompanhamento informado e confirmado pelo técnico; não altera leads ou OS.
create table if not exists public.whatsapp_assistant_owner_notes (
  thread_id uuid primary key references public.whatsapp_threads(id) on delete cascade,
  operator_phone text not null,
  status text not null check (status in ('servico_realizado','nao_fechou','fora_area','retorno_agendado')),
  follow_up_on date,
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'retorno_agendado' and follow_up_on is not null) or
         (status <> 'retorno_agendado' and follow_up_on is null))
);
create index if not exists whatsapp_assistant_owner_notes_operator_idx
  on public.whatsapp_assistant_owner_notes(operator_phone,status,follow_up_on);
alter table public.whatsapp_assistant_owner_notes enable row level security;
revoke all on public.whatsapp_assistant_owner_notes from anon, authenticated;
