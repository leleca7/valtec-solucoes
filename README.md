# Valtec Soluções — site

Base simples, rápida e editável sem framework para a Valtec Soluções.

## Estrutura

- `index.html`: página principal
- `atendimento.html`: abertura de atendimento
- `admin.html`: Central Valtec
- `styles.css`: estilos globais
- `config.js`: dados públicos de contato e configuração do Supabase
- `scripts/`: lógica das páginas e dos módulos administrativos
- `supabase/migrations/`: histórico versionado do schema

## Central Valtec

A Release Candidate consolidada está sendo validada na PR #19 e reúne:

- Leads
- Ordens de serviço e agenda
- Financeiro por OS
- Cliente 360
- Valtec Empresas
- Equipe técnica
- Estoque e fornecedores
- Gestão e qualidade de dados
- Auditoria automática
- Acesso administrativo fechado

O schema de produção está sincronizado ao `main` até a migration `014_audit_trail_smoke_test.sql`.

## Segurança

O frontend usa somente a publishable key do Supabase. Não adicionar `service_role`, tokens privados ou credenciais ao repositório.

A Central usa e-mail + senha para contas administrativas existentes. Recuperação/criação de senha ocorre por e-mail. A autenticação não substitui autorização: o usuário também precisa de perfil ativo em `admin_profiles` e passa pelas políticas de RLS.

## Validação

A candidata final possui QA automatizado no GitHub para:

- sintaxe JavaScript;
- imports locais;
- presença dos módulos críticos;
- ausência de emojis nos novos módulos operacionais;
- smoke test de servidor estático;
- smoke test de renderização em navegador.

O merge final depende ainda dos testes autenticados e da checklist de GO/NO-GO documentada no projeto.
