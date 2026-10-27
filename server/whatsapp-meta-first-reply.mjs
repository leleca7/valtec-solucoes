// Primeira apresentação da Valtec somente em um novo contato comprovado de anúncio Meta.
// A decisão final de atendimento permanece com Valdemir.
export const VALTEC_META_WELCOME = [
  'Olá! 👋 Aqui é a *Valtec Soluções*, do técnico Valdemir.',
  'Obrigado por entrar em contato! 🔧',
  '',
  'Qual equipamento precisa de atendimento?',
  '',
  'Se desejar, pode enviar uma foto ou um vídeo para facilitar nossa análise inicial, mas não é obrigatório.',
  'Valdemir continuará o atendimento e confirmará os próximos passos.'
].join('\n');

export function eligibleMetaFirstReply({
  enabled=false, created=false, fromMetaAd=false, recipientPhoneId='', commercialPhoneId='',
  contactType='', replyMode='', lastOutboundAt='', messageType='', hasSafetyConcern=false, 
  humanRequired=false
}={}) {
  return enabled===true && created===true && fromMetaAd===true &&
    /^\d{8,25}$/.test(String(recipientPhoneId)) &&
    String(recipientPhoneId)===String(commercialPhoneId) &&
    !['personal','supplier','ignore','tester'].includes(String(contactType)) &&
    replyMode!=='never' && !lastOutboundAt && !humanRequired &&
    messageType==='text' && !hasSafetyConcern;
}
