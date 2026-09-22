# CHECKPOINT — WHATSAPP OPERACIONAL VALTEC — 21/09/2026

## 1. Objetivo atual

A integração do WhatsApp da Valtec não deve ser tratada apenas como “chatbot”.

A direção definida é transformar o WhatsApp em uma **interface operacional da Valtec**, com duas funções principais:

1. **Atendimento organizado ao cliente**, reaproveitando tudo que já é conhecido e evitando perguntas repetidas.
2. **Organização silenciosa da operação**, permitindo que o responsável humano continue respondendo normalmente enquanto o sistema classifica, vincula, registra e estrutura o atendimento.

Princípio atual:

> O sistema deve se adaptar à forma como a pessoa escreve, e não exigir que o cliente fale como um formulário.

Outro princípio importante:

> Contato desconhecido não é automaticamente cliente.

---

## 2. Infraestrutura atual

### Repositório

- GitHub: `leleca7/valtec-solucoes`
- branch principal: `main`

### Deploy

- Vercel: projeto `valtec-solucoes`
- produção: `https://valtec-solucoes.vercel.app`

### Banco

- Supabase: projeto `valtec soluções`
- projeto ref: `msgwcwpvjgjtqhktuust`

### Webhook

Produção:

`https://valtec-solucoes.vercel.app/api/whatsapp-webhook`

O webhook:

- valida o desafio GET da Meta;
- valida `X-Hub-Signature-256` com o App Secret;
- registra mensagens recebidas;
- processa cliente e equipe interna por fluxos diferentes;
- registra mensagens enviadas e status;
- persiste mídia quando aplicável.

Nenhuma credencial secreta deve ser versionada no repositório.

---

## 3. Meta / WhatsApp — o que foi validado

Em 21/09/2026 foi validado o fluxo real ponta a ponta usando o ambiente de teste da Meta.

### Etapas concluídas

- app Meta configurado para WhatsApp;
- callback verificado;
- campo `messages` assinado;
- webhook acessível na Vercel;
- WABA inscrita no app;
- mensagem real recebida do WhatsApp;
- mensagem persistida no Supabase;
- resposta enviada pela Graph API;
- status de entrega/leitura recebido;
- ciclo completo confirmado.

Fluxo validado:

`WhatsApp → Meta → Vercel → Supabase → regras do bot → Meta → WhatsApp`

### WABA

A inscrição da WABA no app foi necessária para que mensagens reais chegassem ao webhook.

Foi criado temporariamente um helper de assinatura da WABA, usado uma única vez e depois removido do `main`.

Resultado da chamada de inscrição:

`success: true`

O helper não permanece exposto em produção.

---

## 4. Erros reais encontrados e correções

### 4.1 Supabase não configurado no runtime

Primeiro teste do webhook chegou na Vercel, mas falhou porque o backend não tinha `SUPABASE_URL`.

Correção:

- `SUPABASE_URL` configurada;
- `SUPABASE_SECRET_KEY` configurada;
- novo deploy realizado.

Depois disso o webhook passou a persistir mensagens.

### 4.2 WABA não inscrita no app

O webhook estava verificado e `messages` aparecia assinado na interface da Meta, mas mensagens reais ainda não chegavam.

Correção:

- inscrição explícita da WABA em `/{WABA_ID}/subscribed_apps`.

Depois disso a mensagem real chegou ao webhook.

### 4.3 Erro `#131030 Recipient phone number not in allowed list`

O webhook recebia e salvava a mensagem, mas a Meta recusava a resposta porque o destinatário ainda não estava autorizado no ambiente de teste.

Correção:

- destinatário adicionado/validado no teste da Meta;
- mensagem `hello_world` recebida;
- novo teste de entrada executado.

### 4.4 Conversa ficou travada como “aguardando humano”

Uma falha de envio anterior marcava `human_required=true`.

Mesmo depois de corrigir a causa externa, o bot permanecia silencioso.

Correções:

- estado da conversa limpo;
- backend alterado para que falha de infraestrutura no envio não transforme automaticamente a conversa em handoff humano permanente;
- contexto passa a ser preservado para uma tentativa seguinte.

### 4.5 Celular brasileiro chegou sem o nono dígito

A Meta entregou o remetente em formato brasileiro legado, sem o 9 adicional.

Isso fazia o envio ser direcionado para um número diferente do autorizado.

Correções:

- normalização de telefone no backend;
- normalização também usada no banco;
- celulares brasileiros legados são convertidos para o formato canônico;
- site e WhatsApp passam a reconhecer o mesmo telefone.

### 4.6 Token temporário expirou durante teste

O motor de conversa interpretou corretamente a mensagem, mas a Meta devolveu erro de autenticação no envio.

Correção operacional:

- token temporário renovado no ambiente;
- deploy atualizado;
- contexto mantido;
- teste continuou do ponto em que tinha parado.

Regra para produção:

> Não depender de token temporário da Meta em operação contínua.

---

## 5. Teste de entendimento de texto ruim

Foi executado um teste proposital com escrita incorreta:

`Meu fogaum nn acende`

O sistema extraiu corretamente:

- equipamento: **Fogão residencial**
- problema: **Não acende**

Como esses dois dados já estavam conhecidos, perguntou somente o campo faltante:

- bairro

Resposta seguinte usada no teste:

`Boca do Rio`

O sistema manteve o contexto e passou para a etapa de mídia sem perguntar novamente equipamento ou problema.

Depois, ao receber:

`seguir`

o sistema concluiu que a triagem mínima estava completa e encaminhou o atendimento organizado para continuidade humana.

Esse teste confirmou:

- normalização de escrita;
- sinônimos e aproximação de termos;
- contexto acumulado;
- perguntas somente sobre informação faltante.

---

## 6. Inteligência conversacional implementada

Arquivo principal:

`server/whatsapp-intelligence.mjs`

A inteligência atual é determinística e não depende de IA generativa paga.

Ela já consegue:

- normalizar texto;
- tolerar alguns erros de digitação;
- reconhecer equipamento;
- reconhecer problemas comuns;
- reconhecer saudações;
- reconhecer pedido de humano;
- reconhecer pergunta de cobertura;
- reconhecer acompanhamento de orçamento;
- extrair campos de mensagem estruturada;
- aproveitar o campo esperado pela etapa atual;
- calcular dados faltantes;
- manter snapshot do contexto.

### Contexto salvo por conversa

`whatsapp_threads` passou a armazenar:

- `conversation_context`
- `last_intent`
- `context_updated_at`

Exemplo conceitual:

```text
known:
- equipment
- problem
- neighborhood

missing:
- campos ainda necessários

intent:
- repair_request

origin:
- whatsapp / site

media_requested:
- true/false
```

Regra:

> Antes de perguntar algo, verificar se o dado já é conhecido.

---

## 7. Integração site → WhatsApp

Foi implementada associação por telefone normalizado.

Quando chega uma conversa do WhatsApp, o sistema procura:

1. lead recente do site com o mesmo telefone;
2. cliente existente com o mesmo telefone;
3. somente depois avalia se precisa criar um novo lead.

Para lead recente vindo do site:

- reutiliza `lead_id`;
- reutiliza `client_id` quando existir;
- preserva nome e informações já preenchidas;
- não pergunta novamente campos conhecidos.

Busca atual de lead do site:

- telefone normalizado;
- origem `site`;
- janela recente de até 24 horas;
- status operacional compatível.

A regra de produto é:

> Formulário e WhatsApp são duas entradas do mesmo atendimento, não dois cadastros separados.

Ainda precisa ser executado o teste final real de formulário do site → WhatsApp ponta a ponta.

---

## 8. Áudio

O webhook já reconhece mensagens do tipo `audio` e a infraestrutura de mídia pode armazenar o arquivo privado.

Estado atual:

- áudio não é ignorado;
- cliente não precisa ser obrigado a escrever novamente;
- mídia fica vinculada ao atendimento;
- por enquanto o fluxo faz handoff para uma pessoa ouvir e continuar.

Próxima evolução:

`áudio → download privado → transcrição → texto → mesmo motor conversacional`

A transcrição deve alimentar exatamente o mesmo pipeline usado para texto.

Não criar um “bot de áudio” separado.

---

## 9. Mídia e evidências de serviço

O banco de produção possui suporte a evidências técnicas.

Tabelas:

- `service_evidence_sessions`
- `service_evidence_items`
- `staff_whatsapp_states`

Fases:

- `before`
- `during`
- `after`
- `note`

Tipos:

- texto
- imagem
- vídeo
- áudio
- documento

Arquivos ficam no bucket privado:

`lead-media`

MIME types permitidos incluem:

- `image/*`
- `video/*`
- `audio/*`
- `application/pdf`

O backend interno de evidência está em:

`server/whatsapp-staff-evidence.mjs`

Comandos previstos para equipe:

- `AJUDA`
- `ATENDIMENTO Nome/telefone`
- `ANTES: ...`
- `DURANTE: ...`
- `DEPOIS: ...`
- `OBS: ...`
- `STATUS`
- `ENCERRAR`

Números internos devem ser configurados em:

`VALTEC_STAFF_WHATSAPP_PHONES`

Importante:

> O número interno da equipe precisa ser diferente do número remetente da Cloud API.

A interface completa de evidências foi desenvolvida na branch `feature/whatsapp-evidence-capture`; antes de considerar essa experiência visual concluída no `main`, revisar o conteúdo da PR correspondente.

---

## 10. Classificação de contatos e proteção das conversas pessoais

Foi criada classificação operacional em `whatsapp_threads`.

Tipos disponíveis:

- `tester`
- `client`
- `lead`
- `personal`
- `supplier`
- `ignore`
- `unknown`

Modos de resposta:

- `always`
- `commercial_only`
- `never`

### Regras atuais

#### unknown

Não vira lead automaticamente.

Uma mensagem ambígua como:

`oi`

não deve transformar a pessoa em cliente nem disparar uma sequência comercial.

O sistema aguarda sinal comercial claro.

#### lead/client

Pode entrar no fluxo comercial conforme contexto já existente.

#### personal/supplier/ignore

Bot fica silencioso.

O sistema pode continuar organizando dados internos quando houver lógica específica, mas não deve responder automaticamente.

#### tester

Exceção destinada a testes controlados.

O contato de teste atual foi marcado como:

- `contact_type=tester`
- `auto_reply_mode=always`
- `bot_label=TESTE AUTORIZADO`

O telefone real do testador **não deve ser versionado neste repositório público**.

---

## 11. Direção definida para WhatsApp pessoal do responsável

A Valtec não deve tentar transformar toda conversa do WhatsApp em cliente.

A direção é usar o sistema como **organizador silencioso**.

Modelo desejado:

### CLIENTE
Cliente já conhecido.

### LEAD
Contato com evidência comercial.

### PESSOAL
Família, amigos e contatos particulares.

### FORNECEDOR
Relação operacional não-cliente.

### IGNORAR
Contato em que o bot nunca deve interferir.

### DESCONHECIDO
Ainda não há informação suficiente para classificar.

A classificação deve ser interna à Valtec e não depender de renomear o contato na agenda do aparelho.

Também deve existir handoff natural:

> Se o responsável humano assumir a conversa, o bot para de responder, mas continua podendo organizar silenciosamente o atendimento.

---

## 12. Grupos

Objetivo operacional:

- não tratar grupos pessoais/igreja como atendimento da Valtec;
- não criar lead a partir de conversa coletiva;
- não responder automaticamente em contexto que não seja conversa individual comercial.

Na implantação definitiva com o número oficial/coexistência, validar novamente o comportamento real de grupos no ambiente da Meta e manter uma proteção explícita no código caso algum evento coletivo possa chegar.

---

## 13. Segurança técnica/comercial

O bot não deve:

- diagnosticar defeito de gás;
- garantir que um equipamento é seguro;
- ensinar reparo de risco;
- inventar valor;
- fechar preço técnico sem confirmação;
- inventar disponibilidade;
- responder situação ambígua como se fosse fato.

Situações de segurança e gás devem subir para humano.

Falha técnica de API é diferente de necessidade humana.

Essa distinção foi reforçada depois do problema em que uma falha de envio deixava a conversa permanentemente marcada como handoff.

---

## 14. Migrations WhatsApp/evidências

O histórico do `main` agora contém a sequência completa:

- `016_whatsapp_operational_mvp.sql`
- `017_service_evidence_capture.sql`
- `018_whatsapp_evidence_hardening.sql`
- `019_whatsapp_conversation_intelligence.sql`
- `020_canonicalize_brazilian_whatsapp_phones.sql`
- `021_whatsapp_contact_classification.sql`

As migrations 016–018 já haviam sido aplicadas ao banco durante o desenvolvimento nas branches de WhatsApp/evidências; em 21/09 os arquivos também foram trazidos para o `main` para manter o repositório reproduzível e coerente com o schema real.

### 019

Adiciona:

- contexto conversacional;
- último intent;
- transcrição;
- fatos extraídos;
- status de processamento;
- telefone normalizado de leads/clientes.

### 020

Canonicaliza telefones brasileiros para aproximar site e WhatsApp.

### 021

Adiciona:

- tipo do contato;
- modo de resposta automática;
- label interna;
- origem da classificação;
- data da classificação.

---

## 15. Arquivos principais no main

Backend:

- `api/whatsapp-webhook.mjs`
- `server/whatsapp-lib.mjs`
- `server/whatsapp-intelligence.mjs`
- `server/whatsapp-staff-evidence.mjs`

Banco:

- migrations 016 a 021.

---

## 16. Branches/PRs relevantes

### Evidências

Branch:

`feature/whatsapp-evidence-capture`

PR:

- #26 — evidências de serviço pelo WhatsApp

### Publicação inicial do webhook

PR:

- #27 — hotfix de publicação do webhook em produção

O hotfix foi integrado ao `main`.

---

## 17. Próximas prioridades

### Prioridade 1 — comportamento do responsável humano

Criar/validar modos mais explícitos:

- BOT
- HUMANO ATIVO
- BOT ASSISTINDO
- AGUARDANDO CLIENTE
- AGUARDANDO VALTEC
- ENCERRADO

Quando uma pessoa da Valtec responder manualmente, o bot deve parar de falar sem perder a organização interna.

### Prioridade 2 — áudio automático

Adicionar speech-to-text:

- baixar áudio;
- transcrever;
- salvar transcrição;
- alimentar o motor conversacional;
- manter áudio original disponível.

### Prioridade 3 — site

Executar teste real:

`formulário do site → lead → WhatsApp → reconhecimento do lead → nenhuma pergunta repetida`

### Prioridade 4 — evidências internas

Configurar número interno autorizado e testar:

`ATENDIMENTO → ANTES → DURANTE → DEPOIS → ENCERRAR`

### Prioridade 5 — orçamento por comando interno

Fluxo desejado:

`orçamento de Carlos, 3 bicos 25 cada, mangueira 110, mão de obra 180`

Sistema:

- identifica cliente;
- cria rascunho;
- calcula;
- mostra resumo;
- aguarda `ENVIAR / ALTERAR / CANCELAR`.

Decisões comerciais sensíveis devem continuar staged/confirmadas.

### Prioridade 6 — credencial Meta permanente

Substituir a dependência do token temporário por credencial apropriada para operação contínua.

### Prioridade 7 — número oficial

Não migrar/deletar o WhatsApp Business usado no aparelho sem planejamento.

Estudar e testar o caminho oficial de coexistência/Embedded Signup para manter o uso humano no aparelho junto da Cloud API.

---

## 18. Estado ao encerrar 21/09/2026

Confirmado funcionando:

- webhook Meta;
- assinatura;
- persistência no Supabase;
- entrada real;
- saída real;
- status/read;
- entendimento básico de escrita ruim;
- contexto acumulado;
- telefone BR normalizado;
- reaproveitamento de dados;
- classificação de contatos;
- contato desconhecido silencioso;
- contato de teste liberado;
- schema de evidências;
- banco preparado para áudio/transcrição futura.

Ainda pendente:

- teste final site → WhatsApp;
- transcrição automática de áudio;
- aprovação operacional do fluxo de evidências completo no `main`;
- modo humano/passivo definitivo;
- orçamento interno por comando;
- token permanente;
- coexistência com número oficial;
- teste com operação real do responsável.

---

## 19. Regra de continuidade

Antes de qualquer nova alteração no WhatsApp da Valtec, revisar este documento.

A direção atual não é “fazer um bot falar mais”.

A direção é:

> **fazer o sistema entender melhor, perguntar menos, interferir menos e organizar mais.**
