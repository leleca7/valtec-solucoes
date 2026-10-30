-- VALTEC: histórico operacional e conciliação conservadora.
-- Não emitir recibos, não confirmar pagamentos e não mudar OS legadas automaticamente.
create table if not exists public.valtec_cost_settings (
  id smallint primary key default 1 check (id=1),
  bus_fare numeric(10,2) not null default 5.90 check (bus_fare>=0),
  technician_hourly_cost numeric(12,2),
  target_margin_percent numeric(5,2),
  updated_at timestamptz not null default now(),
  check (technician_hourly_cost is null or technician_hourly_cost >= 0),
  check (target_margin_percent is null or (target_margin_percent >= 0 and target_margin_percent < 100))
);
insert into public.valtec_cost_settings (id,bus_fare) values (1,5.90) on conflict (id) do nothing;

create table if not exists public.valtec_marketing_spend (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'windsor_facebook',
  account_id text not null,
  campaign text not null,
  spend_date date not null,
  amount numeric(12,2) not null check (amount>=0),
  currency text not null default 'BRL',
  snapshot_at timestamptz not null default now(),
  unique(provider,account_id,campaign,spend_date)
);
create index if not exists valtec_marketing_spend_date_idx on public.valtec_marketing_spend(spend_date);

create table if not exists public.valtec_transport_legs (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid references public.service_orders(id) on delete set null,
  travel_date date,
  leg text not null check (leg in ('ida','volta','entre_atendimentos')),
  mode text not null check (mode in ('onibus','uber','cliente','outro')),
  paid_by text not null check (paid_by in ('valtec','cliente','terceiro')),
  fare_count integer check (fare_count is null or fare_count between 0 and 20),
  amount numeric(10,2) check (amount is null or amount>=0),
  status text not null default 'pendente' check(status in ('pendente','confirmado')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists valtec_transport_legs_order_idx on public.valtec_transport_legs(service_order_id);

create table if not exists public.valtec_finance_review (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.whatsapp_messages(id) on delete cascade,
  thread_id uuid not null references public.whatsapp_threads(id) on delete cascade,
  candidate_type text not null check (candidate_type in ('texto_financeiro','anexo_a_classificar','anexo_com_contexto')),
  status text not null default 'pendente' check(status in ('pendente','pessoal','nao_financeiro','relacionado_servico','revisado')),
  service_order_id uuid references public.service_orders(id) on delete set null,
  reported_amount numeric(12,2) check (reported_amount is null or reported_amount>=0),
  payment_method text,
  bank_checked boolean not null default false,
  service_executed_checked boolean not null default false,
  review_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists valtec_finance_review_status_idx on public.valtec_finance_review(status,created_at desc);
create index if not exists valtec_finance_review_thread_idx on public.valtec_finance_review(thread_id);

-- Todas as tabelas administrativas requerem login e perfil administrativo ativo.
alter table public.valtec_cost_settings enable row level security;
alter table public.valtec_marketing_spend enable row level security;
alter table public.valtec_transport_legs enable row level security;
alter table public.valtec_finance_review enable row level security;
revoke all on public.valtec_cost_settings,public.valtec_marketing_spend,public.valtec_transport_legs,public.valtec_finance_review from anon,authenticated;
grant select,update on public.valtec_cost_settings to authenticated;
grant select on public.valtec_marketing_spend to authenticated;
grant select,insert,update on public.valtec_transport_legs to authenticated;
grant select,update on public.valtec_finance_review to authenticated;

create policy "valtec admin read settings" on public.valtec_cost_settings for select to authenticated
 using(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true));
create policy "valtec admin update settings" on public.valtec_cost_settings for update to authenticated
 using(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true))
 with check(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true));
create policy "valtec admin read media costs" on public.valtec_marketing_spend for select to authenticated
 using(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true));
create policy "valtec admin read transport" on public.valtec_transport_legs for select to authenticated
 using(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true));
create policy "valtec admin insert transport" on public.valtec_transport_legs for insert to authenticated
 with check(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true));
create policy "valtec admin update transport" on public.valtec_transport_legs for update to authenticated
 using(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true))
 with check(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true));
create policy "valtec admin read evidence" on public.valtec_finance_review for select to authenticated
 using(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true));
create policy "valtec admin update evidence" on public.valtec_finance_review for update to authenticated
 using(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true))
 with check(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true));

-- Mensagens novas: criar candidato SOMENTE para conversa explicitamente comercial.
-- Documento/foto vira anexo a revisar; nunca comprovante confirmado.
create or replace function public.valtec_queue_finance_evidence() returns trigger
language plpgsql set search_path=public as $$
declare v_type text;
begin
  if new.direction <> 'inbound' then return new; end if;
  if not exists (select 1 from public.whatsapp_threads t
    where t.id=new.thread_id and t.contact_type in ('lead','client')) then return new; end if;
  v_type:=case
    when new.message_type in ('image','document') and coalesce(new.body,'') ~* '(pix|comprovant|pagament|transfer[eê]nc|recibo|cart[aã]o)'
      then 'anexo_com_contexto'
    when new.message_type in ('image','document') then 'anexo_a_classificar'
    when new.message_type='text' and coalesce(new.body,'') ~* '(pix|comprovant|pagament|recebi|paguei|transfer[eê]nc|recibo|cart[aã]o|dinheiro)'
      then 'texto_financeiro'
    else null end;
  if v_type is not null then
    insert into public.valtec_finance_review(message_id,thread_id,candidate_type)
      values(new.id,new.thread_id,v_type) on conflict(message_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists valtec_finance_review_on_message on public.whatsapp_messages;
create trigger valtec_finance_review_on_message after insert on public.whatsapp_messages
 for each row execute function public.valtec_queue_finance_evidence();

-- Backfill: executado uma vez e idempotente; não lê contatos pessoais/desconhecidos.
insert into public.valtec_finance_review(message_id,thread_id,candidate_type)
select m.id,m.thread_id,
 case when m.message_type in ('image','document') and coalesce(m.body,'') ~* '(pix|comprovant|pagament|transfer[eê]nc|recibo|cart[aã]o)' then 'anexo_com_contexto'
      when m.message_type in ('image','document') then 'anexo_a_classificar'
      else 'texto_financeiro' end
from public.whatsapp_messages m
join public.whatsapp_threads t on t.id=m.thread_id
where m.direction='inbound' and t.contact_type in ('lead','client') and
 (m.message_type in ('image','document') or
  (m.message_type='text' and coalesce(m.body,'') ~* '(pix|comprovant|pagament|recebi|paguei|transfer[eê]nc|recibo|cart[aã]o|dinheiro)'))
on conflict(message_id) do nothing;

-- Quando um contato antigo passar de desconhecido para comercial,
-- seus anexos e menções financeiras entram na fila histórica.
create or replace function public.valtec_queue_thread_history() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.contact_type in ('lead','client') and old.contact_type is distinct from new.contact_type then
    insert into public.valtec_finance_review(message_id,thread_id,candidate_type)
    select m.id,m.thread_id,
      case when m.message_type in ('image','document') and coalesce(m.body,'') ~* '(pix|comprovant|pagament|transfer[eê]nc|recibo|cart[aã]o)'
          then 'anexo_com_contexto'
           when m.message_type in ('image','document') then 'anexo_a_classificar'
           else 'texto_financeiro' end
    from public.whatsapp_messages m
    where m.thread_id=new.id and m.direction='inbound' and
      (m.message_type in ('image','document') or
       (m.message_type='text' and coalesce(m.body,'') ~* '(pix|comprovant|pagament|recebi|paguei|transfer[eê]nc|recibo|cart[aã]o|dinheiro)'))
    on conflict(message_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists valtec_finance_review_on_thread on public.whatsapp_threads;
create trigger valtec_finance_review_on_thread
 after update of contact_type on public.whatsapp_threads
 for each row execute function public.valtec_queue_thread_history();
