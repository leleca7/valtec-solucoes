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

## Qualidade dos dados
A Gestão também audita registros que podem produzir indicador incompleto ou decisão errada:
- lead ativo sem próxima ação completa;
- OS ativa sem técnico responsável;
- OS concluída sem registro da participação física do fundador;
- preventiva de equipamento empresarial próxima ou vencida;
- contrato empresarial ativo sem próxima visita/preventiva;
- técnico com autonomia incompatível com a liberação para trabalhar sozinho ou assumir rota;
- peça abaixo do mínimo sem fornecedor preferencial.

Esses itens aparecem em um painel próprio de qualidade dos dados. Campo vazio relevante vira pendência operacional, não resultado positivo.

## Severidade
As exceções são ordenadas em três níveis:
- crítica: atraso relevante, inconsistência de execução ou risco financeiro/operacional;
- atenção: situação vencida, cadastro incompleto ou se aproximando de um limite;
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

Os 3 leads existentes estão em status `novo`, têm mais de 6 horas desde a criação e estão sem próxima ação completa. Portanto, devem aparecer tanto como exceções críticas de primeira resposta quanto como falhas de qualidade de registro.

O catálogo atual não possui item abaixo do estoque mínimo, portanto a regra de peça crítica sem fornecedor não gera alerta na fotografia atual.

## Dependência validada
A Etapa 8 está baseada diretamente no head validado da Etapa 7. Nenhuma migration do Estoque é reescrita pela Gestão.

Os arquivos específicos desta etapa são:
- `management-central.css`;
- `scripts/management-central.js`;
- `management-quality.css`;
- `scripts/management-quality.js`;
- import em `scripts/admin.js`;
- este documento.

## Preview
A Vercel está bloqueando novos builds desta branch pelo limite de builds do plano Hobby (`build-rate-limit`). O commit da Gestão não chegou a executar um novo build; portanto, a PR continua em draft até existir um preview autenticado da versão atual.

Esse bloqueio é de plataforma/limite de plano e não deve ser interpretado como falha de compilação da aplicação.

## Regra de gestão
O painel não substitui rotina de gestão. Ele reduz o trabalho de procurar problema.

A rotina recomendada é:
1. abrir Gestão no início do expediente;
2. resolver ou encaminhar exceções críticas;
3. corrigir registros incompletos que afetem indicadores;
4. distribuir execução e próximos passos;
5. revisar financeiro e capacidade semanalmente;
6. usar tendências mensais para preço, contratação, estoque e expansão.

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