// Fluxo curto de novos contatos da Meta: não solicitar foto/vídeo como condição.
export const META_AD_PREFILL = [
  'Olá! Vi o anúncio da VALTEC e gostaria de solicitar atendimento. 🔧',
  '',
  '📍 Bairro:',
  '🔥 Equipamento e marca:',
  '🔧 Problema:'
].join('\n');

export const META_TRIAGE_LIMIT = 3; // Até 3 perguntas/respostas do bot após a apresentação.
export const META_INTRO = 'Olá! 👋 Sou o assistente da *Valtec Soluções*. Vou organizar seu pedido para o técnico Valdemir.';

export function formatMetaOpening(reply = '', {isSafety = false, isPrice = false} = {}) {
  const response=String(reply||'').trim();
  if (!response) return '';
  // Risco, preço e transferência humana: texto técnico já é a única resposta autorizada.
  if (isSafety || isPrice) return response;
  // A apresentação de triagem já contém saudação própria.
  if (/^(?:olá|ola)[!,.\s]/i.test(response)) return response;
  const optional=/foto|vídeo|video/i.test(response) ? '' :
    '\n\nSe desejar, pode enviar foto ou vídeo para ajudar na análise, mas não é obrigatório.';
  return [META_INTRO,response+optional].join('\n\n');
}

export function isMetaInitialEligible({enabled,created,referral,phoneId,commercialPhoneId,contactType,replyMode,
    humanRequiredBefore,lastOutboundBefore,messageType}) {
  return enabled===true && created===true && referral===true &&
    /^\d{8,25}$/.test(String(phoneId||'')) && String(phoneId)===String(commercialPhoneId) &&
    !['personal','supplier','ignore','tester'].includes(String(contactType||'')) &&
    replyMode!=='never' && !humanRequiredBefore && !lastOutboundBefore &&
    ['text','image','video','audio'].includes(messageType);
}

export function isMetaContinuationEligible({enabled,thread,phoneId,commercialPhoneId,previousOutboundId,
    lastAutomaticOutboundId,replyCount}) {
  return enabled===true && /^\d{8,25}$/.test(String(phoneId||'')) &&
    String(phoneId)===String(commercialPhoneId) &&
    thread?.classification_source==='meta_ads_referral' &&
    ['lead','client'].includes(String(thread?.contact_type||'')) &&
    !thread?.human_required && thread?.status!=='human' && thread?.auto_reply_mode!=='never' &&
    typeof previousOutboundId==='string' && previousOutboundId.length>0 &&
    previousOutboundId===lastAutomaticOutboundId &&
    Number.isInteger(replyCount) && replyCount>=0 && replyCount<META_TRIAGE_LIMIT;
}

export function metaCustomerIsReady({missing=[],humanRequired=false} = {}) {
  return Array.isArray(missing) && missing.length===0 || Boolean(humanRequired);
}
