# Valtec Soluções — site

Base simples, rápida e editável sem framework para a Valtec Soluções.

> **Checkpoint atual do WhatsApp operacional:** [`docs/CHECKPOINT-2026-09-21-WHATSAPP-OPERACIONAL.md`](docs/CHECKPOINT-2026-09-21-WHATSAPP-OPERACIONAL.md). Revisar esse documento antes de alterar webhook, classificação de contatos, contexto conversacional, áudio, evidências ou integração com o número oficial.

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

O schema de produção está sincronizado ao `main` até a migration `021_whatsapp_contact_classification.sql`. As migrations 016–021 cobrem WhatsApp operacional, evidências, contexto conversacional, normalização de telefone e classificação de contatos.

## Segurança

O frontend usa somente a publishable key do Supabase. Não adicionar `service_role`, tokens privados ou credenciais ao repositório.

A Central usa e-mail + senha para contas administrativas existentes. Recuperação/criação de senha ocorre por e-mail. A autenticação não substitui autorização: o usuário também precisa de perfil ativo em `admin_profiles` e passa pelas políticas de RLS.

## Identidade administrativa

A Central não recria nem aproxima a marca gráfica. Enquanto os binários antigos do repositório não forem substituídos pela cópia oficial íntegra preservada no Drive, a área administrativa usa a identificação textual `Central Valtec` sem exibir esses assets potencialmente corrompidos.

## Validação

A candidata final possui QA automatizado no GitHub para:

- sintaxe JavaScript;
- imports locais;
- presença dos módulos críticos;
- ausência de emojis nos novos módulos operacionais;
- smoke test de servidor estático;
- smoke test de renderização em navegador desktop/mobile.

O merge final depende ainda dos testes autenticados e da checklist de GO/NO-GO documentada no projeto.
