// Liberação excepcional de teste: apenas dois números brasileiros autorizados.
// Sem allowlist completa de 2 telefones, nenhuma resposta automática é permitida.
// Nunca hardcodar telefones no repositório.
function normalizeTestPhone(value) {
  let digits=String(value||'').replace(/\D/g,'');
  if(digits && !digits.startsWith('55')) digits='55'+digits;
  if(/^55\d{2}[6-9]\d{7}$/.test(digits))digits=digits.slice(0,4)+'9'+digits.slice(4);
  return /^55\d{2}9\d{8}$/.test(digits)?digits:'';
}
export function authorizedTestPhones(raw) {
  const parts=String(raw||'').split(',').map(normalizeTestPhone).filter(Boolean);
  const unique=[...new Set(parts)];
  if(parts.length!==2 || unique.length!==2) return [];
  return unique;
}
export function isAuthorizedTestPhone(value,raw) {
  const phones=authorizedTestPhones(raw);
  return phones.length===2 && phones.includes(normalizeTestPhone(value));
}
export function canAutoReplyInTest({phone,contactType,autoReplyMode,enabled,allowedPhones}) {
  if(enabled!=='true')return false;
  if(!['lead','client','tester'].includes(String(contactType||'')))return false;
  if(autoReplyMode==='never')return false;
  return isAuthorizedTestPhone(phone,allowedPhones);
}
