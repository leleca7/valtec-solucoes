import { getSupabase, isSupabaseConfigured } from './supabase.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function message(text, type = 'success') {
  const box = $('#login-message');
  if (!box) return;
  box.innerHTML = text;
  box.className = `notice ${type}`;
}

function prepareLoginUi() {
  const form = $('#login-form');
  if (!form) return;

  // Os binários de marca presentes neste branch não representam com segurança
  // o original preservado no Drive. A Central não recria nem aproxima a logo:
  // oculta essas imagens até a substituição pelo asset oficial íntegro.
  $$('.premium-login .brand-logo, .central-sidebar .admin-brand, .admin-top-mark').forEach((element) => element.remove());

  // Impede o antigo fluxo por link mágico de registrar outro submit.
  form.dataset.bound = '1';
  $('#demo-button')?.remove();

  const intro = $('.premium-login .muted');
  if (intro) intro.textContent = 'Entre com o e-mail autorizado e sua senha. Depois de configurada, não é necessário solicitar um link a cada acesso.';

  const oldButton = form.querySelector('button[type="submit"]');
  if (oldButton) oldButton.textContent = 'Entrar na Central';

  if (!$('#admin-password')) {
    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = '<label for="admin-password">Senha</label><input class="input" type="password" id="admin-password" autocomplete="current-password" minlength="8" placeholder="Sua senha" required>';
    oldButton?.before(field);
  }

  if (!$('#password-reset-button')) {
    const reset = document.createElement('button');
    reset.id = 'password-reset-button';
    reset.type = 'button';
    reset.className = 'btn btn-light full top-gap';
    reset.textContent = 'Criar / alterar senha';
    form.after(reset);
  }
}

function showPasswordRecovery(supabase) {
  if ($('#password-recovery-modal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'password-recovery-modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(6,18,37,.86);display:grid;place-items:center;padding:20px';
  overlay.innerHTML = `
    <form id="password-recovery-form" class="login-card premium-login" style="width:min(520px,100%);margin:0">
      <span class="admin-pill">Nova senha</span>
      <h1>Definir senha da Central</h1>
      <p class="muted">Crie uma senha com pelo menos 8 caracteres. Ela ficará protegida pelo Supabase e não será salva no código do site.</p>
      <div id="password-recovery-message" class="notice hidden"></div>
      <div class="field"><label for="new-password">Nova senha</label><input class="input" id="new-password" type="password" minlength="8" autocomplete="new-password" required></div>
      <div class="field"><label for="confirm-password">Confirmar senha</label><input class="input" id="confirm-password" type="password" minlength="8" autocomplete="new-password" required></div>
      <button class="btn btn-primary full" type="submit">Salvar nova senha</button>
    </form>`;
  document.body.appendChild(overlay);

  $('#password-recovery-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const p1 = $('#new-password').value;
    const p2 = $('#confirm-password').value;
    const box = $('#password-recovery-message');
    if (p1 !== p2) {
      box.textContent = 'As duas senhas precisam ser iguais.';
      box.className = 'notice error';
      return;
    }
    if (p1.length < 8) {
      box.textContent = 'Use pelo menos 8 caracteres.';
      box.className = 'notice error';
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: p1 });
    if (error) {
      box.textContent = 'Não foi possível salvar a senha. Abra novamente o link recebido por e-mail.';
      box.className = 'notice error';
      return;
    }
    box.textContent = 'Senha criada. Entrando na Central...';
    box.className = 'notice success';
    history.replaceState({}, '', location.pathname);
    setTimeout(() => location.reload(), 800);
  });
}

async function applyRoleUi(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('user_id,display_name,email,role,active')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (!profile) return;

  document.body.dataset.adminRole = profile.role || '';
  document.body.dataset.adminEmail = profile.email || user.email || '';

  if (profile.role === 'operacao_admin') {
    ['marketing', 'team', 'history'].forEach((tab) => {
      $$(`[data-admin-tab="${tab}"], [data-tab-panel="${tab}"]`).forEach((el) => el.remove());
    });

    const welcome = $('#admin-welcome');
    if (welcome) welcome.textContent = 'Atendimentos, clientes, orçamentos, agenda, recibos, peças e garantias.';

    const help = $('.side-help');
    if (help) help.innerHTML = '<strong>Fluxo do serviço</strong><span>Cliente → orçamento → OS → recibo → garantia.</span>';
  }
}

async function init() {
  prepareLoginUi();
  if (!isSupabaseConfigured()) return;
  const supabase = await getSupabase();

  const form = $('#login-form');
  if (form && !form.dataset.passwordLoginBound) {
    form.dataset.passwordLoginBound = '1';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = $('#admin-email')?.value.trim().toLowerCase();
      const password = $('#admin-password')?.value || '';
      if (!email || !password) return message('Informe e-mail e senha.', 'error');
      message('Entrando...', 'success');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        message('Não foi possível entrar. Confira a senha ou use “Criar / alterar senha”.', 'error');
        return;
      }
      location.reload();
    });
  }

  $('#password-reset-button')?.addEventListener('click', async () => {
    const email = $('#admin-email')?.value.trim().toLowerCase();
    if (!email) return message('Digite primeiro o e-mail que vai receber o link para criar a senha.', 'error');
    const redirectTo = `${location.origin}${location.pathname}?reset=1`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return message('Não foi possível enviar o link de criação de senha.', 'error');
    message('<strong>Link enviado.</strong><br>Abra o e-mail uma única vez para criar ou alterar sua senha. Depois os próximos acessos serão por e-mail + senha.', 'success');
  });

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showPasswordRecovery(supabase);
  });

  const params = new URLSearchParams(location.search);
  if (params.get('reset') === '1') {
    setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) showPasswordRecovery(supabase);
    }, 350);
  }

  await applyRoleUi(supabase);
}

init();
