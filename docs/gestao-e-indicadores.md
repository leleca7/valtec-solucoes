# Central Valtec — Etapa 8: Gestão e indicadores

## Objetivo
Transformar a Central em uma ferramenta de gestão por exceção. A liderança deixa de procurar manualmente o que está atrasado e passa a receber uma fila do que saiu do fluxo normal.

## Indicadores principais
- tempo médio de primeira resposta aos leads;
- conversão de lead para etapa operacional;
- aprovação de orçamentos decididos;
- margem das OS concluídas;
- saldo a receber;
- execução sem participação física do fundador;
- receita recorrente mensal de empresas;
- quantidade de peças abaixo do estoque mínimo.

## Fila gerencial
A Central sinaliza automaticamente situações que pedem decisão ou acompanhamento:
- lead novo sem primeiro contato;
- próxima ação de lead vencida;
- orçamento enviado sem decisão por tempo excessivo;
- OS agendada e ainda aberta depois do horário;
- saldo vencido de OS;
- retorno técnico atrasado;
- ação comercial B2B vencida;
- preventiva empresarial próxima ou vencida;
- estoque abaixo do mínimo ou zerado.

## Severidade
As exceções são ordenadas em três níveis:
- crítica: atraso relevante ou risco financeiro/operacional;
- atenção: situação vencida ou se aproximando de um limite;
- planejada: compromisso futuro próximo que exige preparação.

## Comercial
O painel agrupa leads por origem e mostra volume e conversão. Isso permite comparar site, WhatsApp, indicação, Google, Instagram e outras fontes sem analisar cada lead individualmente.

## Capacidade técnica
Para técnicos ativos, a gestão consegue acompanhar:
- OS concluídas no período;
- retornos;
- percentual de execução sem participação física do fundador quando o dado estiver preenchido;
- autonomia cadastrada quando ainda não houver histórico suficiente.

## Ausência de dados
A Central não transforma ausência de informação em resultado positivo. Quando ainda não há base para calcular uma métrica, mostra `Sem base`.

Isso é intencional: dado não registrado deve aparecer como lacuna operacional, e não como desempenho bom.

## Validação no banco real
Em 28/08/2026 foi confirmado que todas as tabelas e campos necessários ao painel estão disponíveis no projeto `valtec soluções`.

Na fotografia atual do banco:
- 3 leads;
- 0 orçamentos;
- 0 OS;
- 0 empresas B2B;
- 0 técnicos cadastrados;
- 12 peças no catálogo;
- 0 garantias.

Os 3 leads existentes estão em status `novo` e já têm mais de 6 horas desde a criação, portanto serão apresentados como exceções críticas de primeira resposta quando o painel for aberto.

## Dependência validada
A Etapa 8 está baseada diretamente no head validado da Etapa 7. O diff da branch de Gestão contém apenas:
- `management-central.css`;
- `scripts/management-central.js`;
- import em `scripts/admin.js`;
- este documento.

Nenhuma migration do Estoque é reescrita pela Etapa 8.

## Regra de gestão
O painel não substitui rotina de gestão. Ele reduz o trabalho de procurar problema.

A rotina recomendada é:
1. abrir Gestão no início do expediente;
2. resolver ou encaminhar exceções críticas;
3. distribuir execução e próximos passos;
4. revisar financeiro e capacidade semanalmente;
5. usar tendências mensais para preço, contratação, estoque e expansão.

## Próximas evoluções
Depois que houver volume real de dados, podem entrar:
- metas por período;
- comparação mês contra mês;
- cohort de clientes recorrentes;
- margem por tipo de serviço;
- margem por equipamento;
- produtividade por rota;
- custo de aquisição por origem;
- alertas automáticos externos por WhatsApp/e-mail somente após o fluxo manual estar estável.