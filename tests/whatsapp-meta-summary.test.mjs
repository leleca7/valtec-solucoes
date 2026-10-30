import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMetaServiceSummary, metaSummaryLeadPatch } from '../server/whatsapp-meta-summary.mjs';

const message='Resumo do seu atendimento 🔧\nCliente: Ana\nEquipamento: Fogão\nProblema: Forno não fica aceso\nBairro: Imbuí\nMarca: Atlas';
test('resumo do Meta é identificado com informações estruturadas',()=>{
 const out=extractMetaServiceSummary(message);
 assert.equal(out.customer_name,'Ana');
 assert.equal(out.equipment,'Fogão Atlas');
 assert.equal(out.neighborhood,'Imbuí');
 assert.equal(out.problem,'Forno não fica aceso');
});
test('só completa informações faltantes sem substituir diagnóstico ou bairro já registrados',()=>{
 const patch=metaSummaryLeadPatch(message,{
  customer_name:'Cliente WhatsApp', equipment:'Fogão Consul',
  problems:['Chama baixa'], description:'Chama baixa',
  neighborhood:'Boca do Rio', address:''
 });
 assert.equal(patch.customer_name,'Ana');
 assert.equal(patch.equipment,undefined);
 assert.equal(patch.problems,undefined);
 assert.equal(patch.neighborhood,undefined);
 assert.equal(patch.status,undefined);
 assert.equal(patch.payment_status,undefined);
 assert.equal(patch.scheduled_for,undefined);
});
test('ignora texto casual e resumo parcial',()=>{
 assert.equal(extractMetaServiceSummary('Cliente: Ana\nBairro: Imbuí'),null);
 assert.equal(extractMetaServiceSummary('Resumo do atendimento\nCliente: Ana\nBairro: Imbuí'),null);
 assert.equal(extractMetaServiceSummary('Resumo do seu atendimento\nEquipamento: [não informado]\nProblema: forno\nBairro: Barra'),null);
});
test('não edita cliente de outro atendimento, nem inventa serviço concluído',()=>{
 const patch=metaSummaryLeadPatch(message,{customer_name:'Pedro',problems:[],description:'',neighborhood:'',equipment:''});
 assert.equal(patch.customer_name,undefined);
 assert.equal(patch.equipment,'Fogão Atlas');
 assert.deepEqual(patch.problems,['Forno não fica aceso']);
 assert.equal(patch.status,undefined);
});
