import { intakeWelcomeMessage, extractIntakeForm, isGenericInterest, nextIntakeQuestion, intakeDoneMessage } from './whatsapp-intake.mjs';

// Simulador local: nenhuma chamada à Meta, nenhum INSERT no Supabase, nenhum envio de WhatsApp.
const $ = (s,r=document) => r.querySelector(s);
let session = {};
let started = false;
let finished = false;

function addBubble(text, kind) {
  const body = $('#valtec-sim-messages');
  if (!body) return;
  const bubble = document.createElement('div');
  bubble.className = 'valtec-sim-bubble ' + kind;
  bubble.textContent = text;
  body.append(bubble);
  body.scrollTop = body.scrollHeight;
}
function missing() {
  return ['neighborhood','equipment','problem'].filter(k => !String(session[k] || '').trim());
}
function reset() {
  session = {}; started = false; finished = false;
  const body = $('#valtec-sim-messages');
  if (body) body.textContent = '';
  addBubble('Simulação local. Clique em “Simular interesse” ou digite uma mensagem para começar.', 'system');
}
function replyToSimulation(value) {
  const raw = String(value || '').trim();
  if (!raw) return;
  addBubble(raw, 'client');
  if (finished) { addBubble('Atendimento já encaminhado ao técnico. Um profissional assume daqui em diante.', 'bot'); return; }
  if (!started) {
    started = true;
    if(!Object.keys(extractIntakeForm(raw)).length) {
      addBubble(intakeWelcomeMessage(), 'bot');
      return;
    }
  }
  const fields = extractIntakeForm(raw);
  if (!Object.keys(fields).length && !isGenericInterest(raw)) {
    const next = missing()[0];
    if (next && raw.length <= (next === 'problem' ? 500 : 150)) fields[next] = raw;
  }
  Object.assign(session, fields);
  const remaining = missing();
  if (!remaining.length) {
    finished = true;
    addBubble(intakeDoneMessage(session), 'bot');
    return;
  }
  addBubble(nextIntakeQuestion(remaining), 'bot');
}
function modal() {
  let root = $('#valtec-whatsapp-simulator');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'valtec-whatsapp-simulator';
  root.style.display = 'none';
  root.innerHTML = `
    <div class="valtec-sim-backdrop" data-sim-close></div>
    <section class="valtec-sim-card" role="dialog" aria-modal="true" aria-labelledby="valtec-sim-title">
      <header><div><h2 id="valtec-sim-title">Testar triagem do WhatsApp</h2><p>Simulação segura. Não envia mensagens, não cria leads e não altera o financeiro.</p></div><button type="button" data-sim-close aria-label="Fechar">×</button></header>
      <div id="valtec-sim-messages" role="log" aria-live="polite"></div>
      <div class="valtec-sim-quick"><button type="button" id="valtec-sim-start">Simular interesse</button><button type="button" id="valtec-sim-example">Preencher exemplo</button><button type="button" id="valtec-sim-reset">Reiniciar</button></div>
      <form id="valtec-sim-form"><input id="valtec-sim-input" class="input" placeholder="Escreva como se fosse um cliente..." autocomplete="off" required><button class="btn btn-primary" type="submit">Enviar</button></form>
      <small>O simulador testa o roteiro de perguntas, não a conexão com a Meta. Os testes reais devem ocorrer depois pelo número comercial.</small>
    </section>`;
  const style = document.createElement('style');
  style.textContent = `
    #valtec-whatsapp-simulator{position:fixed;inset:0;z-index:9999}
    .valtec-sim-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.62)}
    .valtec-sim-card{position:absolute;inset:4% auto auto 50%;transform:translateX(-50%);width:min(95vw,600px);max-height:90vh;overflow:auto;border-radius:16px;background:#fff;color:#202d37;box-shadow:0 14px 70px #0005;padding:20px;display:flex;flex-direction:column;gap:12px}
    .valtec-sim-card header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .valtec-sim-card h2{font-size:20px;margin:0}
    .valtec-sim-card p,.valtec-sim-card small{font-size:12px;color:#53616e}
    .valtec-sim-card header button{border:0;background:transparent;font-size:28px;cursor:pointer}
    #valtec-sim-messages{background:#f0f4f3;min-height:170px;max-height:45vh;overflow:auto;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:9px}
    .valtec-sim-bubble{white-space:pre-wrap;max-width:90%;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.45}
    .valtec-sim-bubble.bot{background:white;align-self:flex-start}
    .valtec-sim-bubble.client{background:#d9fdd3;align-self:flex-end}
    .valtec-sim-bubble.system{background:#e4ebf2;align-self:center;font-size:12px}
    .valtec-sim-quick{display:flex;flex-wrap:wrap;gap:8px}
    .valtec-sim-quick button{border:1px solid #d3dce3;padding:8px 12px;border-radius:9px;background:white;cursor:pointer}
    #valtec-sim-form{display:flex;gap:8px}#valtec-sim-input{flex:1;min-width:80px}
  `;
  document.head.append(style);
  document.body.append(root);
  root.querySelectorAll('[data-sim-close]').forEach(b=>b.addEventListener('click',()=>root.style.display='none'));
  $('#valtec-sim-form').addEventListener('submit',event=>{
    event.preventDefault();
    const input=$('#valtec-sim-input');
    replyToSimulation(input.value);
    input.value='';
    input.focus();
  });
  $('#valtec-sim-start').addEventListener('click',()=>{
    reset();replyToSimulation('Olá, posso ter mais informações sobre isso?');
  });
  $('#valtec-sim-example').addEventListener('click',()=>{
    if(!started)replyToSimulation('Olá, posso ter mais informações sobre isso?');
    replyToSimulation('1. Bairro: Boca do Rio\n2. Equipamento: Fogão Consul 4 bocas\n3. Problema: O forno não acende');
  });
  $('#valtec-sim-reset').addEventListener('click',reset);
  reset();
  return root;
}
function boot() {
  const header = $('.lead-header');
  if (!header || $('#valtec-sim-open')) return;
  const button = document.createElement('button');
  button.type='button';
  button.id='valtec-sim-open';
  button.className='btn btn-light';
  button.textContent='Testar bot (simulação)';
  button.addEventListener('click',()=>{
    const root=modal();
    reset();
    root.style.display='block';
    $('#valtec-sim-input')?.focus();
  });
  header.append(button);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
