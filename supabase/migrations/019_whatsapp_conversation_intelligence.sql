-- Contexto conversacional do WhatsApp + normalização de telefone para reaproveitar leads do site.

create or replace function public.valtec_normalize_phone_text(value text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select regexp_replace(coalesce(value, ''), '\\D', '', 'g') as digits
  )
  select case
    when digits = '' then ''
    when digits like '55%' then digits
    when length(digits) in (10, 11) then '55' || digits
    else digits
  end
  from cleaned;
$$;

alter table public.leads
  add column if not exists phone_normalized text
  generated always as (public.valtec_normalize_phone_text(phone)) stored;

alter table public.clients
  add column if not exists phone_normalized text
  generated always as (public.valtec_normalize_phone_text(phone)) stored;

create index if not exists leads_phone_normalized_idx
  on public.leads (phone_normalized, created_at desc);

create index if not exists clients_phone_normalized_idx
  on public.clients (phone_normalized);

alter table public.whatsapp_threads
  add column if not exists conversation_context jsonb not null default '{}'::jsonb,
  add column if not exists last_intent text,
  add column if not exists context_updated_at timestamptz;

comment on column public.whatsapp_threads.conversation_context is
  'Contexto acumulado do atendimento. Dados já conhecidos devem ser reutilizados em vez de perguntados novamente.';

alter table public.whatsapp_messages
  add column if not exists transcript text,
  add column if not exists extracted_facts jsonb not null default '{}'::jsonb,
  add column if not exists processing_status text not null default 'received';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_messages_processing_status_check'
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_processing_status_check
      check (processing_status in ('received','processed','needs_human','failed'));
  end if;
end $$;

comment on column public.whatsapp_messages.transcript is
  'Transcrição de áudio quando houver serviço de speech-to-text configurado.';

comment on column public.whatsapp_messages.extracted_facts is
  'Fatos extraídos da mensagem para alimentar o contexto do atendimento.';
