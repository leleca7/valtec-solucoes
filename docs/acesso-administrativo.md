# VALTEC — Acesso administrativo fechado

## Objetivo
Garantir que a Central Valtec funcione como área administrativa fechada, sem auto-cadastro e sem modo demonstração no ambiente operacional.

## Login atual
O fluxo principal da Central é e-mail + senha usando `supabase.auth.signInWithPassword()`.

O e-mail precisa pertencer a uma conta existente no Supabase Auth e o usuário ainda precisa possuir perfil ativo em `admin_profiles` para passar pelas políticas de RLS.

A criação ou alteração de senha usa o fluxo de recuperação por e-mail do Supabase. Esse link serve para definir uma nova senha; depois disso o acesso diário volta a ser e-mail + senha.

## Compatibilidade com o HTML legado
O HTML base ainda contém a estrutura original de Magic Link e demonstração. `scripts/admin-access-v2.js` executa antes do uso operacional, remove a entrada de demonstração e transforma o formulário no fluxo por senha.

O QA automatizado renderiza a página em navegador real e verifica o DOM final. A evidência desktop/mobile confirma que o usuário vê apenas e-mail, senha, entrada na Central, criação/alteração de senha e retorno ao site.

Como defesa adicional, `scripts/supabase.js` envolve `signInWithOtp` em `admin.html` para sempre forçar `shouldCreateUser: false`. Assim, se algum trecho legado tentar chamar OTP, ele não poderá criar usuário automaticamente.

## Modo demonstração
O botão `Ver demonstração` é removido da interface operacional. O QA falha caso `#demo-button` permaneça no DOM renderizado.

## Defesa em profundidade
Autenticação não é autorização.

Mesmo com uma conta válida no Supabase Auth, a Central exige registro ativo em `admin_profiles`. As tabelas administrativas usam RLS e os helpers de autorização ficam no schema `private`.

A trilha de auditoria de banco é append-only para a aplicação e registra mudanças nas entidades críticas.

## Senha
A interface exige no mínimo 8 caracteres na criação/alteração de senha.

O advisor do Supabase ainda informa `Leaked Password Protection Disabled`. Como o fluxo principal utiliza senha, essa configuração é uma pendência real de segurança da plataforma e deve ser habilitada no Dashboard do Supabase antes de considerar o acesso totalmente endurecido.

O conector utilizado nesta sessão não expõe essa configuração de Auth; ela não deve ser simulada por SQL.

## Novos usuários
A Central não oferece cadastro público. Novos administradores devem ser provisionados deliberadamente e vinculados a `admin_profiles` com papel e status adequados.

Também é recomendável desabilitar novos signups globalmente no Supabase Auth quando a configuração for compatível com o fluxo operacional escolhido. Essa é uma configuração de plataforma, não uma migration PostgreSQL.

## E-mail transacional
O fluxo de criação/recuperação de senha depende de e-mail. Antes do uso diário, validar:
- remetente e SMTP de produção;
- Site URL;
- Redirect URLs;
- entrega de recuperação de senha aos administradores;
- procedimento de contingência de acesso.

## Identidade visual administrativa
Os binários gráficos antigos presentes no repositório não foram considerados confiáveis para representar a marca completa oficial preservada no Drive. A Release Candidate não recria nem aproxima a logo: as imagens de marca potencialmente corrompidas são ocultadas na Central administrativa.

A identificação textual `Central Valtec` permanece como nome da interface. A marca gráfica deve voltar apenas quando o asset oficial íntegro do Drive substituir o binário antigo do repositório.

## GO/NO-GO do acesso
Antes do merge da Release Candidate:
1. entrar com uma conta administrativa existente;
2. confirmar bloqueio de conta sem perfil ativo;
3. confirmar recuperação/criação de senha;
4. confirmar ausência do modo demonstração;
5. habilitar Leaked Password Protection no Supabase Auth;
6. revisar Site URL, Redirect URLs e SMTP;
7. confirmar desktop e mobile autenticados.
