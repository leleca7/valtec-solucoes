# WhatsApp operacional — Valtec V1

## Objetivo

Transformar o WhatsApp em uma porta de entrada da Central Valtec sem depender de IA generativa paga. A V1 usa regras explícitas para triagem, cria/vincula leads, registra o histórico, salva fotos e vídeos no bucket privado já existente e sinaliza quando uma pessoa precisa assumir a conversa.

A IA fica como extensão futura. O núcleo operacional não depende dela.

## Fluxo implementado

```text
WhatsApp Business Platform
        |
        v
/api/whatsapp-webhook
        |
        +--> motor de regras
        +--> leads
        +--> whatsapp_threads
        +--> whatsapp_messages
        +--> lead-media (fotos e vídeos privados)
        |
        v
Central Valtec > WhatsApp
        |
        +--> assumir atendimento
        +--> responder
        +--> abrir lead
        +--> programar follow-up
        +--> marcar cliente satisfeito
        +--> encerrar / devolver ao bot
```

## O que a V1 faz

- Cria um lead automaticamente no primeiro contato de um número.
- Identifica o contato pelo telefone do WhatsApp.
- Faz triagem por menu e regras, sem IA.
- Pergunta equipamento, problema e bairro.
- Consulta os bairros ativos em `service_areas` quando a pessoa usa a opção de cobertura.
- Faz handoff para humano em perguntas técnicas, preço técnico e situações de segurança.
- Registra todas as mensagens recebidas/enviadas.
- Baixa foto, vídeo, áudio ou documento recebido e salva no bucket privado `lead-media`.
- Vincula a mídia à mensagem e mantém a mídia mais recente também no lead para compatibilidade com o módulo já existente.
- Detecta elogios por palavras-chave e marca `positive_signal`.
- Cria follow-up de 1 dia quando um lead vinculado muda para `orcamento_enviado`.
- Cancela follow-ups quando o cliente responde ou quando o lead avança para agendamento, atendimento, conclusão, perda ou arquivamento.
- Cria pedido de avaliação quando existe sinal positivo e o atendimento está concluído.
- Mostra uma nova caixa de entrada dentro da Central Valtec.

## Regra de segurança

O bot não diagnostica defeitos, não informa se é seguro continuar usando o equipamento e não fecha preço técnico. Mensagens com termos de risco, dúvida técnica ou preço de peça passam para atendimento humano.

## Mensagens agendadas e templates

Follow-up de 1 dia, follow-up de 3 dias e pedido de avaliação são enviados por templates aprovados do WhatsApp. Isso é necessário porque uma mensagem agendada pode cair fora da janela em que texto livre é permitido.

Crie três templates na conta do WhatsApp Business e informe os nomes nas variáveis de ambiente:

- `WHATSAPP_TEMPLATE_FOLLOWUP_1D`
- `WHATSAPP_TEMPLATE_FOLLOWUP_3D`
- `WHATSAPP_TEMPLATE_REVIEW`

A V1 envia esses templates sem parâmetros. Portanto, mantenha o texto e, no caso da avaliação, o link do Google já configurados no próprio template aprovado.

## Variáveis de ambiente do servidor

Estas variáveis ficam no ambiente do deploy. Nunca devem ser colocadas em `config.js`, HTML ou JavaScript do navegador.

```text
SUPABASE_URL=
SUPABASE_SECRET_KEY=
SUPABASE_PUBLISHABLE_KEY=

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_GRAPH_VERSION=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_TEMPLATE_FOLLOWUP_1D=
WHATSAPP_TEMPLATE_FOLLOWUP_3D=
WHATSAPP_TEMPLATE_REVIEW=

CRON_SECRET=
```

`SUPABASE_SECRET_KEY` é a opção preferencial para backend. O código mantém compatibilidade com `SUPABASE_SERVICE_ROLE_KEY` como fallback legado. A chave secreta nunca é enviada ao navegador.

## Webhook do WhatsApp

Depois do deploy, configure no WhatsApp Business Platform:

```text
Callback URL: https://SEU-DOMINIO/api/whatsapp-webhook
Verify token: mesmo valor de WHATSAPP_VERIFY_TOKEN
```

O POST é validado por `X-Hub-Signature-256` usando `WHATSAPP_APP_SECRET`.

## Banco de dados

Aplicar:

```text
supabase/migrations/016_whatsapp_operational_mvp.sql
```

A migration cria:

- `whatsapp_threads`
- `whatsapp_messages`
- `whatsapp_automation_jobs`
- índices operacionais
- RLS exclusiva para administradores ativos
- triggers de follow-up e avaliação

O webhook server-side usa uma chave secreta do Supabase para gravar os eventos recebidos da Meta. O painel usa a sessão normal do administrador e continua protegido pelas políticas de RLS.

## Executor automático

O endpoint abaixo processa jobs vencidos:

```text
GET ou POST /api/whatsapp-automations
Authorization: Bearer <CRON_SECRET>
```

O workflow `.github/workflows/whatsapp-automations.yml` chama esse endpoint a cada hora. Cadastre no GitHub Actions:

```text
VALTEC_AUTOMATION_URL=https://SEU-DOMINIO/api/whatsapp-automations
VALTEC_CRON_SECRET=mesmo valor de CRON_SECRET
```

Se os secrets ainda não estiverem configurados, o workflow termina sem erro e não envia mensagens.

## Caixa de entrada na Central

A nova aba `WhatsApp` mostra:

- mensagens não lidas;
- conversas que exigem humano;
- automações pendentes;
- sinais positivos;
- histórico completo por conversa;
- acesso às mídias privadas por URL assinada;
- resposta manual;
- abertura do lead correspondente;
- follow-up em 24 horas;
- marcação de cliente satisfeito;
- encerramento ou retorno ao fluxo automático.

A demonstração da Central também possui conversas simuladas, então o layout pode ser validado antes da configuração da API.

## Fase 2 — IA opcional

A IA pode ser adicionada depois sem redesenhar o sistema. Os pontos naturais de extensão são:

- classificar intenção de mensagens livres;
- resumir conversa;
- detectar elogio/reclamação com mais precisão;
- sugerir resposta para o profissional;
- extrair itens de uma solicitação de orçamento;
- priorizar leads;
- analisar imagem quando houver política e modelo adequados.

Mesmo com IA, dúvidas de segurança e decisão técnica devem continuar com handoff humano.

## Observação de custo

"Sem IA paga" não significa necessariamente custo zero do canal. A WhatsApp Business Platform, provedores, templates e infraestrutura podem ter cobranças conforme o modelo vigente. A arquitetura separa esses custos da IA e permite operar a V1 sem contratar um modelo generativo.
