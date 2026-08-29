# VALTEC — Segurança administrativa do Supabase

## Objetivo
Reduzir a superfície exposta pela Data API sem alterar a lógica de autorização já usada pela Central Valtec.

## Problema identificado
O advisor do Supabase sinalizava duas funções `SECURITY DEFINER` no schema `public`:
- `public.is_valtec_admin()`;
- `public.is_valtec_marketing_admin()`.

As funções estavam com `search_path` fixado e já bloqueavam `anon` e `PUBLIC`, mas continuavam executáveis por `authenticated` através do schema exposto pela Data API.

## Por que não trocar para SECURITY INVOKER
Esses helpers consultam `admin_profiles`, tabela que também usa RLS. A função com `SECURITY DEFINER` evita recursão da política e é um padrão suportado pelo Supabase para helpers de autorização.

A correção apropriada é manter `SECURITY DEFINER`, mas tirar o helper de um schema exposto.

## Correção aplicada
A migration `011_private_admin_helpers.sql`:
- cria o schema `private`;
- remove acesso de `PUBLIC` e `anon` ao schema;
- concede somente o uso necessário a `authenticated`;
- cria `private.is_valtec_admin()` e `private.is_valtec_marketing_admin()`;
- usa `search_path = ''` e referências totalmente qualificadas;
- mantém `EXECUTE` apenas para `authenticated`;
- atualiza políticas de RLS para usar `(select private.is_valtec_admin())`, evitando reexecução desnecessária por linha;
- atualiza as políticas do bucket `valtec-media` em `storage.objects`;
- revoga e remove as antigas funções no schema `public`.

## Políticas migradas
Foram atualizadas políticas em:
- `admin_audit_log`;
- `admin_profiles`;
- `expenses`;
- `image_assets`;
- `parts_catalog`;
- `receipts`;
- `site_settings`;
- `warranties`;
- `storage.objects` para upload, update e delete no bucket `valtec-media`.

## Validação pós-migração
Após a aplicação:
- somente as versões no schema `private` existem;
- ambas continuam `SECURITY DEFINER`;
- `search_path` está vazio;
- `anon` não tem `EXECUTE`;
- `PUBLIC` não tem `EXECUTE`;
- `authenticated` mantém `EXECUTE` para avaliação das políticas;
- todas as políticas dependentes apontam para os novos helpers privados;
- o advisor de segurança deixou de mostrar os dois avisos de funções `SECURITY DEFINER` expostas.

## Aviso de segurança restante
O único aviso do advisor é `Leaked Password Protection Disabled` no Supabase Auth.

Essa configuração não é uma migration PostgreSQL. Deve ser habilitada nas configurações de autenticação do projeto quando disponível no plano/ambiente, para impedir senhas conhecidas como comprometidas.

Referência do Supabase:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Limitação da validação automática
O conector SQL usado nesta sessão não permite assumir o papel PostgreSQL `authenticated`, portanto não foi possível reproduzir uma sessão JWT do navegador por `SET ROLE`.

A validação estrutural confirmou privilégios, políticas e advisors. O teste final de acesso administrativo deve continuar fazendo parte da validação autenticada da Central antes de integrar as branches de interface.