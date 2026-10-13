-- VALTEC: cancelamento auditável de recibos e arquivamento de cadastros.
-- Não apaga vínculos com ordens de serviço, pagamentos ou históricos.
alter table public.clients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

alter table public.receipts
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists voided_reason text;

create index if not exists clients_active_lookup_idx on public.clients (phone_normalized) where archived_at is null;
create index if not exists receipts_active_issued_idx on public.receipts (issued_at desc) where voided_at is null;

comment on column public.clients.archived_at is 'Cadastro retirado da lista ativa, com histórico preservado.';
comment on column public.receipts.voided_at is 'Recibo cancelado; não contabilizar como recebimento. O registro permanece para auditoria.';
