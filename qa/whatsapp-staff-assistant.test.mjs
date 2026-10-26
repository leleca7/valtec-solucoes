import test from 'node:test';
import assert from 'node:assert/strict';
import {safeClientPhone,clientChatLink,reviseOperatorDraft,replaceOperatorDraft,readableDraft} from '../server/whatsapp-staff-assistant.mjs';
const base={phone:'5571999999999',name:'Cliente A',text:'Olá, vou verificar.',facts:{nome:'Maria',equipamento:'Fogão',problema:'Não acende',bairro:'Pituba'}};
test('link é para o cliente correto, com mensagem preenchida e sem envio automático',()=>{
 const link=clientChatLink(base.phone,base.text);
 assert.match(link,/^https:\/\/wa\.me\/5571999999999\?text=/);
 assert.equal(decodeURIComponent(link.split('text=')[1]),base.text);
});
test('não monta link para número inválido nem instrução interna',()=>{
 assert.equal(safeClientPhone('123'),'');
 assert.equal(clientChatLink('123','Olá'),'');
 assert.equal(clientChatLink(base.phone,'AÇÃO INTERNA: pagar'),'');
});
test('revisão estruturada altera apenas o rascunho e reutiliza fatos confirmados',()=>{
 const changed=reviseOperatorDraft(base,'BAIRRO: Itapuã');
 assert.equal(changed.draft.facts.bairro,'Itapuã');
 assert.match(changed.draft.text,/Itapuã/);
 assert.match(changed.draft.text,/Fogão/);
 assert.match(changed.draft.text,/Não acende/);
 assert.equal(base.facts.bairro,'Pituba');
});
test('valor e data não são inventados nem aceitos como edição estrutural',()=>{
 assert.match(reviseOperatorDraft(base,'VALOR: 100').error,/Campo não reconhecido/);
 assert.match(reviseOperatorDraft(base,'DATA: amanhã').error,/Campo não reconhecido/);
});
test('o técnico pode fornecer a mensagem completa sem a IA reformular',()=>{
 const changed=replaceOperatorDraft(base,'Olá Maria! Vou conferir seu atendimento e retorno por aqui.');
 assert.match(changed.draft.text,/Olá Maria/);
 assert.match(readableDraft(changed.draft),/ABRIR O CLIENTE/);
});
