-- VALTEC — WhatsApp operacional V1
-- Caixa de entrada, histórico de mensagens, handoff humano e fila de automações.
-- O webhook server-side usa uma chave secreta do Supabase; o navegador continua apenas com chave publicável.

create table if not exists public.whatsapp_threads (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  display_name text,
  client_id uuid references public.clients(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'bot' check (status in ('bot','human','closed')),
  workflow_step text not null default 'menu',
  human_required boolean not null default false,
  human_reason text,
  unread_count integer not null default 0 check (unread_count >= 0),
  positive_signal boolean not null default false,
  last_message_preview text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.whatsapp_threads(id) on delete cascade,
  provider_message_id text unique,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text' check (message_type in ('text','image','video','audio','document','location','interactive','system','unknown')),
  body text,
  provider_media_id text,
  media_path text,
  delivery_status text not null default 'received' check (delivery_status in ('received','queued','sent','delivered','read','failed')),
  positive_signal boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_automation_jobs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.whatsapp_threads(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  kind text not null check (kind in ('followup_1d','followup_3d','review_request')),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','cancelled','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  payload jsonb not null default '{}'::jsonb,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_threads_last_message_idx on public.whatsapp_threads(last_message_at desc nulls last);
create index if not exists whatsapp_threads_human_idx on public.whatsapp_threads(human_required, status) where human_required = true or status = 'human';
create index if not exists whatsapp_threads_lead_idx on public.whatsapp_threads(lead_id) where lead_id is not null;
create index if not exists whatsapp_messages_thread_created_idx on public.whatsapp_messages(thread_id, created_at desc);
create index if not exists whatsapp_jobs_due_idx on public.whatsapp_automation_jobs(status, due_at) where status = 'pending';

create unique index if not exists whatsapp_jobs_one_active_kind_idx
on public.whatsapp_automation_jobs(thread_id, kind)
where status in ('pending','processing');

comment on table public.whatsapp_threads is 'Conversas do WhatsApp vinculadas ao lead/cliente atual da Valtec.';
comment on table public.whatsapp_messages is 'Histórico operacional de mensagens do WhatsApp, incluindo referência a mídia privada.';
comment on table public.whatsapp_automation_jobs is 'Fila de follow-ups e solicitações de avaliação. Mensagens fora da janela de atendimento devem usar templates aprovados.';

-- Data API: somente administradores autenticados operam estas tabelas pelo navegador.
grant select, insert, update, delete on public.whatsapp_threads to authenticated;
grant select, insert, update, delete on public.whatsapp_messages to authenticated;
grant select, insert, update, delete on public.whatsapp_automation_jobs to authenticated;

alter table public.whatsapp_threads enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_automation_jobs enable row level security;

drop policy if exists "admins manage whatsapp threads" on public.whatsapp_threads;
create policy "admins manage whatsapp threads" on public.whatsapp_threads
for all to authenticated
using (exists (
  select 1 from public.admin_profiles ap
  where ap.user_id = (select auth.uid()) and ap.active = true
))
with check (exists (
  select 1 from public.admin_profiles ap
  where ap.user_id = (select auth.uid()) and ap.active = true
));

drop policy if exists "admins manage whatsapp messages" on public.whatsapp_messages;
create policy "admins manage whatsapp messages" on public.whatsapp_messages
for all to authenticated
using (exists (
  select 1 from public.admin_profiles ap
  where ap.user_id = (select auth.uid()) and ap.active = true
))
with check (exists (
  select 1 from public.admin_profiles ap
  where ap.user_id = (select auth.uid()) and ap.active = true
));

drop policy if exists "admins manage whatsapp automation jobs" on public.whatsapp_automation_jobs;
create policy "admins manage whatsapp automation jobs" on public.whatsapp_automation_jobs
for all to authenticated
using (exists (
  select 1 from public.admin_profiles ap
  where ap.user_id = (select auth.uid()) and ap.active = true
))
with check (exists (
  select 1 from public.admin_profiles ap
  where ap.user_id = (select auth.uid()) and ap.active = true
));

-- Orçamento enviado: cria automaticamente o primeiro follow-up para a conversa vinculada.
-- Resposta/agendamento/conclusão/perda: cancela follow-ups pendentes para não insistir com o cliente.
create or replace function public.whatsapp_sync_jobs_from_lead()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_thread_id uuid;
  v_positive boolean := false;
begin
  select wt.id, wt.positive_signal
    into v_thread_id, v_positive
  from public.whatsapp_threads wt
  where wt.lead_id = new.id
  order by wt.updated_at desc
  limit 1;

  if v_thread_id is null then
    return new;
  end if;

  if new.status = 'orcamento_enviado' and old.status is distinct from new.status then
    insert into public.whatsapp_automation_jobs (thread_id, lead_id, kind, due_at)
    values (v_thread_id, new.id, 'followup_1d', now() + interval '1 day')
    on conflict do nothing;
  end if;

  if new.status in ('agendado','em_atendimento','concluido','avaliacao_solicitada','finalizado','perdido','arquivado')
     and old.status is distinct from new.status then
    update public.whatsapp_automation_jobs
       set status = 'cancelled', updated_at = now()
     where thread_id = v_thread_id
       and kind in ('followup_1d','followup_3d')
       and status in ('pending','processing');
  end if;

  if new.status in ('concluido','finalizado')
     and old.status is distinct from new.status
     and v_positive then
    insert into public.whatsapp_automation_jobs (thread_id, lead_id, kind, due_at)
    values (v_thread_id, new.id, 'review_request', now() + interval '4 hours')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists whatsapp_lead_automation_trigger on public.leads;
create trigger whatsapp_lead_automation_trigger
after update of status on public.leads
for each row
execute function public.whatsapp_sync_jobs_from_lead();

-- Elogio detectado depois da conclusão: agenda avaliação sem depender de IA generativa.
create or replace function public.whatsapp_schedule_review_on_positive_signal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lead_status text;
begin
  if new.positive_signal = true and old.positive_signal is distinct from new.positive_signal and new.lead_id is not null then
    select l.status into v_lead_status from public.leads l where l.id = new.lead_id;
    if v_lead_status in ('concluido','avaliacao_solicitada','finalizado') then
      insert into public.whatsapp_automation_jobs (thread_id, lead_id, kind, due_at)
      values (new.id, new.lead_id, 'review_request', now() + interval '4 hours')
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_positive_review_trigger on public.whatsapp_threads;
create trigger whatsapp_positive_review_trigger
after update of positive_signal on public.whatsapp_threads
for each row
execute function public.whatsapp_schedule_review_on_positive_signal();
