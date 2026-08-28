# Central Valtec — Leads

## Objetivo
Transformar solicitações recebidas pelo site em uma fila operacional com próximo passo claro, reduzindo perda de oportunidades no WhatsApp.

## Fluxo
Novo lead → Triagem → Contato realizado → Orçamento em preparação → Orçamento enviado → Aguardando cliente → Agendado → Em atendimento → Concluído → Avaliação solicitada → Finalizado.

Também existem os estados `perdido` e `arquivado`.

## Dados operacionais
Além dos dados já captados pelo formulário, o módulo registra urgência, próxima ação, data da próxima ação, observação interna, motivo de perda, data do primeiro contato, data de conversão e vínculo com cliente.

## Integrações
- WhatsApp direto pelo telefone do lead.
- Cliente criado/vinculado a partir do lead.
- Orçamento pré-preenchido e posteriormente vinculado por `lead_id`.
- OS pré-preenchida e posteriormente vinculada por `lead_id`.
- Foto/vídeo do bucket privado `lead-media` aberto por URL assinada temporária.

## Banco
Aplicar `supabase/migrations/004_lead_pipeline.sql` antes de ativar a feature em produção.

## Validação mínima antes do merge
1. Entrar na Central com usuário administrativo.
2. Abrir Leads e confirmar carregamento da fila.
3. Atualizar status e próxima ação.
4. Criar cliente a partir de um lead.
5. Preparar e salvar um orçamento; confirmar `quotes.lead_id`.
6. Preparar e salvar uma OS; confirmar `service_orders.lead_id`.
7. Abrir mídia de um lead com upload.
