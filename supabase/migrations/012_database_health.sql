-- VALTEC — saúde do banco: índices de foreign key e simplificação de RLS
-- Mudanças aditivas/semântica equivalente de acesso.

-- Foreign keys usadas no histórico Cliente 360 e vínculos financeiros.
create index if not exists receipts_client_id_idx
  on public.receipts(client_id);

create index if not exists receipts_service_order_id_idx
  on public.receipts(service_order_id);

create index if not exists warranties_client_id_idx
  on public.warranties(client_id);

create index if not exists warranties_service_order_id_idx
  on public.warranties(service_order_id);

-- A política geral abaixo já permite SELECT de admin_profiles para todo
-- perfil administrativo ativo por meio de private.is_valtec_admin().
-- As duas políticas removidas eram apenas subconjuntos permissivos da mesma regra:
-- 1) próprio perfil ativo;
-- 2) marketing_admin ativo.
-- Removê-las não amplia nem reduz o conjunto efetivo de linhas acessíveis.
drop policy if exists "admin can read own profile" on public.admin_profiles;
drop policy if exists "marketing admin can read team" on public.admin_profiles;
