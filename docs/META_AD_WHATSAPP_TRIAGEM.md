# VALTEC — Integração anúncio Meta → WhatsApp → Valdemir

## Mensagem pré-preenchida para o anúncio (copiar em Modelo de mensagem)

Olá! Vi o anúncio da VALTEC e gostaria de solicitar atendimento. 🔧

📍 Bairro:
🔥 Equipamento e marca:
🔧 Problema:

**Observações:** preencher os campos é opcional. Marca desconhecida, descrição imprecisa, áudio e mensagens livres não impedem contato. O anúncio não deve exigir foto, vídeo ou diagnóstico. Não colocar preço no texto automático.

## Fluxo operacional implementado

1. Novo lead com referral confirmado de anúncio no WhatsApp da Valtec: o bot extrai os campos já informados. Mensagem inicial curta com **uma pergunta** para o primeiro campo ausente. Caso o cliente já tenha informado tudo, confirma o encaminhamento ao técnico.
2. Mensagens seguintes: no máximo três respostas de triagem e somente enquanto o último remetente ao cliente tiver sido o bot. Se Valdemir respondeu, a automação interrompe e o atendimento fica humano.
3. Problema de gás, risco elétrico, dúvidas sobre preço, consulta de orçamento, áudio, pedido de pessoa ou informação técnica que dependa de avaliação: transferência para Valdemir, sem preço/diagnóstico/agendamento inventado.
4. Imagens e vídeos são opcionais, nunca bloqueiam a triagem.
5. Por mensagem recebida, uma única tentativa, registrada no banco. Uma resposta com resultado incerto não deve ser repetida automaticamente.

## Ao editar o anúncio na Meta

O modelo de mensagem do anúncio **não é editado automaticamente pelo GitHub ou Vercel**. No Gerenciador de Anúncios da Meta, selecione o anúncio ativo da VALTEC > Editar > Modelo de mensagem (Message template) > Editar e insira o texto acima. Revise a prévia, o número comercial e o destino WhatsApp antes de publicar. Para não arriscar a entrega do criativo vigente, use uma versão duplicada caso a Meta exija revisão e preserve o original até validar o novo.

## Acompanhamento e conversões

Use as filas do assistente privado: Sem resposta, Orçamentos, Retornos, Visitas e Concluídos. Não considerar serviço concluído só porque houve visita ou comprovante; registrar resultado somente com confirmação de Valdemir. Não enviar retorno comercial fora da janela permitida pela Meta sem template aprovado/opt-in aplicável.

## Testes pós-publicação

- Cliente novo vindo do anúncio com os três campos preenchidos: **não** deve perguntar bairro, equipamento nem problema.
- Cliente só informa bairro: perguntar equipamento e, depois, problema.
- Cliente envia áudio/foto: encaminhar sem exigir vídeo ou retransmissão do arquivo.
- Valdemir responde: bot deve parar de perguntar.
- Mensagem reenviada pela Meta: sem repetição de resposta.
- Cliente antigo, contato pessoal ou não originário de anúncio: sem essa automação.
- Após término: aparece em fila para atendimento humano, sem orçamento ou agenda automáticos.
