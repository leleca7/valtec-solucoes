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

test('boas-vindas pedem três informações com foto e vídeo opcionais', () => {
  const welcome = intakeWelcomeMessage();
  for (const field of ['Bairro:', 'Equipamento e marca/modelo:', 'Qual é o problema?']) {
    assert.ok(welcome.includes(field), field);
  }
  assert.ok(welcome.includes('opcionais'));
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
