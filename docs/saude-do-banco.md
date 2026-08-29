# VALTEC — Saúde e performance do banco

## Objetivo
Corrigir avisos de performance que representam problemas estruturais reais sem remover índices úteis apenas porque o banco ainda tem pouco volume.

## Foreign keys sem índice
O advisor do Supabase apontava quatro foreign keys sem índice de cobertura:
- `receipts.client_id`;
- `receipts.service_order_id`;
- `warranties.client_id`;
- `warranties.service_order_id`.

A migration `012_database_health.sql` adiciona índices B-tree para os quatro vínculos.

Esses vínculos são usados especialmente por histórico de cliente, OS, recibos e garantias. Os índices também reduzem o custo de operações de integridade referencial quando os dados crescerem.

## Políticas permissivas redundantes
`admin_profiles` tinha três políticas permissivas de SELECT para `authenticated`:
- `admin can read own profile`;
- `admins can read team profiles`;
- `marketing admin can read team`.

Após o hardening da migration 011, `admins can read team profiles` usa `private.is_valtec_admin()`, que retorna verdadeiro para qualquer perfil administrativo ativo.

As outras duas políticas eram subconjuntos da regra geral:
- próprio perfil ativo é um subconjunto dos perfis que um admin ativo pode ler;
- `marketing_admin` ativo também é um subconjunto dos admins ativos.

A migration remove somente essas duas regras redundantes. A permissão efetiva de leitura não é ampliada nem reduzida.

## Resultado pós-migration
Após aplicar `database_health` no projeto real:
- os quatro índices existem;
- `admin_profiles` ficou com uma política permissiva de SELECT e uma política de UPDATE;
- o advisor deixou de apontar `unindexed_foreign_keys`;
- o advisor deixou de apontar `multiple_permissive_policies`.

## Índices marcados como “unused”
O advisor ainda lista vários índices como `Unused Index`, inclusive índices recém-criados.

Eles não serão removidos nesta etapa.

O sistema ainda tem pouco volume em várias tabelas, portanto `idx_scan = 0` não prova que um índice é desnecessário. Índices de chaves estrangeiras, status, agenda, próximas ações, técnicos, preventiva e vínculos operacionais devem ser avaliados depois de uso real e volume suficiente.

## Regra de manutenção
Só considerar remoção de índice quando houver:
1. volume real representativo;
2. período suficiente de observação;
3. confirmação de que a consulta correspondente não é relevante;
4. comparação de tamanho/custo de escrita versus benefício de leitura;
5. plano de rollback.

## Advisors
Referências do Supabase:
- Foreign keys sem índice: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- Índices não usados: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index
- Políticas permissivas múltiplas: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies
