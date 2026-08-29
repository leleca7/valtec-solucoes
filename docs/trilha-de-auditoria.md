# VALTEC — Trilha de auditoria operacional

## Objetivo
Garantir rastreabilidade de alterações críticas independentemente da tela, script ou RPC que modificou o registro.

## Situação anterior
`admin_audit_log` já existia, mas a gravação era feita manualmente pela interface administrativa. Havia 10 eventos históricos, todos relacionados a peças.

Esse modelo tinha duas limitações:
- mudanças realizadas fora das funções que chamavam `audit()` podiam não ser registradas;
- administradores tinham permissão de INSERT, UPDATE e DELETE no próprio log, reduzindo o valor da trilha como evidência operacional.

## Nova arquitetura
A migration `013_audit_trail.sql` cria a função privada `private.audit_valtec_change()` e triggers de banco em 18 tabelas críticas.

As alterações são registradas depois de INSERT, UPDATE ou DELETE.

## Tabelas auditadas
- `clients`;
- `leads`;
- `quotes`;
- `quote_items`;
- `service_orders`;
- `receipts`;
- `warranties`;
- `expenses`;
- `parts_catalog`;
- `site_settings`;
- `admin_profiles`;
- `business_accounts`;
- `business_assets`;
- `technicians`;
- `technician_skills`;
- `suppliers`;
- `inventory_movements`;
- `service_order_parts`.

## Conteúdo da auditoria
O log registra:
- ator autenticado quando disponível;
- ação (`criou`, `atualizou`, `excluiu`);
- tipo da entidade;
- ID da entidade;
- campos que mudaram;
- transições de status quando aplicável;
- transição de pagamento;
- transição de contrato;
- transição de autonomia técnica;
- alteração de função administrativa;
- tipo de movimento de estoque.

A função não copia nomes, telefones, endereços, notas ou mídia para `details`. O objetivo é rastrear a mudança sem duplicar conteúdo pessoal/sensível desnecessariamente.

## Log append-only
Para usuários da aplicação:
- `anon` não possui acesso ao log;
- `authenticated` pode receber `SELECT`, condicionado à RLS administrativa;
- `authenticated` não possui INSERT, UPDATE ou DELETE direto;
- a sequência de IDs não é exposta a `anon` ou `authenticated`;
- novos eventos reais são inseridos pelo trigger `SECURITY DEFINER` localizado no schema `private`.

A política anterior `admins manage audit log` foi substituída por `admins read audit log`.

## Compatibilidade da interface
A Central continua lendo `admin_audit_log` normalmente.

As chamadas antigas de `audit()` na interface tornam-se redundantes para dados reais; como a função atual não lança erro de interface quando o INSERT é recusado, o fluxo operacional não é interrompido. Em uma futura refatoração de `admin-central.js`, essas chamadas podem ser removidas para eliminar requisições desnecessárias. No modo demonstração, o histórico local continua sendo útil.

## Smoke test
A migration `014_audit_trail_smoke_test.sql` foi aplicada no banco real e validou:
- INSERT em registro temporário;
- UPDATE do registro;
- DELETE do registro;
- três eventos de auditoria correspondentes;
- registro do campo efetivamente alterado;
- ausência de SELECT para `anon`;
- ausência de INSERT/UPDATE/DELETE para `authenticated`;
- manutenção de SELECT para `authenticated`;
- limpeza completa do registro e da auditoria de teste.

O smoke test terminou com sucesso.

## Preservação do histórico
Após o teste, `admin_audit_log` continuou com os mesmos 10 registros históricos anteriores. Nenhum evento de teste permaneceu.

## Validação estrutural
A leitura de `pg_trigger` confirmou 18 triggers `audit_*` habilitados no schema `public`.

## Regra operacional
Auditoria não substitui autorização. A RLS continua determinando quem pode executar a ação; a trilha registra o que ocorreu depois que a alteração foi permitida.
