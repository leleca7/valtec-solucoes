import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorizedCommercialPilotPhones, evaluateCommercialPilot, canRegisterCommercialLead } from '../server/whatsapp-commercial-pilot-guard.mjs';
import { extractIntakeForm, nextIntakeQuestion } from '../scripts/whatsapp-intake.mjs';
import { extractFacts, inferIntent, isGreeting } from '../server/whatsapp-intelligence.mjs';
import { canTrackBusinessAppEcho, extractBusinessAppEchoes } from '../server/whatsapp-coexistence.mjs';

const allowlist = '5571999990001,5571999990002';
const base = {
  phone: '5571999990001', contactType: 'lead', autoReplyMode: 'commercial_only',
  enabled: 'true', allowedPhones: allowlist, disabled: 'false', status: 'bot',
  humanRequired: false, lastInboundAt: '2026-10-19T10:00:00.000Z', latestStaffReplyAt: ''
};

test('piloto fechado por padrão, kill switch imediato e allowlist estrita', () => {
  assert.equal(evaluateCommercialPilot({ ...base, enabled: '' }).reason, 'pilot_disabled');
  assert.equal(evaluateCommercialPilot({ ...base, disabled: 'true' }).reason, 'emergency_disabled');
  assert.equal(evaluateCommercialPilot({ ...base, allowedPhones: '' }).reason, 'invalid_or_missing_allowlist');
  assert.equal(evaluateCommercialPilot({ ...base, allowedPhones: '5571999990001,invalid' }).reason, 'invalid_or_missing_allowlist');
  assert.equal(evaluateCommercialPilot({ ...base, allowedPhones: '5571999990001,5571999990001' }).reason, 'invalid_or_missing_allowlist');
  assert.equal(evaluateCommercialPilot({ ...base, phone: '5571999990003' }).reason, 'phone_not_allowlisted');
  assert.deepEqual(authorizedCommercialPilotPhones(allowlist), ['5571999990001', '5571999990002']);
});

test('contatos pessoais, fornecedores, ignorados e modo nunca são sempre bloqueados', () => {
  for (const contactType of ['personal', 'supplier', 'ignore']) assert.equal(evaluateCommercialPilot({ ...base, contactType }).reason, 'excluded_contact_type');
  assert.equal(evaluateCommercialPilot({ ...base, autoReplyMode: 'never' }).reason, 'mode_never');
  assert.equal(evaluateCommercialPilot({ ...base, contactType: 'unknown' }).reason, 'unknown_without_verified_origin');
  assert.equal(evaluateCommercialPilot({ ...base, contactType: 'unknown', commercialIntent: true }).allowed, true);
  assert.equal(evaluateCommercialPilot({ ...base, contactType: 'unknown', phone: '5571999990003', commercialIntent: true }).reason, 'phone_not_allowlisted');
  assert.equal(evaluateCommercialPilot({ ...base, contactType: 'personal', commercialIntent: true }).reason, 'excluded_contact_type');
  assert.equal(canRegisterCommercialLead({ ...base, pilotAllowed: false, contactType: 'unknown', commercialIntent: true }), false);
  assert.equal(canRegisterCommercialLead({ ...base, pilotAllowed: true, phone: '5571999990003', contactType: 'unknown', commercialIntent: true }), false);
  assert.equal(canRegisterCommercialLead({ ...base, pilotAllowed: true, contactType: 'personal', commercialIntent: true }), false);
  assert.equal(canRegisterCommercialLead({ ...base, pilotAllowed: true, contactType: 'unknown', commercialOriginVerified: false, commercialIntent: false }), false);
  assert.equal(canRegisterCommercialLead({ ...base, pilotAllowed: true, contactType: 'unknown', commercialOriginVerified: false, commercialIntent: true }), true);
  assert.equal(canRegisterCommercialLead({ ...base, pilotAllowed: true, contactType: 'unknown', commercialOriginVerified: true, commercialIntent: false }), true);
  // Negativos de ponta de política: sem autorização não há decisão de resposta nem cadastro.
  const unknownNoContext = evaluateCommercialPilot({ ...base, contactType: 'unknown', commercialIntent: false, commercialOriginVerified: false });
  assert.equal(unknownNoContext.allowed, false);
  assert.equal(canRegisterCommercialLead({ ...base, pilotAllowed: unknownNoContext.allowed, contactType: 'unknown', commercialIntent: false }), false);
  // Texto estruturado/parametrizado pelo remetente não é entrada de origem confiável.
  const textOnlyStructured = evaluateCommercialPilot({ ...base, contactType: 'unknown', commercialIntent: false, commercialOriginVerified: false });
  assert.equal(textOnlyStructured.allowed, false);
  assert.equal(canRegisterCommercialLead({ ...base, pilotAllowed: textOnlyStructured.allowed, contactType: 'unknown', commercialOriginVerified: false, commercialIntent: false }), false);
  for (const contactType of ['personal', 'supplier', 'ignore']) {
    const decision = evaluateCommercialPilot({ ...base, contactType, commercialIntent: true });
    assert.equal(decision.allowed, false);
    assert.equal(canRegisterCommercialLead({ ...base, pilotAllowed: decision.allowed, contactType, commercialIntent: true }), false);
  }
  const outsideAllowlist = evaluateCommercialPilot({ ...base, phone: '5571999990003', contactType: 'unknown', commercialIntent: true });
  assert.equal(outsideAllowlist.allowed, false);
  assert.equal(canRegisterCommercialLead({ ...base, pilotAllowed: outsideAllowlist.allowed, phone: '5571999990003', contactType: 'unknown', commercialIntent: true }), false);
});

test('saudação oi exige origem comercial ou opção neutra explicitamente habilitada', () => {
  assert.equal(evaluateCommercialPilot({ ...base, contactType: 'unknown', isGreeting: true }).reason, 'greeting_without_verified_origin');
  assert.equal(evaluateCommercialPilot({ ...base, contactType: 'unknown', isGreeting: true, commercialOriginVerified: true }).allowed, true);
  assert.equal(evaluateCommercialPilot({ ...base, contactType: 'unknown', isGreeting: true, allowNeutralGreeting: true }).reason, 'owner_enabled_neutral_greeting');
  assert.equal(evaluateCommercialPilot({ ...base, isGreeting: true }).reason, 'allowlisted_classified_commercial_contact');
});

test('assunção humana bloqueia envio e falha de Meta não reabre o bot', () => {
  assert.equal(evaluateCommercialPilot({ ...base, status: 'human' }).reason, 'human_takeover');
  assert.equal(evaluateCommercialPilot({ ...base, humanRequired: true }).reason, 'human_takeover');
  assert.equal(evaluateCommercialPilot({ ...base, latestStaffReplyAt: '2026-10-19T10:01:00.000Z' }).reason, 'human_replied_most_recently');
  const source = readFileSync(new URL('../api/whatsapp-webhook.mjs', import.meta.url), 'utf8');
  assert.match(source, /commercialAuthorization\.allowed/);
  assert.match(source, /pilotDecision\.allowed && \(/);
  assert.match(source, /siteOriginVerified = \['site_form', 'website_form', 'manual_commercial'/);
  assert.match(source, /const humanHasControl/);
  assert.match(source, /staffTookOverDuringProcessing/);
  assert.match(source, /if \(!decision\.reply \|\| finalHumanHasControl/);
});

test('triagem em mensagens separadas preserva contexto e pergunta só o que falta', () => {
  const first = extractIntakeForm('Equipamento: fogão Consul');
  assert.equal(first.equipment, 'fogão Consul');
  assert.equal(nextIntakeQuestion(['neighborhood', 'problem']), 'Qual é o bairro onde precisa do atendimento?');
  const second = extractIntakeForm('Bairro: Imbuí');
  assert.equal(second.neighborhood, 'Imbuí');
  const problem = extractFacts({ text: 'O forno não acende', expectedField: 'problem' });
  assert.equal(problem.problem, 'Não acende');
  assert.equal(problem.equipment, undefined);
  const fullRequest = 'Bom dia, meu fogão Consul não acende. Vocês atendem no Imbuí?';
  assert.equal(inferIntent(fullRequest), 'repair_request');
  assert.equal(isGreeting(fullRequest), false);
  const equipment = extractFacts({ text: fullRequest, expectedField: 'equipment' });
  assert.equal(equipment.equipment, 'Fogão Consul');
  assert.equal(equipment.problem, 'Não acende');
  assert.match(readFileSync(new URL('../api/whatsapp-webhook.mjs', import.meta.url), 'utf8'), /Capture a neighborhood mentioned alongside a repair request/);
});

test('coexistência só reconhece eco do evento esperado e contato comercial associado', () => {
  assert.equal(extractBusinessAppEchoes({ field: 'messages', value: { message_echoes: [{ id: 'x', to: '5571999990001', type: 'text' }] } }).length, 0);
  assert.equal(extractBusinessAppEchoes({ field: 'smb_message_echoes', value: { message_echoes: [{ id: 'x', to: '5571999990001', type: 'text' }] } }).length, 1);
  assert.equal(canTrackBusinessAppEcho({ contact_type: 'lead', lead_id: 'fake', auto_reply_mode: 'commercial_only' }), true);
  assert.equal(canTrackBusinessAppEcho({ contact_type: 'supplier', lead_id: 'fake', auto_reply_mode: 'commercial_only' }), false);
});

test('webhook mantém deduplicação, assinatura Meta e guard original de dois números', () => {
  const source = readFileSync(new URL('../api/whatsapp-webhook.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(inbound\.duplicate\) return/);
  assert.match(source, /verifyMetaSignature/);
  assert.match(source, /canAutoReplyInTest/);
  assert.match(source, /VALTEC_WHATSAPP_COMMERCIAL_AUTO_REPLY_DISABLED/);
  assert.match(source, /if \(!tester && !pilotDecision\.allowed\)/);
  assert.match(source, /redacted_by_pilot_authorization:\s*true/);
  assert.match(source, /Do not copy media or conversation text into the CRM until the commercial policy/);
  assert.match(source, /commercialIntent: \['repair_request', 'service_area', 'quote_followup'\]/);
  assert.doesNotMatch(source, /const siteOriginVerified = Boolean\([\s\S]{0,100}structured\.siteStructured/);
  assert.doesNotMatch(source, /commercialSignal[\\s\\S]{0,180}structured\\.siteStructured/);
  const authorizationGate = source.indexOf('if (!tester && !pilotDecision.allowed)');
  const leadCreationGate = source.indexOf('if (!lead && leadRegistrationAuthorized)');
  assert.ok(authorizationGate >= 0 && leadCreationGate > authorizationGate, 'o bloqueio de autorização deve anteceder qualquer criação de lead');
  const originalGuard = readFileSync(new URL('../server/whatsapp-test-guard.mjs', import.meta.url), 'utf8');
  assert.match(originalGuard, /parts\.length!==2/);
  const inbox = readFileSync(new URL('../scripts/whatsapp-inbox.js', import.meta.url), 'utf8');
  assert.match(inbox, /Marcar comercial \(lead\)/);
  assert.match(inbox, /classification_source:type==='lead'\?'manual_commercial'/);
  assert.match(inbox, /redacted_by_classification:true/);
  assert.match(inbox, /s\.storage\.from\('lead-media'\)\.remove/);
});