# Central Valtec — Etapa 7: Estoque e fornecedores

## Objetivo
Transformar o catálogo de peças em um estoque rastreável sem criar um segundo cadastro da mesma peça.

## Fonte de verdade
`parts_catalog` continua sendo o cadastro mestre: nome, categoria, marca, código, preço e saldo visível.

O novo módulo acrescenta histórico de movimento, fornecedor, localização física e consumo por OS.

## Estrutura
- fornecedores;
- fornecedor preferencial por peça;
- localização física da peça;
- último custo de compra;
- movimentos de entrada, saída e ajustes;
- peças efetivamente utilizadas por OS;
- custo e preço praticado da peça no atendimento.

## Regra de movimentação
Depois de ativado o módulo, alterações de saldo devem ocorrer por movimento registrado. A função de banco atualiza o saldo e grava o movimento na mesma transação.

Saídas que deixariam o estoque negativo são bloqueadas.

## Integração com OS
Na ordem de serviço, a equipe seleciona a peça, quantidade, custo e preço de venda.

Se a OS ainda for nova, as peças ficam preparadas e são baixadas após o primeiro salvamento.

Se a OS já existir, o consumo é registrado imediatamente.

O custo total das peças consumidas alimenta `service_orders.parts_cost`, conectando estoque ao cálculo de margem. O valor de venda das peças e o total da OS são recalculados a cada consumo e estorno.

Um item lançado incorretamente pode ser estornado. O estorno devolve a quantidade ao estoque, recalcula os totais da OS e cria movimento de ajuste, preservando rastreabilidade.

## Indicadores
- itens abaixo do estoque mínimo;
- valor estimado em estoque;
- valor de entradas no mês;
- custo de peças consumidas em OS no mês;
- histórico por peça;
- fornecedor preferencial;
- peças consumidas por atendimento.

## Validação do banco real — 28/08/2026
O projeto `valtec soluções` foi conferido diretamente no Supabase antes da implantação.

- `parts_catalog.id` confirmado como UUID;
- migrations `service_order_operations`, `valtec_empresas`, `equipe_tecnica`, `inventory_operations` e `inventory_rpc_hardening` aplicadas com sucesso;
- tabelas `suppliers`, `inventory_movements` e `service_order_parts` criadas;
- RLS confirmado nas novas tabelas;
- RPCs de estoque usam `security invoker`;
- execução das RPCs revogada de `PUBLIC` e `anon`, mantendo apenas `authenticated`;
- funções de consumo e estorno conferidas com recálculo de `parts_cost`, `parts_amount` e `total_amount`;
- nenhuma linha de fornecedor, movimento ou consumo foi criada durante a validação.

O conector de consulta do Supabase opera em modo somente leitura para SQL de teste e bloqueou um teste transacional com `INSERT`. Por isso, o teste funcional de movimentação pela interface administrativa permanece obrigatório antes do merge da PR.

## Advisors
Os advisors não apontaram problema de segurança novo causado pelo estoque. Permanecem avisos anteriores ligados aos helpers administrativos `is_valtec_admin()` e `is_valtec_marketing_admin()`, além de avisos de performance em estruturas antigas. Índices recém-criados aparecem como ainda não utilizados porque as novas tabelas ainda não receberam operação real.

## Próxima etapa
Gestão e alertas: consolidar os indicadores já construídos e transformar atrasos, margens, capacidade, preventiva e estoque baixo em uma fila gerencial de exceções.