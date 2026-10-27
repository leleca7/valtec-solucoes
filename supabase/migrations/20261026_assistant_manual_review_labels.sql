-- Confirmações humanas do assistente: não alteram status nem automações de leads.
create table if not exists public.whatsapp_assistant_case_labels (
  thread_id uuid primary key references public.whatsapp_threads(id) on delete cascade,
  manual_status text not null check (manual_status in ('automatico','concluido','visita_marcada','fora_area','aguardar_cliente','orcamento')),
  updated_by_phone text not null,
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_assistant_case_labels enable row level security;
revoke all on public.whatsapp_assistant_case_labels from anon, authenticated;
