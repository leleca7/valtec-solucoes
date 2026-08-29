# Valtec Soluções — site + mini sistema

Primeira versão funcional para assistência técnica em fogões, com foco em uma experiência simples para clientes e um painel administrativo enxuto.

## O que já existe

- Página inicial com serviços, benefícios e consulta de bairro.
- Área principal: Boca do Rio, Costa Azul, Imbuí, Stiep, Pituaçu, Armação e Pituba.
- Formulário em etapas para solicitar atendimento.
- Equipamentos: fogão residencial, fogão industrial, cooktop e outros.
- Problemas: não acende, chama fraca/irregular, boca entupida, apagando, vazamento e outros.
- Upload opcional de foto/vídeo para Supabase Storage.
- Geração automática da mensagem para WhatsApp.
- Tracking de visitas, consultas de bairro, leads e cliques no WhatsApp.
- Painel com login do Supabase Auth, métricas e leads.
- Modo demonstração do painel quando o Supabase ainda não está configurado.
- Gerador de orçamento com itens, quantidade, valor unitário, mão de obra e valor negociado.
- SQL com clientes, atendimentos, orçamentos, itens, leads, métricas, áreas de atendimento e perfis administrativos.
- RLS e grants explícitos para o comportamento atual da Data API do Supabase.
- Módulo operacional de Leads com fila, funil, próxima ação, urgência, WhatsApp e conversão para cliente/orçamento/OS.
- Cadastro manual de leads vindos de WhatsApp, ligação, indicação, Google, Instagram e prospecção B2B, com proteção contra duplicidade por telefone.

## Rodar localmente

Não há build nem dependências locais. Na pasta do projeto:

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

## Conectar ao Supabase

1. Crie um projeto Supabase exclusivo da Valtec.
2. Execute as migrations da pasta `supabase/migrations` no projeto.
3. Pegue a Project URL e a **Publishable key**.
4. Edite `config.js`:

```js
window.VALTEC_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_...",
  WHATSAPP_NUMBER: "5571XXXXXXXXX",
  PHONE_NUMBER: "+55 71 XXXX-XXXX"
};
```

A publishable key é própria para cliente web quando as tabelas estão protegidas por RLS. **Nunca** coloque `service_role` ou `sb_secret_*` no navegador.

O frontend carrega `@supabase/supabase-js` fixado em `2.111.0` via ESM CDN.

## Criar o primeiro administrador

Primeiro, crie o usuário em **Authentication > Users** no Supabase. Depois, no SQL Editor, associe esse usuário como administrador:

```sql
insert into public.admin_profiles (user_id, display_name)
select id, 'Administrador Valtec'
from auth.users
where email = 'SEU_EMAIL_AQUI';
```

Depois acesse `admin.html` e faça login com esse e-mail e senha.

## Segurança

- Visitantes conseguem **inserir** leads e eventos, mas não ler essas tabelas.
- Mídias ficam em bucket privado; visitantes podem subir arquivo, mas não listar ou baixar.
- Apenas usuários autenticados cadastrados em `admin_profiles` conseguem ler e operar dados administrativos.
- Todas as tabelas do schema `public` têm RLS habilitado.
- O SQL contém `GRANT` explícito porque projetos Supabase novos podem não expor tabelas novas à Data API automaticamente.

## Próximas evoluções

- Histórico completo por cliente.
- Dashboard por período e funil.
- Notificação de novo lead.
- Edição de bairros e preços no painel.
- Integração de domínio, SEO local e Google Business Profile.
- Automação de follow-up e alertas de próxima ação.
