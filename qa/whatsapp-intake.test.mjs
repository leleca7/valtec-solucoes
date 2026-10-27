import test from 'node:test';
import assert from 'node:assert/strict';
import {
  intakeWelcomeMessage, isGenericInterest, isAdTemplateGreeting, extractIntakeForm,
  nextIntakeQuestion, intakeDoneMessage
} from '../scripts/whatsapp-intake.mjs';
import { extractFacts } from '../server/whatsapp-intelligence.mjs';

test('mensagem automática do anúncio é interesse comercial, não nome de equipamento', () => {
  const greeting = 'Olá, posso ter mais informações sobre isso?';
  assert.equal(isAdTemplateGreeting(greeting), true);
  assert.equal(isGenericInterest(greeting), true);
  assert.equal(extractIntakeForm(greeting).equipment, undefined);
  assert.equal(isAdTemplateGreeting('Tenho interesse'), true);
  assert.equal(isAdTemplateGreeting('Gostaria de um orçamento'), true);
  assert.equal(isAdTemplateGreeting('Oi, tudo bem?'), false);
});

test('boas-vindas fazem uma pergunta por vez e oferecem foto e vídeo opcionais', () => {
  const welcome = intakeWelcomeMessage();
  assert.match(welcome, /qual bairro/i);
  assert.doesNotMatch(welcome, /Equipamento e marca\/modelo:/i);
  assert.match(welcome, /foto ou vídeo/i);
  assert.match(welcome, /não é obrigatório/i);
});

test('formulário completo numerado reconhece bairro, marca/modelo e problema', () => {
  assert.deepEqual(extractIntakeForm(
    '1. Bairro: Boca do Rio\n2. Equipamento: Fogão Consul 4 bocas\n3. Problema: Forno não acende'
  ), {
    neighborhood: 'Boca do Rio', equipment:'Fogão Consul 4 bocas', problem:'Forno não acende'
  });
});

test('formulário copiado, com asteriscos, emojis e marca/modelo', () => {
  const f=extractIntakeForm('📍 *Bairro:* Imbuí\n🔥 *Equipamento e marca/modelo:* Cooktop Fischer 5 bocas\n🔧 *Problema:* Chama baixa');
  assert.deepEqual(f, {neighborhood:'Imbuí',equipment:'Cooktop Fischer 5 bocas',problem:'Chama baixa'});
});

test('respostas só com números são aceitas, sem rótulos', () => {
  assert.deepEqual(extractIntakeForm('1) Pituba\n2) Fogão Brastemp\n3) O botão está quebrado'),
    {neighborhood:'Pituba',equipment:'Fogão Brastemp',problem:'O botão está quebrado'});
});

test('modelo em linha própria é combinado com equipamento', () => {
  assert.deepEqual(extractIntakeForm('Bairro: Barra\nEquipamento: forno\nModelo: Venax\nDefeito: não acende'),
    {neighborhood:'Barra',equipment:'forno — Venax',problem:'não acende'});
});

test('respostas incompletas geram pergunta específica sobre o que falta', () => {
  assert.equal(nextIntakeQuestion(['equipment','problem','neighborhood']), 'Qual é o bairro onde precisa do atendimento?');
  assert.match(nextIntakeQuestion(['equipment','problem']), /equipamento/);
  assert.match(nextIntakeQuestion(['problem']), /problema/);
});

test('descrição de fogão não pode ser capturada como bairro', () => {
  const f=extractFacts({text:'Fogão Brastemp',expectedField:'neighborhood'});
  assert.equal(f.neighborhood,undefined);
  assert.equal(f.equipment,'Fogão residencial');
  const g=extractFacts({text:'Boca do Rio',expectedField:'neighborhood'});
  assert.equal(g.neighborhood,'Boca do Rio');
});

test('conclusão passa ao técnico e não condiciona a foto ou vídeo', () => {
  const msg=intakeDoneMessage({neighborhood:'Costa Azul',equipment:'Fogão 5 bocas',problem:'forno não liga'});
  assert.match(msg,/Valdemir/);
  assert.match(msg,/Costa Azul/);
  assert.match(msg,/não é obrigatório/);
});

test('não sobrescreve o modelo do fogão ao receber a descrição do defeito', () => {
  const fields=extractFacts({text:'O forno não acende',expectedField:'problem'});
  assert.equal(fields.equipment,undefined);
  assert.equal(fields.problem,'Não acende');
  const next=extractFacts({text:'Não acende',expectedField:'equipment'});
  assert.equal(next.equipment,undefined);
});

test('primeiro contato com bairro em frase livre preserva o local', () => {
  assert.deepEqual(extractIntakeForm('Teste Valtec: preciso de atendimento para um fogão no bairro Boca do Rio.'), {neighborhood:'Boca do Rio'});
  assert.deepEqual(extractIntakeForm('Preciso de assistência para forno no bairro Imbuí, por favor.'), {neighborhood:'Imbuí'});
  assert.deepEqual(extractIntakeForm('Atendem no bairro Costa Azul?'), {neighborhood:'Costa Azul'});
});

test('não inventa bairro quando texto apenas pergunta qual bairro é atendido', () => {
  assert.equal(extractIntakeForm('Qual é o bairro atendido?').neighborhood, undefined);
  assert.equal(extractIntakeForm('Tenho interesse no conserto do fogão').neighborhood, undefined);
});

test('cliente pode se identificar pelo nome na própria conversa', () => {
  assert.equal(extractFacts({text:'Oi, meu nome é Ana Maria e preciso de um orçamento'}).customer_name,'Ana Maria');
  assert.equal(extractFacts({text:'Me chamo Paulo, queria consertar meu forno'}).customer_name,'Paulo');
  assert.equal(extractFacts({text:'Preciso de ajuda com o meu fogão'}).customer_name,undefined);
});

test('apresentar o nome não deve virar bairro na pergunta seguinte',()=>{
 const facts=extractFacts({text:'Oi, meu nome é Ana Maria e preciso de um orçamento',expectedField:'neighborhood'});
 assert.equal(facts.customer_name,'Ana Maria');
 assert.equal(facts.neighborhood,undefined);
 assert.equal(extractFacts({text:'Boca do Rio',expectedField:'neighborhood'}).neighborhood,'Boca do Rio');
});
