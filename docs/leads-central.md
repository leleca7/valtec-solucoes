# Central Valtec — Leads e Atendimento

## Objetivo
Transformar cada contato em uma oportunidade rastreável, com status, prioridade e próximo passo, reduzindo dependência de memória e conversas soltas no WhatsApp.

## Entrada de leads
O funil recebe leads automaticamente pelo formulário público do site e também permite cadastro manual para contatos que chegam por WhatsApp, ligação, indicação, Google, Instagram e prospecção B2B.

No cadastro manual, nome, telefone, bairro e equipamento são obrigatórios. O sistema verifica se já existe um lead ativo com o mesmo telefone antes de permitir outro cadastro.

## Funil
Novo lead → Triagem → Contato realizado → Orçamento em preparação → Orçamento enviado → Aguardando cliente → Agendado → Em atendimento → Concluído → Avaliação solicitada → Finalizado.

Também existem os estados `perdido` e `arquivado`. O status legado `contatado` continua aceito para preservar registros antigos.

## Dados operacionais
Cada lead pode registrar urgência, próxima ação, data da próxima ação, observação interna, motivo de perda, data do primeiro contato, data de conversão e vínculo com cliente.

## Ações rápidas
- abrir WhatsApp;
- criar/vincular cliente;
- preparar orçamento;
- criar ordem de serviço;
- abrir mídia enviada pelo cliente por URL assinada temporária;
- arquivar lead.

## Conversão
Ao preparar orçamento ou OS a partir do lead, o módulo guarda o lead ativo na sessão do navegador e, após o documento ser salvo, vincula o `lead_id` no registro correspondente. Dessa forma, a origem do atendimento permanece rastreável.

## Banco de dados
A migration `supabase/migrations/004_lead_pipeline.sql` adiciona os campos e índices necessários. Ela foi aplicada no projeto Supabase `valtec soluções` em 28/08/2026 e os novos campos foram verificados após a aplicação.

## Segurança
O frontend usa somente a publishable key e a sessão administrativa existente. A leitura e edição dos leads continuam protegidas pelas políticas RLS. Mídias de leads permanecem no bucket privado `lead-media` e são abertas por URL assinada com expiração curta.

## Validação antes do merge
1. Entrar na Central com usuário administrativo.
2. Abrir Leads e confirmar carregamento da fila.
3. Atualizar status e próxima ação.
4. Criar lead manual e validar proteção contra duplicidade.
5. Criar cliente a partir de um lead.
6. Preparar e salvar um orçamento; confirmar `quotes.lead_id`.
7. Preparar e salvar uma OS; confirmar `service_orders.lead_id`.
8. Abrir mídia de um lead com upload.

## Situação do preview
A branch `feature/leads-central-valtec` está pronta para validação, mas o preview mais recente da Vercel ainda não contém todos os commits porque o projeto Hobby atingiu o limite temporário de builds. Não fazer merge em `main` até validar o preview final.