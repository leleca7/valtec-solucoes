// Diferencia clientes originados por anúncios Click-to-WhatsApp dos contatos pessoais.
// Um "Olá, posso ter mais informações?" só é comercial se o próprio Meta informar a origem.
export function isMetaClickToWhatsAppAd(referral) {
  if (!referral || typeof referral !== 'object' || Array.isArray(referral)) return false;
  return String(referral.source_type || '').toLowerCase().trim() === 'ad';
}
