# Central Valtec — Etapa 3: Financeiro por atendimento

## Objetivo
Sair da leitura de faturamento bruto e despesas gerais e passar a saber quanto cada ordem de serviço gera de receita, consome de custo variável, deixa de saldo e entrega de margem.

## Dados econômicos por OS
- valor bruto de peças e mão de obra;
- desconto concedido;
- custo real das peças;
- material de consumo;
- deslocamento;
- taxa de pagamento;
- custo de retrabalho ou garantia;
- outros custos variáveis;
- valor efetivamente recebido;
- vencimento do saldo;
- tempo técnico em minutos.

## Cálculos
Receita da OS = peças + mão de obra - desconto.

Custo variável = peças a custo + material de consumo + deslocamento + taxa de pagamento + retrabalho/garantia + outros custos variáveis.

Margem da OS = receita da OS - custo variável.

Saldo a receber = receita da OS - valor recebido.

Receita por hora técnica = receita das OS / horas técnicas registradas.

## Indicadores do painel
- receita das OS no período;
- custo variável;
- margem de contribuição;
- saldo a receber;
- saldo vencido;
- receita por hora técnica;
- margem individual por OS;
- execução sem participação física do fundador.

## Compatibilidade histórica
Quando uma OS antiga estiver marcada como paga, mas ainda não tiver `amount_received` preenchido, o painel considera a receita líquida da OS como recebida para não criar falso saldo pendente durante a transição. Os novos atendimentos devem registrar o valor recebido de forma explícita.

## Regra gerencial
Faturamento não deve ser usado sozinho para decidir contratação, expansão ou preço. A leitura principal passa a ser margem, capacidade produtiva, receita por hora e previsibilidade de recebimento.

## Próxima etapa
Cliente 360: reunir em uma única visão leads, contatos, orçamentos, ordens de serviço, pagamentos, garantias e avaliações do mesmo cliente.