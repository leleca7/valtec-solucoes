-- Valtec Soluções: conciliação bancária interna, sem faturamento presumido.
-- Os lançamentos privados importados do extrato Stone ficam somente no banco, não no Git.
CREATE TABLE IF NOT EXISTS public.valtec_bank_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_reference text NOT NULL UNIQUE,
  bank_name text NOT NULL DEFAULT 'Stone',
  statement_label text NOT NULL,
  payment_date date NOT NULL,
  payer_name text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK(amount>0),
  payment_method text NOT NULL CHECK(payment_method IN ('PIX','CARTAO')),
  matched_client_name text,
  linked_thread_id uuid REFERENCES public.whatsapp_threads(id) ON DELETE SET NULL,
  linked_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  linked_receipt_id uuid REFERENCES public.receipts(id) ON DELETE SET NULL,
  match_status text NOT NULL DEFAULT 'nao_localizado'
    CHECK(match_status IN ('conversa_e_comprovante','nome_e_data','conversa_indireta','recibo_identificado','nao_localizado')),
  review_status text NOT NULL DEFAULT 'pendente'
    CHECK(review_status IN ('pendente','confirmado_comercial','pessoal_ou_terceiro')),
  match_explanation text,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.valtec_bank_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.valtec_bank_reconciliation FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.valtec_bank_reconciliation TO authenticated;
GRANT UPDATE(matched_client_name,linked_thread_id,linked_lead_id,match_status,review_status,review_notes)
  ON public.valtec_bank_reconciliation TO authenticated;
DROP POLICY IF EXISTS "Valtec admins can read bank reconciliation" ON public.valtec_bank_reconciliation;
CREATE POLICY "Valtec admins can read bank reconciliation" ON public.valtec_bank_reconciliation
  FOR SELECT TO authenticated USING ((select private.is_valtec_admin()));
DROP POLICY IF EXISTS "Valtec admins can review bank reconciliation" ON public.valtec_bank_reconciliation;
CREATE POLICY "Valtec admins can review bank reconciliation" ON public.valtec_bank_reconciliation
  FOR UPDATE TO authenticated USING ((select private.is_valtec_admin()))
  WITH CHECK ((select private.is_valtec_admin()));
CREATE INDEX IF NOT EXISTS valtec_bank_reconciliation_date_idx ON public.valtec_bank_reconciliation(payment_date DESC);
CREATE INDEX IF NOT EXISTS valtec_bank_reconciliation_thread_idx ON public.valtec_bank_reconciliation(linked_thread_id);
