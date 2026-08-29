# VALTEC — Release Candidate e GO/NO-GO

## Candidata oficial
A única rota candidata à produção é a PR #19 — Release Candidate — Central Valtec completa.

## Estado técnico
Código e banco estão prontos para validação humana final. A candidata permanece em draft apenas para validar sessão real, RLS pela interface e configurações de Supabase Auth antes do merge.

## O que já está validado
- schema de produção sincronizado ao `main`;
- migrations 004–015 aplicadas e versionadas;
- migration 015 executou smoke test integrado e limpou os próprios dados temporários;
- smoke test de estoque aprovado;
- smoke test de auditoria aprovado;
- 18 triggers de auditoria ativos;
- 22 tabelas do schema `public` com RLS habilitado;
- acesso anônimo restrito a inserir leads, inserir analytics e ler áreas de atendimento ativas;
- advisors estruturais de banco corrigidos;
- 2 contas Auth e 2 perfis administrativos ativos, sem órfãos;
- 2/2 contas administrativas com senha configurada e e-mail confirmado;
- JavaScript validado por `node --check`;
- imports do `scripts/admin.js` validados;
- `admin-access-v2.js` carregado explicitamente antes da Central legada;
- guardrail de acesso por senha e recuperação aprovado;
- guardrail contra segredos privados aprovado;
- ausência de emojis nos novos módulos operacionais;
- servidor estático validado;
- renderização desktop/mobile validada em navegador automatizado;
- candidata 0 commits atrás do `main` e sem migrations no diff efetivo;
- login final renderizado sem modo demonstração;
- formulário por e-mail + senha validado no navegador;
- E2E autenticado simulado aprovado em 14 áreas administrativas;
- fixtures de Cliente, Lead, Empresa, Técnico e Estoque renderizadas no E2E;
- Gestão carregada no E2E;
- interface administrativa sem exibir binários de marca não confiáveis.

## Pipelines obrigatórios da release
No head final, todos devem permanecer verdes:
1. `Validate Central Valtec`;
2. `Central Valtec QA`;
3. `Admin Access Guard`;
4. `Full UI Mock E2E`;
5. `Release Security Guard`.

## Marca
A marca gráfica oficial íntegra está preservada no Drive. Os binários antigos presentes no repositório não foram considerados confiáveis para representar a marca completa na Central administrativa desta release.

A candidata não recria, redesenha nem aproxima a logo. As imagens administrativas potencialmente corrompidas são ocultadas e a identificação textual `Central Valtec` permanece. A marca gráfica deve voltar somente depois que o asset oficial íntegro do Drive substituir a cópia antiga no repositório por um fluxo binário confiável.

## Acesso administrativo real
O fluxo principal é e-mail + senha. A criação/alteração de senha utiliza recuperação por e-mail do Supabase.

A autenticação isoladamente não libera dados: é necessário perfil ativo em `admin_profiles` e aprovação das políticas de RLS.

## Configurações de plataforma ainda manuais
Antes de declarar o acesso totalmente endurecido:
- habilitar Leaked Password Protection;
- revisar a política global de novos cadastros;
- revisar Site URL e Redirect URLs;
- revisar SMTP/remetente de recuperação de senha.

Essas opções não estão disponíveis no conector usado nesta sessão e não devem ser simuladas por SQL.

## Teste humano final obrigatório
Com uma das contas administrativas reais:
1. entrar por e-mail + senha;
2. confirmar que os dados reais carregam normalmente;
3. alterar status/próxima ação de um lead controlado;
4. salvar uma alteração operacional controlada pela interface;
5. confirmar reflexo em Gestão e Histórico/Auditoria;
6. revisar a experiência autenticada em desktop ou celular.

Os fluxos de banco de estoque, auditoria e integração completa já têm smoke tests próprios. O objetivo desta rodada é validar navegador + sessão real + RLS + interface em conjunto.

## Critério de merge
A PR #19 só deve sair de draft quando o teste humano acima passar sem erro crítico e as quatro configurações de Auth forem revisadas.

Depois disso, a fase de construção digital está encerrada e começa a implantação operacional de 30 dias.
