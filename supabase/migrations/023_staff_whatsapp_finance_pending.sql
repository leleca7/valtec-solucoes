-- Comandos financeiros internos do WhatsApp exigem confirmação antes de gravar.
-- Disponível apenas ao backend com chave secreta; a tabela já tem RLS sem política de leitura pública.
alter table public.staff_whatsapp_states
  add column if not exists finance_pending jsonb;
comment on column public.staff_whatsapp_states.finance_pending is
  'Lançamento preparado e ainda NÃO confirmado; expira em 10 minutos.';
