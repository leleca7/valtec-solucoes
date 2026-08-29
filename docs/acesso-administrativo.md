# VALTEC — Acesso administrativo fechado

## Objetivo
Garantir que a Central Valtec funcione como uma área administrativa fechada, sem auto-cadastro de usuários e sem modo demonstração acessível no ambiente operacional.

## Login atual
A Central usa Supabase Auth por Magic Link/OTP enviado ao e-mail administrativo.

Esse é um fluxo passwordless. O usuário não informa senha na aplicação.

## Problema identificado
O arquivo legado da Central chamava `signInWithOtp` com:

`shouldCreateUser: true`

No Supabase, usuários inexistentes são criados automaticamente por padrão no fluxo de Magic Link/OTP. A RLS e `admin_profiles` impediam que esses usuários vissem dados administrativos, mas o Auth poderia acumular contas não autorizadas.

A tela também exibia o botão `Ver demonstração`, que permitia abrir uma Central com dados fictícios sem autenticação. Ele não expunha dados reais, mas não pertence ao fluxo de uma operação em produção.

## Correção implementada
### Fechamento do OTP
`scripts/supabase.js` identifica `admin.html` e envolve `auth.signInWithOtp` para forçar:

`shouldCreateUser: false`

A opção é aplicada por último, portanto uma chamada legada não consegue sobrescrevê-la com `true`.

Isso segue a documentação oficial do Supabase para impedir cadastro automático no fluxo passwordless.

### Remoção da demonstração
`scripts/admin-no-emoji.js` remove `#demo-button` da Central operacional.

O modo demonstração interno continua no código legado por compatibilidade durante a futura refatoração, mas não possui entrada pela interface de produção.

## Defesa em profundidade já existente
Mesmo antes desta correção, possuir uma conta em Supabase Auth não concedia acesso administrativo.

Após autenticar, a Central exige um registro ativo em `admin_profiles`, e a RLS protege as tabelas administrativas.

As migrations de segurança anteriores também moveram os helpers de autorização para o schema `private`.

## Configuração de plataforma ainda recomendada
A proteção no cliente impede auto-cadastro através da própria Central, mas a publishable key é pública por definição e a API de Auth é acessível externamente.

Para um ambiente administrativo totalmente fechado, deve-se também revisar no Dashboard do Supabase as configurações de Auth/Email e desabilitar novos signups quando essa opção for compatível com o fluxo desejado.

Essa configuração não está disponível no conector usado nesta sessão e não deve ser simulada por SQL.

## Leaked Password Protection
O advisor do Supabase ainda informa `Leaked Password Protection Disabled`.

A Central atual usa Magic Link/OTP e não utiliza login por senha, portanto esse aviso não protege o mecanismo administrativo principal atual. Ainda assim, se autenticação por senha for habilitada no futuro, a proteção deve ser ligada.

## E-mail transacional
A documentação do Supabase recomenda SMTP próprio para produção. O serviço de e-mail padrão é adequado para testes e tem limites/entrega em best effort.

Antes de depender do Magic Link como acesso operacional diário, a VALTEC deve validar:
- remetente próprio;
- SMTP de produção;
- Site URL correta;
- Redirect URLs permitidas;
- entrega de Magic Link nos e-mails administrativos;
- procedimento de contingência de acesso.

## Referência oficial
Supabase — Passwordless email logins:
https://supabase.com/docs/guides/auth/auth-email-passwordless
