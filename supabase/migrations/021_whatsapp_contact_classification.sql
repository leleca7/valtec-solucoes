-- Classificação operacional de contatos do WhatsApp.
-- Contatos desconhecidos não devem virar lead automaticamente.

alter table public.whatsapp_threads
  add column if not exists contact_type text not null default 'unknown',
  add column if not exists auto_reply_mode text not null default 'commercial_only',
  add column if not exists bot_label text,
  add column if not exists classification_source text not null default 'system',
  add column if not exists classified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_threads_contact_type_check'
  ) then
    alter table public.whatsapp_threads
      add constraint whatsapp_threads_contact_type_check
      check (contact_type in ('tester','client','lead','personal','supplier','ignore','unknown'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_threads_auto_reply_mode_check'
  ) then
    alter table public.whatsapp_threads
      add constraint whatsapp_threads_auto_reply_mode_check
      check (auto_reply_mode in ('always','commercial_only','never'));
  end if;
end $$;

create index if not exists whatsapp_threads_contact_type_idx
  on public.whatsapp_threads (contact_type);

comment on column public.whatsapp_threads.contact_type is
  'Classificação operacional do contato: tester, client, lead, personal, supplier, ignore ou unknown.';

comment on column public.whatsapp_threads.auto_reply_mode is
  'Política de resposta automática: always, commercial_only ou never.';
