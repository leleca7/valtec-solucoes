import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
const norm = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const money = (value) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(value) || 0);
const localDate = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';

const CAREER = { auxiliar:'Auxiliar Técnico', formacao:'Técnico em Formação', tecnico:'Técnico Valtec', senior:'Técnico Sênior', lider_rota:'Líder de Rota' };
const AUTONOMY = { observa:'Observa', auxilia:'Auxilia', supervisionado:'Executa supervisionado', autonomo:'Executa sozinho', ensina:'Ensina outro técnico' };
const STATUS = { candidato:'Candidato', experiencia:'Experiência', formacao:'Em formação', ativo:'Ativo', pausado:'Pausado', inativo:'Inativo' };
const COMPETENCIES = ['Atendimento e postura','Segurança','Diagnóstico','Fogão residencial','Cooktop','Forno a gás','Cozinha profissional','Registro no sistema'];
const state = { supabase:null, technicians:[], skills:[], orders:[], selectedId:null };

async function client() {
  if (state.supabase) return state.supabase;
  if (!isSupabaseConfigured()) return null;
  state.supabase = await getSupabase();
  return state.supabase;
}

async function schemaReady() {
  try {
    const s = await client();
    if (!s) return false;
    const { data: sessionData } = await s.auth.getSession();
    if (!sessionData?.session) return false;
    const [a,b] = await Promise.all([s.from('technicians').select('id').limit(1), s.from('technician_skills').select('id').limit(1)]);
    return !a.error && !b.error;
  } catch { return false; }
}

function injectStyles() {
  if ($('#valtec-technicians-css')) return;
  const link = document.createElement('link');
  link.id = 'valtec-technicians-css';
  link.rel = 'stylesheet';
  link.href = 'technicians-central.css?v=20260828-1';
  document.head.appendChild(link);
}

function injectUi() {
  if ($('[data-admin-tab="technicians"]')) return;
  const nav = $('.central-nav');
  const teamButton = nav?.querySelector('[data-admin-tab="team"]');
  if (nav) {
    const button = document.createElement('button');
    button.dataset.adminTab = 'technicians';
    button.innerHTML = 'Técnicos <span class="technicians-nav-count" id="technicians-nav-count">0</span>';
    teamButton?.insertAdjacentElement('beforebegin', button) || nav.appendChild(button);
    button.addEventListener('click', openTab);
  }
  const section = document.createElement('section');
  section.className = 'admin-tab technicians-tab';
  section.dataset.tabPanel = 'technicians';
  section.innerHTML = `
    <div class="technicians-head"><div><span class="kicker">Equipe técnica</span><h2>Formação e autonomia</h2><p>Capacidade prática separada de acesso administrativo. A evolução é registrada por autonomia e competência.</p></div><button id="new-technician" class="btn btn-primary" type="button">+ Novo candidato / técnico</button></div>
    <div class="technicians-metrics"><article><small>Candidatos</small><strong id="tech-metric-candidates">0</strong></article><article><small>Em formação</small><strong id="tech-metric-training">0</strong></article><article><small>Autônomos</small><strong id="tech-metric-autonomous">0</strong></article><article><small>Prontos para rota</small><strong id="tech-metric-route">0</strong></article></div>
    <div class="technicians-layout"><section class="panel technicians-list-panel"><div class="technicians-toolbar"><input id="technician-search" class="input" placeholder="Buscar nome, bairro ou nível"><select id="technician-filter" class="input"><option value="">Todos</option><option value="candidato">Candidatos</option><option value="experiencia">Experiência</option><option value="formacao">Em formação</option><option value="ativo">Ativos</option><option value="pausado">Pausados</option><option value="inativo">Inativos</option></select></div><div id="technicians-list"></div></section><section class="panel technicians-detail-panel" id="technician-detail"><div class="technician-detail-empty"><span class="kicker">Desenvolvimento</span><h3>Selecione um profissional</h3><p>Veja autonomia, histórico de OS e matriz de competências.</p></div></section></div>`;
  const teamPanel = $('[data-tab-panel="team"]');
  if (teamPanel?.parentNode) teamPanel.parentNode.insertBefore(section, teamPanel);
  else $('.central-main')?.appendChild(section);
  $('#new-technician')?.addEventListener('click', () => renderEditor());
  $('#technician-search')?.addEventListener('input', renderList);
  $('#technician-filter')?.addEventListener('change', renderList);
}

function activateTab() {
  $$('[data-admin-tab]').forEach((button) => button.classList.toggle('active', button.dataset.adminTab === 'technicians'));
  $$('[data-tab-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.tabPanel === 'technicians'));
}

async function openTab() {
  activateTab();
  await load();
  renderAll();
}

async function load() {
  const s = await client();
  const [techRes, skillsRes, ordersRes] = await Promise.all([
    s.from('technicians').select('*').order('updated_at', { ascending:false }).limit(300),
    s.from('technician_skills').select('*').limit(2000),
    s.from('service_orders').select('id,technician_id,assigned_technician,status,total_amount,parts_amount,labor_amount,discount_amount,parts_cost,consumables_cost,travel_cost,payment_fee,warranty_rework_cost,other_variable_cost,return_required,founder_executed,completed_at,created_at').order('created_at', { ascending:false }).limit(1500)
  ]);
  if (!techRes.error) state.technicians = techRes.data || [];
  if (!skillsRes.error) state.skills = skillsRes.data || [];
  if (!ordersRes.error) state.orders = ordersRes.data || [];
  refreshOrderSuggestions();
}

function refreshOrderSuggestions() {
  const list = $('#order-technician-suggestions');
  if (!list) return;
  list.innerHTML = state.technicians.filter((tech) => tech.active && ['formacao','ativo','experiencia'].includes(tech.status)).map((tech) => `<option value="${esc(tech.name)}"></option>`).join('');
}

function renderMetrics() {
  $('#tech-metric-candidates').textContent = state.technicians.filter((tech) => tech.status === 'candidato').length;
  $('#tech-metric-training').textContent = state.technicians.filter((tech) => ['experiencia','formacao'].includes(tech.status)).length;
  $('#tech-metric-autonomous').textContent = state.technicians.filter((tech) => tech.autonomy_level === 'autonomo' || tech.autonomy_level === 'ensina' || tech.can_work_solo).length;
  $('#tech-metric-route').textContent = state.technicians.filter((tech) => tech.route_ready && tech.active).length;
  $('#technicians-nav-count').textContent = state.technicians.filter((tech) => ['candidato','experiencia','formacao'].includes(tech.status)).length;
}

function renderList() {
  const q = norm($('#technician-search')?.value);
  const filter = $('#technician-filter')?.value || '';
  const rows = state.technicians.filter((tech) => {
    if (filter && tech.status !== filter) return false;
    if (!q) return true;
    return [tech.name,tech.phone,tech.neighborhood,CAREER[tech.career_level],AUTONOMY[tech.autonomy_level],tech.source].some((value) => norm(value).includes(q));
  });
  $('#technicians-list').innerHTML = rows.length ? rows.map((tech) => `<button class="technician-row ${tech.id === state.selectedId ? 'selected' : ''}" data-technician-id="${tech.id}" type="button"><div class="technician-row-top"><div><b>${esc(tech.name)}</b><span>${esc(STATUS[tech.status] || tech.status)} · ${esc(tech.neighborhood || 'Bairro não informado')}</span></div><span class="technician-level">${esc(CAREER[tech.career_level] || tech.career_level)}</span></div><p>${esc(AUTONOMY[tech.autonomy_level] || tech.autonomy_level)}${tech.route_ready ? ' · pronto para rota' : ''}</p></button>`).join('') : '<div class="technician-empty">Nenhum profissional encontrado.</div>';
  $$('[data-technician-id]').forEach((button) => button.addEventListener('click', () => selectTechnician(button.dataset.technicianId)));
}

function renderAll() {
  renderMetrics();
  renderList();
  if (state.selectedId) renderDetail(state.selectedId);
}

function selectTechnician(id) {
  state.selectedId = id;
  renderList();
  renderDetail(id);
}

function ordersFor(tech) {
  return state.orders.filter((order) => order.technician_id === tech.id || (!order.technician_id && norm(order.assigned_technician) === norm(tech.name)));
}

function orderEconomics(order) {
  const revenue = Math.max(0, Number(order.total_amount || (Number(order.parts_amount || 0) + Number(order.labor_amount || 0))) - Number(order.discount_amount || 0));
  const cost = Number(order.parts_cost || 0) + Number(order.consumables_cost || 0) + Number(order.travel_cost || 0) + Number(order.payment_fee || 0) + Number(order.warranty_rework_cost || 0) + Number(order.other_variable_cost || 0);
  return { revenue, margin:revenue - cost };
}

function skillsFor(id) {
  return state.skills.filter((skill) => skill.technician_id === id);
}

function renderDetail(id) {
  const tech = state.technicians.find((item) => item.id === id);
  const detail = $('#technician-detail');
  if (!tech || !detail) return;
  const orders = ordersFor(tech);
  const concluded = orders.filter((order) => order.status === 'concluido');
  const returns = concluded.filter((order) => order.return_required).length;
  const margin = concluded.reduce((sum, order) => sum + orderEconomics(order).margin, 0);
  const founderSupport = concluded.filter((order) => order.founder_executed === true).length;
  const skills = skillsFor(id);
  detail.innerHTML = `
    <div class="technician-detail-head"><div><span class="kicker">${esc(STATUS[tech.status] || tech.status)}</span><h2>${esc(tech.name)}</h2><p>${esc(CAREER[tech.career_level] || tech.career_level)} · ${esc(AUTONOMY[tech.autonomy_level] || tech.autonomy_level)}</p></div><button type="button" class="btn btn-light" id="edit-technician">Editar</button></div>
    <div id="technician-message"></div>
    <div class="technician-info"><div><small>Telefone</small><strong>${esc(tech.phone || '—')}</strong></div><div><small>E-mail</small><strong>${esc(tech.email || '—')}</strong></div><div><small>Bairro</small><strong>${esc(tech.neighborhood || '—')}</strong></div><div><small>Origem</small><strong>${esc(tech.source || '—')}</strong></div><div><small>Executa sozinho</small><strong>${tech.can_work_solo ? 'Sim' : 'Não'}</strong></div><div><small>Pronto para rota</small><strong>${tech.route_ready ? 'Sim' : 'Não'}</strong></div><div><small>Início</small><strong>${localDate(tech.start_date)}</strong></div><div><small>Disponibilidade</small><strong>${esc(tech.availability_notes || '—')}</strong></div><div class="wide"><small>Observações de desenvolvimento</small><p>${esc(tech.notes || 'Nenhuma observação registrada.')}</p></div></div>
    <div class="technician-performance"><div><small>OS atribuídas</small><strong>${orders.length}</strong></div><div><small>Concluídas</small><strong>${concluded.length}</strong></div><div><small>Retornos</small><strong>${returns}</strong></div><div><small>Margem das OS</small><strong>${money(margin)}</strong></div></div>
    <div class="technician-info"><div><small>Apoio físico do fundador</small><strong>${concluded.length ? `${founderSupport} de ${concluded.length} OS` : 'Sem base'}</strong></div><div><small>Autonomia registrada</small><strong>${esc(AUTONOMY[tech.autonomy_level] || tech.autonomy_level)}</strong></div></div>
    <section class="technician-section"><div class="technician-section-head"><h3>Matriz de competências</h3><span class="muted small">A alteração fica registrada por competência.</span></div><div id="technician-skills">${renderSkills(tech, skills)}</div></section>`;
  $('#edit-technician')?.addEventListener('click', () => renderEditor(tech));
  $$('[data-tech-skill]').forEach((select) => select.addEventListener('change', () => saveSkill(tech.id, select.dataset.techSkill, select.value)));
}

function renderSkills(tech, skills) {
  return COMPETENCIES.map((competency) => {
    const skill = skills.find((item) => item.competency === competency);
    const value = skill?.level || 'observa';
    return `<div class="technician-skill"><b>${esc(competency)}</b><select class="input" data-tech-skill="${esc(competency)}">${Object.entries(AUTONOMY).map(([level,label]) => `<option value="${level}" ${value === level ? 'selected' : ''}>${label}</option>`).join('')}</select><span>${skill?.verified_at ? `Atualizado ${localDate(skill.verified_at)}` : 'Sem validação'}</span></div>`;
  }).join('');
}

function technicianForm(tech = {}) {
  return `<form id="technician-editor" class="technician-editor"><input type="hidden" id="technician-id" value="${esc(tech.id || '')}"><div class="technician-editor-grid"><div class="field"><label>Nome</label><input id="technician-name" class="input" required value="${esc(tech.name || '')}"></div><div class="field"><label>WhatsApp</label><input id="technician-phone" class="input" value="${esc(tech.phone || '')}"></div><div class="field"><label>E-mail</label><input id="technician-email" class="input" type="email" value="${esc(tech.email || '')}"></div><div class="field"><label>Bairro</label><input id="technician-neighborhood" class="input" value="${esc(tech.neighborhood || '')}"></div><div class="field"><label>Origem do candidato</label><input id="technician-source" class="input" value="${esc(tech.source || '')}" placeholder="Indicação, SENAI, rede social..."></div><div class="field"><label>Status</label><select id="technician-status" class="input">${Object.entries(STATUS).map(([value,label]) => `<option value="${value}" ${tech.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label>Nível de carreira</label><select id="technician-career" class="input">${Object.entries(CAREER).map(([value,label]) => `<option value="${value}" ${tech.career_level === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label>Autonomia geral</label><select id="technician-autonomy" class="input">${Object.entries(AUTONOMY).map(([value,label]) => `<option value="${value}" ${tech.autonomy_level === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label>Data de início</label><input id="technician-start-date" class="input" type="date" value="${tech.start_date || ''}"></div><div class="field"><label>Disponibilidade</label><input id="technician-availability" class="input" value="${esc(tech.availability_notes || '')}"></div></div><label class="order-ops-checkline"><input id="technician-solo" type="checkbox" ${tech.can_work_solo ? 'checked' : ''}><span>Pode assumir OS comum sem acompanhamento físico</span></label><label class="order-ops-checkline"><input id="technician-route-ready" type="checkbox" ${tech.route_ready ? 'checked' : ''}><span>Pode assumir rota/agenda própria</span></label><div class="field"><label>Observações de desenvolvimento</label><textarea id="technician-notes">${esc(tech.notes || '')}</textarea></div><div class="technician-editor-actions"><button class="btn btn-light" type="button" id="technician-editor-cancel">Cancelar</button><button class="btn btn-primary" type="submit">Salvar profissional</button></div></form>`;
}

function renderEditor(tech = null) {
  state.selectedId = tech?.id || null;
  const detail = $('#technician-detail');
  detail.innerHTML = `<div class="technician-detail-head"><div><span class="kicker">Equipe técnica</span><h2>${tech ? 'Editar profissional' : 'Novo candidato / técnico'}</h2><p>Registre capacidade e evolução separadamente de permissões do sistema.</p></div></div>${technicianForm(tech || {})}`;
  $('#technician-editor')?.addEventListener('submit', saveTechnician);
  $('#technician-editor-cancel')?.addEventListener('click', () => tech ? renderDetail(tech.id) : (detail.innerHTML = '<div class="technician-detail-empty"><span class="kicker">Desenvolvimento</span><h3>Selecione um profissional</h3><p>Veja autonomia, histórico de OS e matriz de competências.</p></div>'));
}

async function saveTechnician(event) {
  event.preventDefault();
  const id = $('#technician-id').value || null;
  const payload = { name:$('#technician-name').value.trim(), phone:$('#technician-phone').value.trim() || null, email:$('#technician-email').value.trim() || null, neighborhood:$('#technician-neighborhood').value.trim() || null, source:$('#technician-source').value.trim() || null, status:$('#technician-status').value, career_level:$('#technician-career').value, autonomy_level:$('#technician-autonomy').value, start_date:$('#technician-start-date').value || null, availability_notes:$('#technician-availability').value.trim() || null, can_work_solo:$('#technician-solo').checked, route_ready:$('#technician-route-ready').checked, notes:$('#technician-notes').value.trim() || null, active:$('#technician-status').value !== 'inativo', updated_at:new Date().toISOString() };
  if (!payload.name) return showMessage('Informe o nome do profissional.', 'error');
  const s = await client();
  const result = id ? await s.from('technicians').update(payload).eq('id', id).select().single() : await s.from('technicians').insert(payload).select().single();
  if (result.error) return showMessage('Não foi possível salvar o profissional.', 'error');
  await load();
  state.selectedId = result.data.id;
  renderAll();
  showMessage('Profissional salvo.', 'success');
}

async function saveSkill(technicianId, competency, level) {
  const s = await client();
  const payload = { technician_id:technicianId, competency, level, verified_at:new Date().toISOString(), updated_at:new Date().toISOString() };
  const { error } = await s.from('technician_skills').upsert(payload, { onConflict:'technician_id,competency' });
  if (error) return showMessage('Não foi possível atualizar a competência.', 'error');
  await load();
  renderDetail(technicianId);
  showMessage('Competência atualizada.', 'success');
}

function showMessage(text, type = '') {
  const box = $('#technician-message');
  if (box) box.innerHTML = `<div class="technician-message ${type}">${esc(text)}</div>`;
}

async function linkTechnicianToSavedOrder() {
  const name = $('#order-technician')?.value.trim();
  if (!name) return;
  const tech = state.technicians.find((item) => norm(item.name) === norm(name));
  if (!tech) return;
  let orderId = $('#order-id')?.value || null;
  for (let i=0; i<12 && !orderId; i+=1) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    orderId = $('#order-id')?.value || null;
  }
  if (!orderId) return;
  const s = await client();
  await s.from('service_orders').update({ technician_id:tech.id, assigned_technician:tech.name, updated_at:new Date().toISOString() }).eq('id', orderId);
}

function bindOrderLink() {
  const form = $('#order-form');
  if (!form || form.dataset.technicianLinkBound) return;
  form.dataset.technicianLinkBound = '1';
  form.addEventListener('submit', () => { if ($('#order-technician')?.value.trim()) linkTechnicianToSavedOrder(); });
}

async function boot() {
  if (!(await schemaReady())) return;
  injectStyles();
  injectUi();
  await load();
  bindOrderLink();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
else boot();
