import test from 'node:test';
import assert from 'node:assert/strict';
import { isMetaClickToWhatsAppAd } from '../server/whatsapp-ad-referral.mjs';

test('anúncio Click-to-WhatsApp identifica origem, mesmo sem descrição do defeito', () => {
  assert.equal(isMetaClickToWhatsAppAd({ source_type:'ad', source_id:'123', headline:'Valtec' }), true);
  assert.equal(isMetaClickToWhatsAppAd({ source_type:' AD ' }), true);
});

test('não trata conversa pessoal, post ou objeto inválido como anúncio', () => {
  assert.equal(isMetaClickToWhatsAppAd(undefined), false);
  assert.equal(isMetaClickToWhatsAppAd(null), false);
  assert.equal(isMetaClickToWhatsAppAd({ source_type:'post' }), false);
  assert.equal(isMetaClickToWhatsAppAd({}), false);
  assert.equal(isMetaClickToWhatsAppAd('ad'), false);
});
