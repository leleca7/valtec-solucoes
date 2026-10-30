-- Identificar menções de transporte sem lançar despesa ou inventar deslocamento.
create table if not exists public.valtec_transport_review (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.whatsapp_messages(id) on delete cascade,
  thread_id uuid not null references public.whatsapp_threads(id) on delete cascade,
  service_order_id uuid references public.service_orders(id) on delete set null,
  status text not null default 'pendente' check(status in ('pendente','confirmado','descartado')),
  notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists valtec_transport_review_status_idx on public.valtec_transport_review(status,created_at desc);
alter table public.valtec_transport_review enable row level security;
revoke all on public.valtec_transport_review from anon,authenticated;
grant select,update on public.valtec_transport_review to authenticated;
create policy "valtec admin read transport review" on public.valtec_transport_review for select to authenticated
using(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true));
create policy "valtec admin update transport review" on public.valtec_transport_review for update to authenticated
using(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true))
with check(exists(select 1 from public.admin_profiles a where a.user_id=(select auth.uid()) and a.active=true));

create or replace function public.valtec_queue_transport_note() returns trigger language plpgsql set search_path=public as $$
begin
 if new.message_type in ('text','image','document') and coalesce(new.body,'') ~* '(uber|[ôo]nibus|carona|passagem|transporte|te busco|vou buscar|ir buscar)' and
    exists(select 1 from public.whatsapp_threads t where t.id=new.thread_id and t.contact_type in ('lead','client'))
 then insert into public.valtec_transport_review(message_id,thread_id) values(new.id,new.thread_id) on conflict(message_id) do nothing;
 end if;
 return new;
end;
$$;
drop trigger if exists valtec_transport_review_message on public.whatsapp_messages;
create trigger valtec_transport_review_message after insert on public.whatsapp_messages
for each row execute function public.valtec_queue_transport_note();

insert into public.valtec_transport_review(message_id,thread_id)
select m.id,m.thread_id from public.whatsapp_messages m
join public.whatsapp_threads t on t.id=m.thread_id
where t.contact_type in ('lead','client') and m.message_type in ('text','image','document')
 and coalesce(m.body,'') ~* '(uber|[ôo]nibus|carona|passagem|transporte|te busco|vou buscar|ir buscar)'
on conflict(message_id) do nothing;

create or replace function public.valtec_queue_old_transport() returns trigger language plpgsql set search_path=public as $$
begin
 if new.contact_type in ('lead','client') and old.contact_type is distinct from new.contact_type then
   insert into public.valtec_transport_review(message_id,thread_id)
   select m.id,m.thread_id from public.whatsapp_messages m
   where m.thread_id=new.id and m.message_type in ('text','image','document')
    and coalesce(m.body,'') ~* '(uber|[ôo]nibus|carona|passagem|transporte|te busco|vou buscar|ir buscar)'
   on conflict(message_id) do nothing;
 end if;
 return new;
end;
$$;
drop trigger if exists valtec_transport_review_thread on public.whatsapp_threads;
create trigger valtec_transport_review_thread after update of contact_type on public.whatsapp_threads
for each row execute function public.valtec_queue_old_transport();
