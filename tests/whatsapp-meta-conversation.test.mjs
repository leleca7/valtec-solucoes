import test from 'node:test';
import assert from 'node:assert/strict';
import { META_AD_PREFILL, META_TRIAGE_LIMIT, formatMetaOpening, isMetaInitialEligible,
  isMetaContinuationEligible } from '../server/whatsapp-meta-conversation.mjs';
import { extractIntakeForm, intakeWelcomeMessage, nextIntakeQuestion } from '../scripts/whatsapp-intake.mjs';

const base={
  enabled:true,created:true,referral:true,phoneId:'123456789012345',
  commercialPhoneId:'123456789012345',contactType:'unknown',
  replyMode:'commercial_only',humanRequiredBefore:false,lastOutboundBefore:'',
  messageType:'text'
};
test('formulário do anúncio permite campos vazios e preenchimento parcial',()=>{
  assert.match(META_AD_PREFILL,/Bairro:/);
  assert.match(META_AD_PREFILL,/Equipamento e marca:/);
  assert.match(META_AD_PREFILL,/Problema:/);
  assert.deepEqual(extractIntakeForm(META_AD_PREFILL),{});
  const filled=META_AD_PREFILL.replace('Bairro:','Bairro: Boca do Rio')
    .replace('Equipamento e marca:','Equipamento e marca: Fogão Consul')
    .replace('Problema:','Problema: Não acende');
  assert.deepEqual(extractIntakeForm(filled),{
    neighborhood:'Boca do Rio',equipment:'Fogão Consul',problem:'Não acende'
  });
});
test('saudação faz uma pergunta e não obriga enviar vídeo',()=>{
  const welcome=intakeWelcomeMessage();
  assert.match(welcome,/em qual bairro/i);
  assert.match(welcome,/Não é obrigatório/i);
  assert(!/Equipamento e marca:\s*\n.*Problema:/i.test(welcome));
  const greeting=formatMetaOpening('Qual é o problema do equipamento?');
  assert.match(greeting,/assistente da/);
  assert.match(greeting,/não é obrigatório/i);
  assert.match(greeting,/Qual é o problema/);
});
test('triagem pergunta só campo faltante',()=>{
  assert.match(nextIntakeQuestion(['problem']),/problema/i);
  assert.doesNotMatch(nextIntakeQuestion(['problem']),/bairro/i);
  assert.match(nextIntakeQuestion(['equipment']),/equipamento/i);
  assert.match(nextIntakeQuestion(['neighborhood']),/bairro/i);
  assert.equal(nextIntakeQuestion([]),'');
});
test('saudação inicial somente novo anúncio pelo número comercial autorizado',()=>{
  assert.equal(isMetaInitialEligible(base),true);
  for(const patch of [
    {enabled:false},{created:false},{referral:false},{phoneId:'123456789012346'},
    {contactType:'personal'},{replyMode:'never'},{humanRequiredBefore:true},
    {lastOutboundBefore:'2026-10-26T22:00:00Z'}
  ])assert.equal(isMetaInitialEligible({...base,...patch}),false,JSON.stringify(patch));
});
test('segurança não recebe instrução para vídeo',()=>{
  assert.equal(formatMetaOpening('Situação de segurança. Pare de utilizar o equipamento.',{isSafety:true}),
    'Situação de segurança. Pare de utilizar o equipamento.');
});
test('triagem posterior interrompe quando técnico responde ou assume',()=>{
  const row={
    enabled:true,phoneId:'123456789012345',commercialPhoneId:'123456789012345',
    thread:{classification_source:'meta_ads_referral',contact_type:'lead',
      human_required:false,status:'bot',auto_reply_mode:'commercial_only'},
    previousOutboundId:'wamid.AUTO',lastAutomaticOutboundId:'wamid.AUTO',replyCount:0
  };
  assert.equal(isMetaContinuationEligible(row),true);
  for(const patch of [
    {previousOutboundId:'wamid.HUMANO'},{replyCount:META_TRIAGE_LIMIT},
    {thread:{...row.thread,status:'human'}},
    {thread:{...row.thread,human_required:true}},
    {thread:{...row.thread,classification_source:'conversation'}}
  ])assert.equal(isMetaContinuationEligible({...row,...patch}),false,JSON.stringify(patch));
});
