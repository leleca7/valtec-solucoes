-- Estado privado de edição do rascunho do responsável; sem acionar envios.
-- Mantém o estado do registro de evidências/financeiro independente.
alter table public.staff_whatsapp_states
  add column if not exists assistant_draft jsonb;

comment on column public.staff_whatsapp_states.assistant_draft is
  'Rascunho temporário de resposta do técnico para revisão pelo WhatsApp; não é enviado automaticamente ao cliente.';
