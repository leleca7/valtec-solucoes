-- VALTEC — funil operacional de leads
-- Mantém compatibilidade com os status antigos e adiciona os campos necessários
-- para próxima ação, urgência, motivo de perda e vínculo com cliente.

alter table public.leads
  add column if not exists urgency text not null default 'normal',
  add column if not exists next_action text,
  add column if not exists next_action_at timestamptz,
  add column if not exists internal_notes text,
  add column if not exists lost_reason text,
  add column if not exists contacted_at timestamptz,
  add column if not exists converted_at timestamptz,
  add column if not exists client_id uuid references public.clients(id) on delete set null;

alter table public.leads drop constraint if exists leads_urgency_check;
alter table public.leads
  add constraint leads_urgency_check
  check (urgency in ('baixa','normal','alta'));

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check
  check (status in (
    'novo',
    'triagem',
    'contatado',
    'contato_realizado',
    'orcamento_preparacao',
    'orcamento_enviado',
    'aguardando_cliente',
    'agendado',
    'em_atendimento',
    'concluido',
    'avaliacao_solicitada',
    'finalizado',
    'perdido',
    'arquivado'
  ));

create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_next_action_at_idx on public.leads(next_action_at) where next_action_at is not null;
create index if not exists leads_phone_idx on public.leads(phone);
create index if not exists leads_client_id_idx on public.leads(client_id) where client_id is not null;

comment on column public.leads.next_action is 'Próximo passo operacional necessário para o lead.';
comment on column public.leads.next_action_at is 'Data/hora prevista para executar a próxima ação.';
comment on column public.leads.client_id is 'Cliente criado ou vinculado a partir deste lead.';
