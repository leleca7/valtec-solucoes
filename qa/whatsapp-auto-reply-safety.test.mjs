import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Contract test: the webhook must not send messages to real customers by default.
test('real customer auto-replies require explicit release flag', () => {
  const source = readFileSync(new URL('../api/whatsapp-webhook.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(!decision\.reply \|\| env\('VALTEC_WHATSAPP_AUTO_REPLY_ENABLED'\) !== 'true'\) return;/);
  assert.ok(source.indexOf("VALTEC_WHATSAPP_AUTO_REPLY_ENABLED") < source.indexOf('const providerMessageId = await sendWhatsAppText(thread.phone, decision.reply)'));
});
