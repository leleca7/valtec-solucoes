# Central Valtec — Etapa 2: Agenda e Ordens de Serviço

## Objetivo
Fazer a execução deixar de depender de explicação paralela, memória ou presença física do fundador. Uma OS precisa conter informação suficiente para outro profissional preparado assumir, executar, registrar pendências e devolver o atendimento para a gestão.

## Campos operacionais acrescentados
- responsável pela execução;
- prioridade;
- tipo de serviço;
- marca e modelo do equipamento;
- horário real de início;
- custo real de peças;
- custo de deslocamento;
- outros custos variáveis;
- valor efetivamente recebido;
- data do recebimento;
- necessidade e data de retorno;
- motivo da pendência;
- observação de conclusão;
- participação física do fundador.

## Indicadores habilitados por estes dados
- margem por OS;
- valor ainda não recebido;
- serviços por responsável;
- retornos e pendências;
- participação do fundador na execução;
- percentual de serviços executados sem o fundador;
- comparação de margem por tipo de serviço.

## Regra de compatibilidade
A extensão verifica se as colunas da migration `005_service_order_operations.sql` existem. Se não existirem, a seção nova fica oculta e a OS atual continua operando normalmente.

## Sequência de ativação
1. concluir e validar a PR de Leads;
2. aplicar a migration `005_service_order_operations.sql`;
3. validar abertura e edição de OS existente;
4. validar criação de nova OS com responsável e custos;
5. validar cálculo de margem;
6. validar retorno técnico e pendência;
7. conferir indicador de execução física pelo fundador;
8. somente então retarget/merge desta etapa em `main`.

## Próxima etapa
Financeiro por atendimento: conectar recebimento, custo e margem de cada OS ao painel financeiro, substituindo análise baseada apenas em faturamento e despesas gerais.