// Autorização independente do piloto comercial. Falha fechada por padrão.
const MAX_PILOT_CONTACTS = 5;

function normalizeBrazilianMobile(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits && !digits.startsWith('55')) digits = '55' + digits;
  if (/^55\d{2}[6-9]\d{7}$/.test(digits)) digits = digits.slice(0, 4) + '9' + digits.slice(4);
  return /^55\d{2}9\d{8}$/.test(digits) ? digits : '';
}

export function authorizedCommercialPilotPhones(raw) {
  const source = String(raw || '').trim();
  if (!source) return [];
  const entries = source.split(',').map((part) => part.trim());
  if (entries.length < 1 || entries.length > MAX_PILOT_CONTACTS || entries.some((part) => !part)) return [];
  const normalized = entries.map(normalizeBrazilianMobile);
  if (normalized.some((phone) => !phone)) return [];
  const unique = [...new Set(normalized)];
  return unique.length === normalized.length ? unique : [];
}

export function evaluateCommercialPilot({
  phone, contactType, autoReplyMode, enabled, allowedPhones, disabled,
  status, humanRequired, lastInboundAt, latestStaffReplyAt,
  commercialOriginVerified = false, commercialIntent = false, isGreeting = false, allowNeutralGreeting = false
} = {}) {
  const block = (reason) => ({ allowed: false, reason });
  if (disabled === 'true') return block('emergency_disabled');
  if (enabled !== 'true') return block('pilot_disabled');
  const allowlist = authorizedCommercialPilotPhones(allowedPhones);
  if (!allowlist.length) return block('invalid_or_missing_allowlist');
  const normalizedPhone = normalizeBrazilianMobile(phone);
  if (!normalizedPhone || !allowlist.includes(normalizedPhone)) return block('phone_not_allowlisted');
  if (['personal', 'supplier', 'ignore'].includes(String(contactType || ''))) return block('excluded_contact_type');
  if (!['lead', 'client', 'unknown'].includes(String(contactType || ''))) return block('unclassified_contact');
  if (autoReplyMode === 'never') return block('mode_never');
  if (!['commercial_only', 'always'].includes(String(autoReplyMode || ''))) return block('invalid_reply_mode');
  if (status === 'human' || humanRequired === true) return block('human_takeover');
  const inbound = Date.parse(lastInboundAt || '') || 0;
  const staff = Date.parse(latestStaffReplyAt || '') || 0;
  if (staff > 0 && staff >= inbound) return block('human_replied_most_recently');
  if (contactType === 'unknown') {
    if (commercialOriginVerified) return { allowed: true, reason: 'verified_commercial_origin' };
    if (isGreeting && allowNeutralGreeting === true) return { allowed: true, reason: 'owner_enabled_neutral_greeting' };
    // A clear repair/service request is actionable only for a phone already on the
    // owner-approved pilot allowlist. Message text never proves that it came from the site.
    if (!isGreeting && commercialIntent === true) return { allowed: true, reason: 'allowlisted_clear_commercial_intent' };
    return block(isGreeting ? 'greeting_without_verified_origin' : 'unknown_without_verified_origin');
  }
  return { allowed: true, reason: 'allowlisted_classified_commercial_contact' };
}