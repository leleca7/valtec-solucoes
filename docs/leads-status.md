# Status — Módulo de Leads

Data: 28/08/2026

## Concluído
- Área Leads na Central Valtec.
- Métricas de novos, ativos, atrasados e convertidos.
- Busca, filtros e visualização por etapa do funil.
- Status, urgência, próxima ação, data, observações e motivo de perda.
- WhatsApp direto.
- Mídia privada por URL assinada.
- Lead → cliente.
- Lead → orçamento com vínculo por `lead_id`.
- Lead → OS com vínculo por `lead_id`.
- Cadastro manual para WhatsApp, ligação, indicação, Google, Instagram e B2B.
- Proteção contra criação de segundo lead ativo com o mesmo telefone.
- Migration do funil aplicada no Supabase real da Valtec.

## Pendente para merge
- Preview Vercel com o commit final (bloqueado temporariamente pelo limite de builds do plano Hobby).
- Teste visual autenticado da fila com os dados reais.
- Teste completo de gravação pelo usuário administrativo: atualizar lead, criar cliente, salvar orçamento e salvar OS.

## Regra
Não fazer merge em produção enquanto o preview final não for validado.