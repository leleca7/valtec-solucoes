import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAuthorizedTestPhone, authorizedTestPhones, canAutoReplyInTest } from '../server/whatsapp-test-guard.mjs';

test('no auto-reply without strict two-number production allowlist and flag',()=>{
  const approved='5571999992289,5571999990850';
  const valid={phone:'5571999992289',contactType:'lead',autoReplyMode:'commercial_only',enabled:'true',allowedPhones:approved};
  assert.equal(canAutoReplyInTest(valid),true);
  assert.equal(canAutoReplyInTest({...valid,phone:'5571988887777'}),false);
  assert.equal(canAutoReplyInTest({...valid,enabled:'false'}),false);
  assert.equal(canAutoReplyInTest({...valid,enabled:''}),false);
  assert.equal(canAutoReplyInTest({...valid,allowedPhones:''}),false);
  assert.equal(canAutoReplyInTest({...valid,allowedPhones:'5571999992289'}),false);
  assert.equal(canAutoReplyInTest({...valid,allowedPhones:'5571999992289,5571999992289'}),false);
  assert.equal(canAutoReplyInTest({...valid,allowedPhones:approved+',5571988887777'}),false);
  for (const contactType of ['personal','supplier','ignore','unknown']) {
    assert.equal(canAutoReplyInTest({...valid,contactType}),false);
  }
  assert.equal(canAutoReplyInTest({...valid,autoReplyMode:'never'}),false);
});
test('phone aliases without nono dígito normalize, but wildcard is rejected',()=>{
  const list='5571981992289,5571999990850';
  assert.equal(authorizedTestPhones(list).length,2);
  assert.equal(isAuthorizedTestPhone('71981992289',list),true);
  assert.equal(isAuthorizedTestPhone('999999',list),false);
  assert.equal(isAuthorizedTestPhone('*',list),false);
});
test('webhook keeps independent test and commercial gates before sending',()=>{
  const source=readFileSync(new URL('../api/whatsapp-webhook.mjs',import.meta.url),'utf8');
  assert.match(source,/canAutoReplyInTest/);
  assert.match(source,/evaluateCommercialPilot/);
  assert.match(source,/if \(!decision\.reply \|\| finalHumanHasControl \|\| \(!testAuthorized && !commercialAuthorization\.allowed\)\) return;/);
  assert.ok(source.indexOf('if (!decision.reply || finalHumanHasControl || (!testAuthorized && !commercialAuthorization.allowed)) return;') <
    source.indexOf('const providerMessageId = await sendWhatsAppText(thread.phone, decision.reply)'));
  assert.match(source,/VALTEC_WHATSAPP_AUTO_REPLY_TEST_PHONES/);
});
