# VALTEC — Acesso administrativo fechado

## Objetivo
Garantir que a Central Valtec funcione como área administrativa fechada, sem auto-cadastro e sem modo demonstração no ambiente operacional.

## Login atual
O fluxo principal da Central é e-mail + senha usando `supabase.auth.signInWithPassword()`.

O e-mail precisa pertencer a uma conta existente no Supabase Auth e o usuário ainda precisa possuir perfil ativo em `admin_profiles` para passar pelas políticas de RLS.

A criação ou alteração de senha usa o fluxo de recuperação por e-mail do Supabase. Esse link serve para definir uma nova senha; depois disso o acesso diário volta a ser e-mail + senha.

## Compatibilidade com o fluxo antigo
O HTML legado ainda contém a estrutura textual do antigo Magic Link/OTP antes de os módulos JavaScript iniciarem. `scripts/admin-access-v2.js` substitui esse comportamento e monta o formulário de senha.

Como defesa adicional, `scripts/supabase.js` continua envolvendo `signInWithOtp` em `admin.html` para sempre forçar `shouldCreateUser: false`. Assim, caso algum trecho legado tente voltar a chamar OTP, ele não poderá criar usuário automaticamente.

## Modo demonstração
O botão `Ver demonstração` é removido da interface operacional. O código legado de demonstração pode continuar existindo internamente até a refatoração do arquivo antigo, mas não possui entrada visível na Central candidata à produção.

## Defesa em profundidade
Autenticação não é autorização.

Mesmo com uma conta válida no Supabase Auth, a Central exige registro ativo em `admin_profiles`. As tabelas administrativas usam RLS e os helpers de autorização foram movidos para o schema `private`.

A trilha de auditoria de banco também é append-only para a aplicação e registra mudanças nas entidades críticas.

## Senha
A interface exige no mínimo 8 caracteres na criação/alteração de senha.

O advisor do Supabase ainda informa `Leaked Password Protection Disabled`. Como o fluxo principal agora utiliza senha, essa configuração passa a ser uma pendência real de segurança da plataforma e deve ser habilitada no Dashboard do Supabase antes de considerar o acesso administrativo totalmente endurecido.

O conector utilizado nesta sessão não expõe essa configuração de Auth; portanto ela não deve ser simulada por SQL.

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

## Identidade visual
A cópia antiga de `assets/valtec-logo-oficial.png` no repositório está truncada. Até o binário completo ser substituído pelo original preservado no Drive, a Central usa `assets/valtec-simbolo-compacto.png`, que é um asset oficial válido, evitando renderizar uma marca quebrada.

## GO/NO-GO do acesso
Antes do merge da Release Candidate:
1. entrar com uma conta administrativa existente;
2. confirmar bloqueio de conta sem perfil ativo;
3. confirmar recuperação/criação de senha;
4. confirmar ausência do modo demonstração;
5. habilitar Leaked Password Protection no Supabase Auth;
6. revisar Site URL, Redirect URLs e SMTP;
7. confirmar a marca oficial renderizando corretamente em desktop e mobile.
