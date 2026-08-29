# Central Valtec — Etapa 7: Estoque e fornecedores

## Objetivo
Transformar o catálogo de peças em um estoque rastreável sem criar um segundo cadastro da mesma peça.

## Fonte de verdade
`parts_catalog` continua sendo o cadastro mestre: nome, categoria, marca, código, preço e saldo visível.

O módulo acrescenta histórico de movimento, fornecedor, localização física e consumo por OS.

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

O custo total das peças consumidas alimenta `service_orders.parts_cost`, e o valor de venda das peças recalcula `parts_amount` e `total_amount` da OS.

Um item lançado incorretamente pode ser estornado. O estorno devolve a quantidade ao estoque, cria movimento de ajuste e recalcula custo e venda restantes da OS.

## Indicadores
- itens abaixo do estoque mínimo;
- valor estimado em estoque;
- valor de entradas no mês;
- custo de peças consumidas em OS no mês;
- histórico por peça;
- fornecedor preferencial;
- peças consumidas por atendimento.

## Banco real
Em 28/08/2026 foi confirmado no projeto `valtec soluções` que `parts_catalog.id` é UUID.

Foram aplicadas com sucesso:
- `service_order_operations`;
- `valtec_empresas`;
- `equipe_tecnica`;
- `inventory_operations`;
- `inventory_rpc_hardening`;
- `inventory_smoke_test`.

As tabelas novas estão com RLS habilitado. As funções de estoque usam `security invoker`; `EXECUTE` foi revogado de `PUBLIC` e `anon` e mantido somente para `authenticated`.

## Smoke test transacional
O smoke test criou temporariamente uma peça e uma OS e validou, dentro da migration:
- entrada de estoque;
- primeiro consumo de peça;
- segundo consumo com custo e preço diferentes;
- recálculo de `parts_cost`, `parts_amount` e `total_amount`;
- bloqueio de saída que deixaria estoque negativo;
- estorno de um item;
- devolução ao estoque;
- recálculo dos valores restantes da OS;
- limpeza completa dos registros temporários.

A migration terminou com sucesso. Uma leitura posterior confirmou zero peças, OS, movimentos ou itens temporários remanescentes.

## Validação que ainda depende da interface
O preview da Vercel está `READY` e o build não tem erro. O ambiente de automação disponível nesta sessão, porém, não consegue atravessar o SSO do preview protegido para clicar na Central. Por isso, o teste visual/interativo da tela administrativa permanece como última verificação antes do merge.

## Próxima etapa
Gestão e alertas: consolidar os indicadores já construídos e transformar atrasos, margens, capacidade, preventiva e estoque baixo em uma fila gerencial de exceções.