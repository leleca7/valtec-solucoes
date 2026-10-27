import test from 'node:test';
import assert from 'node:assert/strict';
import {VALTEC_META_WELCOME,eligibleMetaFirstReply} from '../server/whatsapp-meta-first-reply.mjs';
const base={enabled:true,created:true,fromMetaAd:true,recipientPhoneId:'123456789012345',commercialPhoneId:'123456789012345',contactType:'lead',replyMode:'commercial_only',lastOutboundAt:'',messageType:'text',humanRequired:false,hasSafetyConcern:false};
test('primeira saudação é curta e vídeo é opcional',()=>{
  assert.match(VALTEC_META_WELCOME,/Valtec Soluções/);
  assert.match(VALTEC_META_WELCOME,/Valdemir/);
  assert.match(VALTEC_META_WELCOME,/não é obrigatório/);
  assert.doesNotMatch(VALTEC_META_WELCOME,/envie um vídeo para continuar/);
  assert(VALTEC_META_WELCOME.length < 550);
});
test('só primeiro contato vindo do anúncio, nunca a conversas anteriores',()=>{
  assert.equal(eligibleMetaFirstReply(base),true);
  for(const fields of [
    {enabled:false},{created:false},{fromMetaAd:false},{lastOutboundAt:'2026-10-26T20:00:00Z'},
    {replyMode:'never'},{contactType:'personal'},{contactType:'supplier'},{contactType:'tester'},
    {humanRequired:true},{hasSafetyConcern:true},{messageType:'audio'},
    {recipientPhoneId:'123456789012346'}
  ])assert.equal(eligibleMetaFirstReply({...base,...fields}),false,JSON.stringify(fields));
});
