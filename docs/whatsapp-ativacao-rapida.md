# Ativação rápida do WhatsApp — Valtec

## Objetivo

Colocar o WhatsApp Business Platform da Meta como entrada oficial da Central Valtec sem depender de IA generativa.

A forma mais segura de começar é usar primeiro o **número de teste da Meta**. Depois que webhook, banco e fluxo interno estiverem validados, o número oficial da Valtec pode ser conectado.

## 1. Pré-requisitos

Na Meta:

- portfólio empresarial;
- aplicativo em Meta for Developers com produto WhatsApp;
- WhatsApp Business Account;
- número de teste ou número comercial;
- Phone Number ID;
- App Secret;
- access token.

Para teste, o token temporário serve. Para operação contínua, use um token apropriado de sistema e mantenha-o somente no backend.

## 2. Variáveis no Vercel

Configure no projeto `valtec-solucoes`:

```text
SUPABASE_URL=
SUPABASE_SECRET_KEY=
SUPABASE_PUBLISHABLE_KEY=

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_GRAPH_VERSION=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

VALTEC_STAFF_WHATSAPP_PHONES=5571XXXXXXXXX
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
```

`VALTEC_STAFF_WHATSAPP_PHONES` é uma lista separada por vírgulas. Esses números são considerados equipe interna.

Exemplo:

```text
VALTEC_STAFF_WHATSAPP_PHONES=5571999999999,5571888888888
```

O número interno deve ser diferente do número remetente da Cloud API.

## 3. Banco

Aplicar, nesta ordem:

```text
supabase/migrations/016_whatsapp_operational_mvp.sql
supabase/migrations/017_service_evidence_capture.sql
```

A migration 017 não torna fotos e vídeos públicos. Os arquivos continuam no bucket privado `lead-media`.

## 4. Webhook

No painel do WhatsApp da Meta:

```text
Callback URL:
https://SEU-DOMINIO/api/whatsapp-webhook

Verify token:
mesmo conteúdo de WHATSAPP_VERIFY_TOKEN
```

Depois da validação, assine o campo de mensagens do WhatsApp para que entradas e status cheguem ao webhook.

O backend valida a assinatura `X-Hub-Signature-256` usando `WHATSAPP_APP_SECRET`.

## 5. Teste mínimo

Do número cadastrado em `VALTEC_STAFF_WHATSAPP_PHONES`, mande para o número de teste/Valtec:

```text
AJUDA
```

O sistema deve devolver os comandos.

Depois teste:

```text
ATENDIMENTO Nome do cliente
ANTES: estado inicial do equipamento
```

Envie uma foto ou vídeo.

Continue:

```text
DURANTE: o que foi desmontado ou corrigido
DEPOIS: teste final
ENCERRAR
```

Na Central Valtec, abra **Antes / Depois**.

## 6. Critério para ativar no número oficial

Só migrar/ativar o número oficial depois que estes pontos funcionarem no teste:

- webhook recebe mensagens;
- mensagens duplicadas não duplicam evidências;
- mídia é salva no bucket privado;
- cliente correto é identificado;
- número interno não cria lead;
- tela Antes / Depois abre os arquivos;
- fluxo normal de clientes continua funcionando;
- handoff humano continua funcionando.

## Observação

A integração foi desenhada para funcionar sem OpenAI. A descrição da evidência é escrita pelo profissional; o sistema cuida de contexto, organização, vínculo, armazenamento e recuperação.
