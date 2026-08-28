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

O custo total das peças consumidas alimenta `service_orders.parts_cost`, conectando estoque ao cálculo de margem.

Um item lançado incorretamente pode ser estornado. O estorno devolve a quantidade ao estoque e cria movimento de ajuste, preservando rastreabilidade.

## Indicadores
- itens abaixo do estoque mínimo;
- valor estimado em estoque;
- valor de entradas no mês;
- custo de peças consumidas em OS no mês;
- histórico por peça;
- fornecedor preferencial;
- peças consumidas por atendimento.

## Validação obrigatória antes da migration
Confirmar no Supabase o tipo de `parts_catalog.id`. A migration foi preparada considerando UUID, seguindo o padrão do sistema, mas não deve ser aplicada sem essa conferência porque a definição histórica dessa tabela não está versionada no repositório.

## Próxima etapa
Gestão e alertas: consolidar os indicadores já construídos e transformar atrasos, margens, capacidade, preventiva e estoque baixo em uma fila gerencial de exceções.