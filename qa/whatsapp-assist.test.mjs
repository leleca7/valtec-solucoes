import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendWhatsappAction, draftForWhatsappAction } from '../scripts/whatsapp-action-queue.mjs';

const now = Date.parse('2026-10-26T12:00:00Z');
const thread = {
  id: 't1', phone: '5571999999999', display_name: 'Cliente Teste',
  contact_type: 'lead', lead_id: 'l1',
  last_inbound_at: '2026-10-26T10:00:00Z',
  last_outbound_at: '2026-10-26T11:00:00Z'
};
const lead = {
  id: 'l1', customer_name: 'Cliente Teste', neighborhood: 'Boca do Rio',
  equipment: 'Fogão', problems: ['Não acende'], status: 'contato_realizado'
};
test('retorno vencido gera fila de retorno, não envio', () => {
  const advice = recommendWhatsappAction(thread, { lead: { ...lead, next_action_at: '2026-10-26T11:30:00Z' } }, now);
  assert.equal(advice.kind, 'return');
  assert.equal(advice.key, 'scheduled_overdue');
  assert.match(draftForWhatsappAction(advice,thread,{lead}),/retomando o seu atendimento/i);
});
test('retorno futuro não é cobrado antecipadamente', () => {
  const advice = recommendWhatsappAction(thread, { lead: { ...lead, next_action_at: '2026-10-26T16:00:00Z' } }, now);
  assert.equal(advice.kind, 'waiting');
  assert.equal(advice.key, 'scheduled_pending');
});
test('mensagem recebida após a resposta pede conferência, mesmo com lembrete futuro', () => {
  const newInbound = { ...thread, last_inbound_at: '2026-10-26T11:55:00Z' };
  const advice = recommendWhatsappAction(newInbound, { lead: { ...lead, next_action_at: '2026-10-27T10:00:00Z' } }, now);
  assert.equal(advice.kind, 'reply');
});
test('pessoal nunca entra na fila comercial', () => {
  const advice = recommendWhatsappAction({ ...thread, contact_type: 'personal' }, { lead }, now);
  assert.equal(advice.kind,'excluded');
});
