# VALTEC — Release Candidate e GO/NO-GO

## Candidata oficial
A única rota candidata à produção é a PR #19 — Release Candidate — Central Valtec completa.

## O que já está validado
- schema de produção sincronizado ao main;
- migrations 004–014 aplicadas e versionadas;
- smoke test de estoque aprovado;
- smoke test de auditoria aprovado;
- 18 triggers de auditoria ativos;
- advisors estruturais de banco corrigidos;
- JavaScript validado por `node --check`;
- imports do `scripts/admin.js` validados;
- arquivos críticos presentes;
- ausência de emojis nos novos módulos operacionais;
- servidor estático validado;
- renderização desktop/mobile validada em navegador automatizado;
- candidata alinhada ao main sem repetir migrations no diff.

## Achado visual corrigido
A antiga cópia de `assets/valtec-logo-oficial.png` no repositório está truncada. A Central candidata passou a usar o símbolo compacto oficial válido para impedir marca quebrada no login e na navegação administrativa. O original completo permanece preservado no Drive e pode substituir o binário antigo em uma manutenção de assets.

## Acesso administrativo real
O fluxo principal é e-mail + senha. A criação/alteração de senha utiliza recuperação por e-mail do Supabase.

Pendências de plataforma antes de declarar o acesso totalmente endurecido:
- habilitar Leaked Password Protection;
- revisar signup global;
- revisar Site URL e Redirect URLs;
- revisar SMTP/remetente de recuperação de senha.

## Teste operacional autenticado obrigatório
Com um administrador real:
1. entrar na Central;
2. confirmar carregamento de Leads;
3. alterar status e próxima ação de um lead;
4. criar/editar cliente;
5. criar orçamento e transformar em OS;
6. preencher dados operacionais e financeiros da OS;
7. conferir Cliente 360;
8. cadastrar empresa e equipamento;
9. cadastrar técnico e atribuir a uma OS;
10. registrar entrada de estoque, consumo de peça e estorno;
11. conferir Gestão e auditoria;
12. revisar desktop e mobile autenticados.

## Critério de merge
A PR #19 só deve sair de draft quando o teste autenticado acima passar sem erro crítico e as configurações de Auth forem revisadas.
