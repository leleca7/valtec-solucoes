import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerMenuItems,ownerMenuInteractive,parseOwnerMenu,filterAssistantMenuQueue,renderAssistantMenuQueue} from '../server/whatsapp-owner-menu.mjs';
import {parseOwnerCommand} from '../server/whatsapp-owner-assistant-core.mjs';

test('menu do pai aceita navegação simples',()=>{
  assert.deepEqual(parseOwnerCommand('MENU'),{type:'menu'});
  assert.deepEqual(parseOwnerCommand('0'),{type:'menu'});
  assert.deepEqual(parseOwnerCommand('VOLTAR'),{type:'menu'});
  assert.deepEqual(parseOwnerCommand('1'),{type:'queue',filter:'today'});
  assert.deepEqual(parseOwnerCommand('3'),{type:'queue',filter:'quotes'});
  assert.deepEqual(parseOwnerCommand('menu_reviews'),{type:'queue',filter:'reviews'});
});
test('menu clicável do WhatsApp tem identificadores fixos',()=>{
  const x=ownerMenuInteractive();
  assert.equal(x.type,'interactive');
  assert.equal(x.interactive.action.sections.length,1);
  assert.equal(x.interactive.action.sections[0].rows.length,8);
  for (const item of ownerMenuItems) {
    assert.equal(parseOwnerMenu(item.id).filter,item.filter);
    assert(item.title.length<=24);
    assert(item.description.length<=72);
  }
});
test('não inventa avaliações devidas e seleciona visitas apenas de hoje',()=>{
  const completed={thread:{display_name:'Ana',phone:'5571999999999'},evaluation:{category:'pos_venda',label:'Concluído',reason:'OS realizada',priority:0}};
  const visit={thread:{display_name:'Rose',phone:'5571888888888'},evaluation:{category:'visita_programada',label:'Visita',priority:1},order:{scheduled_for:'2026-10-27T12:00:00Z'}};
  const pending={thread:{display_name:'Rita',phone:'5571777777777'},evaluation:{category:'responder_cliente',label:'Sem resposta',priority:5}};
  assert.equal(filterAssistantMenuQueue([completed,visit,pending],'today','2026-10-27').length,1);
  assert.equal(filterAssistantMenuQueue([completed,visit,pending],'today','2026-10-28').length,0);
  assert.equal(filterAssistantMenuQueue([completed,visit,pending],'unanswered').length,1);
  assert.equal(filterAssistantMenuQueue([completed,visit,pending],'reviews').length,1);
  assert.match(renderAssistantMenuQueue([],'quotes'),/Nenhum caso identificado/);
});
