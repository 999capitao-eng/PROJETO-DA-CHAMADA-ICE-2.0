(function () {
  try {
    const cfg = window.SUPABASE_CONFIG || {};
    if (cfg.URL && cfg.ANON_KEY && window.supabase) {
      window.supabaseClient = window.supabase.createClient(cfg.URL, cfg.ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } else { console.error('SUPABASE: Verifique supabase/config.js'); }
  } catch (e) { console.error('SUPABASE init:', e); }
})();
let MODO_REDEFINICAO = null;
async function authBuscarPerfil() {
  if (!window.supabaseClient) return null;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session?.user) return null;
  try {
    const { data: perfil } = await supabaseClient.from('perfis').select('id,papel,ativo,nome_completo,iniciais,cor_avatar').eq('id', session.user.id).maybeSingle();
    if (!perfil) return { bloqueado: 'sem_perfil' };
    if (!perfil.ativo) return { bloqueado: 'desativado' };
    const ehAdmin = perfil.papel === 'admin';
    const saida = { authUid: session.user.id, email: session.user.email || '', perfil: perfil.papel, nomeCompleto: perfil.nome_completo || (ehAdmin ? 'Secretaria' : 'Professor'), iniciais: perfil.iniciais || (ehAdmin ? 'SC' : 'PR'), cor: perfil.cor_avatar || 'azul', telaInicial: ehAdmin ? 'tela-home-adm' : 'tela-home-prof', professorId: null };
    saida.saudacao = 'Olá, ' + (saida.nomeCompleto.split(' ')[0] || (ehAdmin ? 'secretaria' : 'professor')) + '!';
    if (!ehAdmin) {
      const { data: cadProf } = await supabaseClient.from('professores').select('id,nome,iniciais,cor_avatar').eq('user_id', saida.authUid).eq('ativo', true).maybeSingle();
      if (cadProf) { saida.professorId = cadProf.id; if (cadProf.nome) { saida.nomeCompleto = cadProf.nome; saida.saudacao = 'Olá, ' + cadProf.nome.split(' ')[0] + '!'; } if (cadProf.iniciais) saida.iniciais = cadProf.iniciais; if (cadProf.cor_avatar) saida.cor = cadProf.cor_avatar; }
    }
    return saida;
  } catch (e) { console.warn('authBuscarPerfil:', e); return { bloqueado: 'erro_perfil' }; }
}
async function authEntrarNoAppSeLogado() {
  const u = await authBuscarPerfil();
  if (!u) return false;
  if (u.bloqueado) { try { await supabaseClient.auth.signOut(); } catch (e) {} const erro = document.getElementById('login-erro'); if (erro) erro.textContent = u.bloqueado === 'desativado' ? '❌ Acesso desativado. Contate a secretaria.' : '❌ Usuário sem perfil. Contate a secretaria.'; irPara('tela-login'); return false; }
  usuarioAtual = u; resetarEstadoChamada(); const sc = document.getElementById('sel-classe-chamada'); const sd = document.getElementById('sel-data-chamada'); if (sc) sc.value = ''; if (sd) sd.value = ''; aplicarHeaders(); await carregarDadosSupabase(); await carregarChamadas(); popularSelectsChamada(); renderizarTudo(); irPara(u.telaInicial); return true;
}
async function authInit() {
  const urlParams = new URLSearchParams(window.location.search); const tipo = urlParams.get('type'); const hashTemToken = /access_token|type=invite|type=recovery/.test(window.location.hash || ''); const sb = window.supabaseClient; if (!sb) { irPara('tela-login'); return; }
  if (tipo === 'recovery' || tipo === 'invite' || hashTemToken) {
    MODO_REDEFINICAO = (tipo === 'recovery') ? 'recovery' : 'convite';
    const tit = document.getElementById('redefinir-titulo'); const sub = document.getElementById('redefinir-sub');
    if (MODO_REDEFINICAO === 'recovery') { if (tit) tit.textContent = 'Redefina sua senha'; if (sub) sub.textContent = 'Crie uma senha nova.'; }
    else { if (tit) tit.textContent = 'Crie sua senha'; if (sub) sub.textContent = 'Bem-vindo! Crie sua senha de acesso.'; }
    irPara('tela-redefinir-senha');
  } else { const ok = await authEntrarNoAppSeLogado(); if (!ok) irPara('tela-login'); }
  sb.auth.onAuthStateChange(async (evento, sn) => {
    try {
      if (evento === 'SIGNED_OUT') { fecharMenusPerfil(); usuarioAtual = null; irPara('tela-login'); return; }
      if (evento === 'PASSWORD_RECOVERY' && !MODO_REDEFINICAO) { MODO_REDEFINICAO = 'recovery'; const tit = document.getElementById('redefinir-titulo'); const sub = document.getElementById('redefinir-sub'); if (tit) tit.textContent = 'Redefina sua senha'; if (sub) sub.textContent = 'Crie sua nova senha.'; irPara('tela-redefinir-senha'); return; }
      if (evento === 'SIGNED_IN' && !MODO_REDEFINICAO && !usuarioAtual) { await authEntrarNoAppSeLogado(); }
      if (evento === 'USER_UPDATED' && MODO_REDEFINICAO) { MODO_REDEFINICAO = null; if (window.history.replaceState) window.history.replaceState({}, document.title, window.location.pathname); await authEntrarNoAppSeLogado(); }
    } catch (e) { console.warn('onAuthStateChange', e); }
  });
}
async function telaEsqueciSenha() {
  const email = (prompt('Digite o e-mail cadastrado da sua conta:') || '').trim(); if (!email) return; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('E-mail inválido.', 'erro'); return; }
  const sb = window.supabaseClient; if (!sb) { toast('Sistema não inicializado.', 'erro'); return; }
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if (error) {
      const msg = (error && error.message) ? error.message : 'Não foi possível enviar o e-mail de recuperação.';
      toast('❌ Erro ao enviar link: ' + msg, 'erro', 9000);
      return;
    }
  } catch (e) {
    const msg = (e && (e.error || e.message)) || 'Erro de conexão ao enviar o link de recuperação.';
    toast('❌ Erro ao enviar link: ' + msg, 'erro', 9000);
    return;
  }
  toast('Se este e-mail estiver cadastrado, enviamos um link. Verifique também o spam.', 'sucesso', 7000);
}
async function redefinirSenha() {
  await comLoadingBtn(document.getElementById('btn-redefinir'), async () => {
    const s1 = (document.getElementById('redefinir-senha1')?.value || ''); const s2 = (document.getElementById('redefinir-senha2')?.value || ''); const erro = document.getElementById('redefinir-erro'); if (erro) erro.textContent = '';
    if (!s1 || s1.length < 8) throw new Error(erro ? (erro.textContent = '⚠️ A senha precisa ter pelo menos 8 caracteres.') : 'val');
    if (s1 !== s2) throw new Error(erro ? (erro.textContent = '⚠️ As senhas não batem.') : 'val');
    const sb = window.supabaseClient; if (!sb) throw new Error(erro ? (erro.textContent = '❌ Sistema não inicializado.') : 'val');
    const { error } = await sb.auth.updateUser({ password: s1 });
    if (error) { if (erro) erro.textContent = '❌ ' + (error.message || 'Erro ao salvar.'); throw error; }
    toast('Senha salva com sucesso!', 'sucesso', 2000);
  }, { txtLoading: 'Salvando senha...', txtOk: 'Senha salva!' });
}
function irParaTelaLoginLimpa() { MODO_REDEFINICAO = null; ['redefinir-senha1','redefinir-senha2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); const el = document.getElementById('redefinir-erro'); if (el) el.textContent = ''; irPara('tela-login'); }
document.addEventListener('DOMContentLoaded', () => {
  const sL = document.getElementById('login-senha'); const uL = document.getElementById('login-usuario');
  if (uL) uL.addEventListener('keydown', e => { if (e.key === 'Enter') sL && sL.focus(); }); if (sL) sL.addEventListener('keydown', e => { if (e.key === 'Enter') logar(); });
  const s1 = document.getElementById('redefinir-senha1'); const s2 = document.getElementById('redefinir-senha2');
  if (s1) s1.addEventListener('keydown', e => { if (e.key === 'Enter') s2 && s2.focus(); }); if (s2) s2.addEventListener('keydown', e => { if (e.key === 'Enter') redefinirSenha(); });
  setTimeout(() => authInit(), 30);
});
let DASH_POR_DATA = [];
let DASH_POR_ALUNO = {};
const DADOS = {
  classes: [],
  alunos: [],
  professores: [],
  categoriasClasse: ['Crianças', 'Adolescentes', 'Jovens', 'Adultos']
};
const CORES_AVATAR = ['azul', 'verde', 'rosa', 'roxo', 'preto', 'laranja'];
const CORES_ICONE_CLASSE = ['icone-azul', 'icone-verde', 'icone-laranja'];
let usuarioAtual = null;
let CLASSE_DETALHE_ATUAL_ID = null;
let FILTROS_ALUNOS = { pesq: '', classe: 'todas' };
let VER_TODOS_ALUNOS = false;
let CHAMADA_ESTADO = { classeId: null, dataISO: null, marcacoes: {}, editandoId: null };
let CHAMADAS_REGISTRO = [];
let totalBiblias = 0;
let totalRevistas = 0;
let totalOferta = 0;
let tipoDistribuicaoAtual = null;
function gerarNumerosModal() {
  const container = document.getElementById('modal-opcoes');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i <= 50; i++) {
    const div = document.createElement('div');
    div.className = 'numero-opcao';
    div.textContent = i;
    div.onclick = () => selecionarNumero(i);
    container.appendChild(div);
  }
}
function abrirModalNumeros(tipo) {
  tipoDistribuicaoAtual = tipo;
  const modal = document.getElementById('modal-numeros');
  const titulo = document.getElementById('modal-titulo');
  if (titulo) {
    titulo.textContent = tipo === 'biblias' ? 'Selecione o total de Bíblias' : 'Selecione o total de Revistas';
  }
  gerarNumerosModal();
  if (modal) modal.classList.add('ativo');
}
function fecharModalNumeros() {
  const modal = document.getElementById('modal-numeros');
  if (modal) modal.classList.remove('ativo');
  tipoDistribuicaoAtual = null;
}
function selecionarNumero(numero) {
  if (!tipoDistribuicaoAtual) return;
  if (tipoDistribuicaoAtual === 'biblias') {
    totalBiblias = numero;
    const el = document.querySelector('#card-biblias .numero-distribuicao');
    if (el) el.textContent = numero;
  } else if (tipoDistribuicaoAtual === 'revistas') {
    totalRevistas = numero;
    const el = document.querySelector('#card-revistas .numero-distribuicao');
    if (el) el.textContent = numero;
  }
  fecharModalNumeros();
}
function resetarContadoresDistribuicao() {
  totalBiblias = 0;
  totalRevistas = 0;
  const elB = document.querySelector('#card-biblias .numero-distribuicao');
  const elR = document.querySelector('#card-revistas .numero-distribuicao');
  if (elB) elB.textContent = '0';
  if (elR) elR.textContent = '0';
}
window.__chartInst = { presencaTotal: null, barras: null };
async function comLoadingBtn(btnEl, fnAsync, opts = {}) {
  if (!btnEl) return;
  if (btnEl.dataset.processando === '1') return;
  const { txtLoading = 'Salvando...', txtOk = 'Salvo!' } = opts;
  const htmlOrig = btnEl.innerHTML;
  btnEl.dataset.processando = '1';
  btnEl.disabled = true;
  btnEl.innerHTML = '<i data-lucide="loader-2" class="spin"></i> ' + txtLoading;
  if (window.lucide) lucide.createIcons({ root: btnEl });
  let resultado;
  try {
    await new Promise(r => setTimeout(r, 40));
    resultado = await Promise.resolve().then(() => fnAsync && fnAsync());
    await new Promise(r => setTimeout(r, 320));
  } finally {
    btnEl.innerHTML = htmlOrig;
    btnEl.disabled = false;
    delete btnEl.dataset.processando;
    if (window.lucide) lucide.createIcons({ root: btnEl });
  }
  return resultado;
}
function logar() {
  const btnEl = document.getElementById('btn-login');
  const acao = async () => {
    const email = document.getElementById('login-usuario').value.trim().toLowerCase();
    const senhaDigitada = document.getElementById('login-senha').value.trim();
    const erro = document.getElementById('login-erro');
    erro.textContent = '';
    if (!email || !senhaDigitada) { erro.textContent = '⚠️ Por favor, preencha e-mail e senha.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { erro.textContent = '⚠️ Informe um e-mail válido.'; return; }
    const sb = window.supabaseClient;
    if (!sb) { erro.textContent = '❌ Sistema não inicializado. Verifique supabase/config.js.'; return; }
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password: senhaDigitada });
      if (error) { let msg = '❌ E-mail ou senha incorretos.'; if (/email.*not.*confirmed/i.test(error.message || '')) msg = '⚠️ E-mail ainda não confirmado. Verifique sua caixa de entrada.'; throw new Error(msg); }
    } catch (eAuth) { erro.textContent = (eAuth && eAuth.message) ? eAuth.message : '❌ E-mail ou senha incorretos.'; const s = document.getElementById('login-senha'); s.value = ''; s.style.animation = 'shake .4s'; setTimeout(() => s.style.animation = '', 400); return; }
    await new Promise(r => setTimeout(r, 250));
    if (!usuarioAtual) await authEntrarNoAppSeLogado();
  };
  comLoadingBtn(btnEl, acao, { txtLoading: 'Entrando...', txtOk: 'Bem-vindo!' });
}
function perfilEhAdmin() {
  return !!(usuarioAtual && (usuarioAtual.perfil === 'admin'));
}
function perfilEhProfessor() {
  return !!(usuarioAtual && (usuarioAtual.perfil === 'professor' || usuarioAtual.professorId));
}
function esconderTelaseBotoesPorPerfil() {
  const telasAdm = ['tela-professores', 'tela-home-adm'];
  const telasProf = ['tela-home-prof'];
  telasAdm.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = perfilEhAdmin() ? '' : 'none';
    if (!perfilEhAdmin()) el.classList.remove('ativa');
  });
  telasProf.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = perfilEhProfessor() ? '' : 'none';
    if (!perfilEhProfessor()) el.classList.remove('ativa');
  });
  const linksAdm = document.querySelectorAll('[data-so-adm]');
  linksAdm.forEach(b => { b.style.display = perfilEhAdmin() ? '' : 'none'; });
}
function irPara(idTela) {
  if (CHAMADA_ESTADO.editandoId && idTela !== 'tela-chamada') {
    resetarEstadoChamada();
  }
  document.querySelectorAll('.tela').forEach(t => t.classList.remove('ativa'));
  const alvo = document.getElementById(idTela);
  if (alvo) {
    alvo.classList.add('ativa');
    window.scrollTo({top: 0, behavior: 'smooth'});
    if (idTela === 'tela-dashboard') {
      setTimeout(() => { animarDashboard(); dashAlunosInicializar(); renderizarRelatorioHoje(); }, 280);
    }
    if (idTela === 'tela-chamada') {
      setTimeout(() => { popularSelectsChamada(); chamadaAtualizarLista(); chamadaAtualizarModoEdicao(); }, 60);
    }
    if (idTela === 'tela-historico-chamadas') {
      setTimeout(() => { renderizarHistoricoChamadas(); }, 60);
    }
  }
}
function voltarHome() {
  if (!usuarioAtual) return irPara('tela-login');
  irPara(usuarioAtual.telaInicial);
}
function fecharMenusPerfil(exceto = null) {
  document.querySelectorAll('.perfil-menu').forEach(menu => {
    if (menu === exceto) return;
    menu.classList.remove('ativo');
    const dropdown = menu.querySelector('.perfil-dropdown');
    const btn = menu.querySelector('.perfil-menu-btn');
    if (dropdown) dropdown.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}
function togglePerfilMenu(btn) {
  const menu = btn.closest('.perfil-menu');
  if (!menu) return;
  const dropdown = menu.querySelector('.perfil-dropdown');
  const vaiAbrir = !menu.classList.contains('ativo');
  fecharMenusPerfil(vaiAbrir ? menu : null);
  menu.classList.toggle('ativo', vaiAbrir);
  if (dropdown) dropdown.hidden = !vaiAbrir;
  btn.setAttribute('aria-expanded', String(vaiAbrir));
  if (window.lucide) lucide.createIcons();
}
function sair() {
  fecharMenusPerfil();
  abrirModal(`
    <h3>Sair do sistema?</h3>
    <p class="submodal">Tem certeza que deseja sair da sua conta?</p>
    <div class="modal-botoes">
      <button class="btn-modal cancelar" id="btn-cancelar-sair" onclick="fecharModal()">
        <i data-lucide="x"></i> Cancelar
      </button>
      <button class="btn-modal salvar" id="btn-confirmar-sair" onclick="confirmarSair(this)">
        <i data-lucide="log-out"></i> Sair
      </button>
    </div>`);
}
async function sairPeloMenu() {
  fecharMenusPerfil();
  try { if (window.supabaseClient) await supabaseClient.auth.signOut(); } catch (e) {}
  usuarioAtual = null;
  resetarEstadoChamada();
  const selClasse = document.getElementById('sel-classe-chamada');
  const selData = document.getElementById('sel-data-chamada');
  if (selClasse) selClasse.value = '';
  if (selData) selData.value = '';
  document.getElementById('login-usuario').value = '';
  document.getElementById('login-senha').value = '';
  document.getElementById('login-erro').textContent = '';
  irPara('tela-login');
  setTimeout(() => toast('Você saiu da conta com segurança.', 'info'), 80);
}
function confirmarSair(btnRef) {
  const btnEl = btnRef || document.getElementById('btn-confirmar-sair');
  comLoadingBtn(btnEl, async () => {
    try { if (window.supabaseClient) await supabaseClient.auth.signOut(); } catch (e) {}
    usuarioAtual = null;
    resetarEstadoChamada();
    const selClasse = document.getElementById('sel-classe-chamada');
    const selData = document.getElementById('sel-data-chamada');
    if (selClasse) selClasse.value = '';
    if (selData) selData.value = '';
    document.getElementById('login-usuario').value = '';
    document.getElementById('login-senha').value = '';
    document.getElementById('login-erro').textContent = '';
    fecharModal();
    irPara('tela-login');
    setTimeout(() => toast('Você saiu da conta com segurança.', 'info'), 80);
  }, { txtLoading: 'Saindo...', txtOk: 'Saiu' });
}
function abrirModalAlterarSenha() {
  const modal = document.getElementById('modal-alterar-senha');
  const erro = document.getElementById('modal-alterar-senha-erro');
  if (!modal) return;
  if (erro) { erro.style.display = 'none'; erro.textContent = ''; }
  const n = document.getElementById('modal-nova-senha');
  const c = document.getElementById('modal-confirmar-senha');
  if (n) n.value = '';
  if (c) c.value = '';
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => { try { if (n) n.focus(); } catch (e) {} }, 50);
}

function fecharModalAlterarSenha() {
  const modal = document.getElementById('modal-alterar-senha');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  const n = document.getElementById('modal-nova-senha');
  const c = document.getElementById('modal-confirmar-senha');
  if (n) n.value = '';
  if (c) c.value = '';
  const erro = document.getElementById('modal-alterar-senha-erro');
  if (erro) { erro.style.display = 'none'; erro.textContent = ''; }
}

function alternarVisibilidadeSenha(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const mostrar = input.type === 'password';
  input.type = mostrar ? 'text' : 'password';
  if (btn) btn.textContent = mostrar ? 'Ocultar' : 'Mostrar';
}

async function salvarNovaSenha(btnEl) {
  const erro = document.getElementById('modal-alterar-senha-erro');
  const s1 = (document.getElementById('modal-nova-senha')?.value || '');
  const s2 = (document.getElementById('modal-confirmar-senha')?.value || '');
  if (erro) { erro.style.display = 'none'; erro.textContent = ''; }
  if (!s1 || s1.length < 8) {
    if (erro) { erro.style.display = 'block'; erro.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; }
    return;
  }
  if (s1 !== s2) {
    if (erro) { erro.style.display = 'block'; erro.textContent = 'As senhas não batem.'; }
    return;
  }
  const sb = window.supabaseClient;
  if (!sb) {
    if (erro) { erro.style.display = 'block'; erro.textContent = 'Sistema não inicializado.'; }
    return;
  }
  const acao = async () => {
    const { error } = await sb.auth.updateUser({ password: s1 });
    if (error) {
      const msg = (error && error.message) ? error.message : 'Erro ao alterar a senha.';
      if (erro) { erro.style.display = 'block'; erro.textContent = msg; }
      throw new Error(msg);
    }
    fecharModalAlterarSenha();
    toast('Senha alterada com sucesso!', 'sucesso');
  };
  if (btnEl) await comLoadingBtn(btnEl, acao, { txtLoading: 'Salvando...', txtOk: 'Salvar' });
  else await acao();
}

function aplicarHeaders() {
  if (!usuarioAtual) return;
  const tpl = document.getElementById('tmpl-header-voltar');
  document.querySelectorAll('[data-header]').forEach(container => {
    container.innerHTML = '';
    const clone = tpl.content.cloneNode(true);
    clone.querySelector('.saud-nome').textContent = usuarioAtual.saudacao;
    clone.querySelector('.badge-iniciais').textContent = usuarioAtual.iniciais;
    container.appendChild(clone);
  });
}
async function carregarDashboardViews() {
  if (!window.supabaseClient || !usuarioAtual) return;
  const sb = window.supabaseClient;
  try {
    const [{ data: porData, error: eData }] = await Promise.all([
      sb.from('vw_presenca_por_data').select('*')
    ]);
    const eClasse = null;
    const porClasse = null;
    if (eData) { console.error('carregarDashboardViews: falha em vw_presenca_por_data:', eData.message || eData); toast('Erro ao carregar dados do dashboard', 'erro'); }
    DASH_POR_DATA = Array.isArray(porData) ? porData : [];
  } catch (e) {
    console.error('carregarDashboardViews:', e);
    toast('Erro ao carregar dados do dashboard', 'erro');
  }
}

async function carregarDadosSupabase() {
  if (!window.supabaseClient || !usuarioAtual) return;
  const sb = window.supabaseClient;
  try {
    const [resClasses, resAlunos, resProfessores, resVinculos, resFreq] = await Promise.all([
      sb.from('classes').select('id,nome,categoria,cor_icone,ativo').eq('ativo', true).order('nome'),
      sb.from('alunos').select('id,nome,iniciais,cor_avatar,classe_id,data_nascimento,whatsapp,ativo').eq('ativo', true).order('nome'),
      sb.from('professores').select('id,nome,iniciais,cor_avatar,email,ativo').eq('ativo', true).order('nome'),
      sb.from('professor_classes').select('professor_id,classe_id'),
      sb.from('vw_frequencia_aluno').select('*')
    ]);
    if (resClasses.error) { console.error('carregarDadosSupabase: falha em classes:', resClasses.error.message || resClasses.error); toast('Erro ao carregar dados do dashboard', 'erro'); }
    if (resAlunos.error) { console.error('carregarDadosSupabase: falha em alunos:', resAlunos.error.message || resAlunos.error); toast('Erro ao carregar dados do dashboard', 'erro'); }
    if (resProfessores.error) { console.error('carregarDadosSupabase: falha em professores:', resProfessores.error.message || resProfessores.error); toast('Erro ao carregar dados do dashboard', 'erro'); }
    if (resVinculos.error) { console.error('carregarDadosSupabase: falha em professor_classes:', resVinculos.error.message || resVinculos.error); toast('Erro ao carregar dados do dashboard', 'erro'); }
    if (resFreq.error) { console.error('carregarDadosSupabase: falha em vw_frequencia_aluno:', resFreq.error.message || resFreq.error); toast('Erro ao carregar dados do dashboard', 'erro'); }
    const classes = resClasses.data;
    const alunos = resAlunos.data;
    const professores = resProfessores.data;
    const vinculos = resVinculos.data;
    DASH_POR_ALUNO = {};
    (resFreq.data || []).forEach(r => { DASH_POR_ALUNO[String(r.aluno_id)] = r; });
    await carregarDashboardViews();
    const profsPorClasse = new Map();
    (vinculos || []).forEach(v => { const arr = profsPorClasse.get(String(v.classe_id)) || []; arr.push(String(v.professor_id)); profsPorClasse.set(String(v.classe_id), arr); });
    DADOS.classes = (classes || []).map(c => { const ids = profsPorClasse.get(String(c.id)) || []; return { id: String(c.id), nome: c.nome || '', categoria: c.categoria || 'Adultos', cor: c.cor_icone || 'icone-azul', ativo: c.ativo !== false, professorIds: ids, professorId: ids.length ? ids[0] : null }; });
    DADOS.alunos = (alunos || []).map(a => ({ id: String(a.id), nome: a.nome || '', iniciais: a.iniciais || gerarIniciais(a.nome), cor: a.cor_avatar || 'azul', classeId: a.classe_id ? String(a.classe_id) : null, dataNasc: a.data_nascimento ? isoParaBR(a.data_nascimento) : '', whatsapp: a.whatsapp ? String(a.whatsapp).replace(/\D/g, '') : '', ativo: a.ativo !== false }));
    const vinc = vinculos || [];
    DADOS.professores = (professores || []).map(p => ({ id: String(p.id), nome: p.nome || '', iniciais: p.iniciais || gerarIniciais(p.nome), cor: p.cor_avatar || 'azul', email: (p.email || '').toLowerCase(), ativo: p.ativo !== false, classesIds: vinc.filter(v => String(v.professor_id)===String(p.id)).map(v=>String(v.classe_id)) }));
  } catch (e) {
    console.warn('carregarDadosSupabase:', e);
    toast('Nao foi possivel carregar os dados do sistema. Verifique sua conexao.', 'erro');
  }
}
async function carregarChamadas() {
  if (!window.supabaseClient || !usuarioAtual) return;
  const sb = window.supabaseClient;
  try {
    const { data: chamadas, error: eChamadas } = await sb.from('chamadas').select('id,classe_id,data,total_biblias,total_revistas,total_oferta').order('data', { ascending: false });
    if (eChamadas) { console.error('carregarChamadas: falha em chamadas:', eChamadas.message || eChamadas); toast('Erro ao carregar chamadas.', 'erro'); return; }
    const ids = (chamadas || []).map(c => c.id);
    let presencas = [];
    if (ids.length) {
      const { data: pData, error: ePres } = await sb.from('presencas').select('chamada_id,aluno_id,status').in('chamada_id', ids);
      if (ePres) { console.error('carregarChamadas: falha em presencas:', ePres.message || ePres); toast('Erro ao carregar presenças.', 'erro'); return; }
      presencas = pData || [];
    }
    const porChamada = new Map();
    (presencas || []).forEach(p => {
      const arr = porChamada.get(String(p.chamada_id)) || [];
      arr.push(p);
      porChamada.set(String(p.chamada_id), arr);
    });
    CHAMADAS_REGISTRO = (chamadas || []).map(c => {
      const ms = {};
      (porChamada.get(String(c.id)) || []).forEach(p => { if (p.aluno_id) ms[String(p.aluno_id)] = p.status; });
      const presentes = Object.values(ms).filter(v => v === 'P').length;
      const ausentes = Object.values(ms).filter(v => v === 'A').length;
      return { id: String(c.id), classeId: String(c.classe_id), dataISO: c.data, marcacoes: ms, resumo: { presentes, ausentes, total: Object.keys(ms).length }, totalBiblias: c.total_biblias || 0, totalRevistas: c.total_revistas || 0, totalOferta: Number(c.total_oferta) || 0 };
    });
  } catch (e) {
    console.error('carregarChamadas:', e);
    toast('Erro ao carregar chamadas.', 'erro');
  }
}

function mascararWhatsApp(el) {
  if (!el) return;
  const d = String(el.value || '').replace(/\D/g, '');
  if (d.length === 10) el.value = '(' + d.slice(0,2) + ') ' + d.slice(2,6) + '-' + d.slice(6);
  else if (d.length === 11) el.value = '(' + d.slice(0,2) + ') ' + d.slice(2,7) + '-' + d.slice(7);
  else el.value = d;
}
function formatarMoeda(valor) {
  const n = Number(valor) || 0;
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n); }
  catch (e) { return 'R$ ' + n.toFixed(2).replace('.', ','); }
}
function isoParaBR(iso) {
  if (!iso) return '';
  const partes = String(iso).split('-');
  if (partes.length !== 3) return iso;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}
function renderizarTudo() {
  esconderTelaseBotoesPorPerfil();
  renderizarClasses();
  filtrarERenderizarAlunos();
  renderizarProfessores();
  popularFiltroClassesAlunos();
  popularSelectsChamada();
  if (CLASSE_DETALHE_ATUAL_ID !== null) {
    const classe = getClasse(CLASSE_DETALHE_ATUAL_ID);
    if (classe) {
      const destaque = document.getElementById('classe-destaque');
      const total = contarAlunosClasse(CLASSE_DETALHE_ATUAL_ID);
      const profNome = classe.professorId ? escaparHtml(getProfessorNome(classe.professorId)) : null;
      destaque.innerHTML = `
        <div class="esq">
          <div class="quad-ico ${classe.cor}"><i data-lucide="users-round"></i></div>
          <div>
            <h2>${escaparHtml(classe.nome)}</h2>
            <div class="cat"><i data-lucide="user"></i> ${escaparHtml(classe.categoria)}${profNome ? ` · <i data-lucide="graduation-cap"></i> ${profNome}` : ''}</div>
          </div>
        </div>
        <div class="dir">
          <div class="num">${total}</div>
          <div class="lbl">alunos</div>
        </div>
      `;
      renderizarAlunosClasse(CLASSE_DETALHE_ATUAL_ID);
    }
  }
  if (window.lucide) lucide.createIcons();
}
function contarAlunosClasse(classeId) {
  return DADOS.alunos.filter(a => a.classeId === classeId).length;
}
function getClasse(id) { return DADOS.classes.find(c => c.id === id); }
function getProfessor(id) { return DADOS.professores.find(p => p.id === id); }
function getProfessorNome(id) {
  const p = getProfessor(id);
  return p ? p.nome : 'Sem professor definido';
}
function renderizarClasses() {
  const lista = document.getElementById('lista-classes');
  lista.innerHTML = '';
  if (DADOS.classes.length === 0) {
    lista.innerHTML = `
      <div class="vazio-box">
        <div class="vazio-ico"><i data-lucide="users-round"></i></div>
        <h3>Nenhuma classe cadastrada ainda.</h3>
        <p>Comece criando a primeira classe da EBD.</p>
        <button class="btn-primario" onclick="abrirModalCadastrarClasse()">
          <i data-lucide="plus"></i> Cadastrar primeira classe
        </button>
      </div>`;
    document.getElementById('total-classes').textContent = `Total de classes cadastradas: 0`;
    if (window.lucide) lucide.createIcons({ root: lista });
    return;
  }
  DADOS.classes.forEach(c => {
    const total = contarAlunosClasse(c.id);
    const profNome = c.professorId ? escaparHtml(getProfessorNome(c.professorId)) : 'Sem professor definido';
    const card = document.createElement('div');
    card.className = 'card';
    const esq = document.createElement('div');
    esq.className = 'card-esq';
    esq.innerHTML = `
      <div class="quad-ico ${c.cor}"><i data-lucide="users-round"></i></div>
      <div class="card-info">
        <h3>${escaparHtml(c.nome)}</h3>
        <div class="extra"><i data-lucide="calendar-days"></i> ${escaparHtml(c.categoria)}</div>
        <div class="prof-info"><i data-lucide="graduation-cap"></i> ${profNome}</div>
      </div>
    `;
    esq.addEventListener('click', () => abrirClasseDetalhe(c.id));
    const dir = document.createElement('div');
    dir.className = 'card-dir';
    dir.innerHTML = `
      <div class="tags">
        <span class="tag alunos"><i data-lucide="users"></i> ${total} aluno${total === 1 ? '' : 's'}</span>
        <span class="tag">${escaparHtml(c.categoria)}</span>
      </div>
      <div class="card-botoes">
        <button class="btn-card editar" aria-label="Editar classe ${escaparHtml(c.nome)}" onclick="abrirModalEditarClasse('${c.id}')"><i data-lucide="pencil"></i></button>
        <button class="btn-card excluir" aria-label="Excluir classe ${escaparHtml(c.nome)}" onclick="abrirModalExcluirClasse('${c.id}')"><i data-lucide="trash-2"></i></button>
      </div>
    `;
    card.appendChild(esq);
    card.appendChild(dir);
    lista.appendChild(card);
  });
  document.getElementById('total-classes').textContent = `Total de classes cadastradas: ${DADOS.classes.length}`;
  if (window.lucide) lucide.createIcons({ root: lista });
}
function abrirClasseDetalhe(idClasse) {
  const classe = getClasse(idClasse);
  if (!classe) return;
  CLASSE_DETALHE_ATUAL_ID = idClasse;
  const total = contarAlunosClasse(idClasse);
  const profNome = classe.professorId ? escaparHtml(getProfessorNome(classe.professorId)) : null;
  const destaque = document.getElementById('classe-destaque');
  destaque.innerHTML = `
    <div class="esq">
      <div class="quad-ico ${classe.cor}"><i data-lucide="users-round"></i></div>
      <div>
        <h2>${escaparHtml(classe.nome)}</h2>
        <div class="cat"><i data-lucide="user"></i> ${escaparHtml(classe.categoria)}${profNome ? ` · <i data-lucide="graduation-cap"></i> ${profNome}` : ''}</div>
      </div>
    </div>
    <div class="dir">
      <div class="num">${total}</div>
      <div class="lbl">alunos</div>
    </div>
  `;
  setTimeout(() => {
    const btnVoltarHeader = document.querySelector('#tela-classe-detalhe .btn-voltar-header');
    if (btnVoltarHeader) btnVoltarHeader.onclick = voltarParaClasses;
  }, 10);
  renderizarAlunosClasse(idClasse);
  irPara('tela-classe-detalhe');
}
function voltarParaClasses() {
  const btnVoltarHeader = document.querySelector('#tela-classe-detalhe .btn-voltar-header');
  if (btnVoltarHeader) btnVoltarHeader.onclick = voltarHome;
  irPara('tela-classes');
}
function renderizarAlunosClasse(classeId) {
  const alunos = DADOS.alunos.filter(a => a.classeId === classeId);
  const lista = document.getElementById('lista-alunos-classe');
  const semAlunos = document.getElementById('sem-alunos-classe');
  const totalEl = document.getElementById('total-alunos-classe');
  lista.innerHTML = '';
  alunos.forEach(a => {
    const classe = getClasse(a.classeId);
    const nomeClasse = escaparHtml(classe ? classe.nome : '—');
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-esq">
        <div class="avatar ${a.cor}">${escaparHtml(a.iniciais)}</div>
        <div class="card-info">
          <h3>${escaparHtml(a.nome)}</h3>
          <div class="extra"><i data-lucide="calendar-days"></i> ${escaparHtml(a.dataNasc)}</div>
        </div>
      </div>
      <div class="card-dir">
        <div class="tags"><span class="tag">${nomeClasse}</span></div>
        <div class="card-botoes">
          <button class="btn-card editar" aria-label="Editar aluno ${escaparHtml(a.nome)}" onclick="abrirModalEditarAluno('${a.id}')"><i data-lucide="pencil"></i></button>
          <button class="btn-card excluir" aria-label="Excluir aluno ${escaparHtml(a.nome)}" onclick="abrirModalExcluirAluno('${a.id}')"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`;
    lista.appendChild(card);
  });
  totalEl.textContent = `Total de alunos nesta classe: ${alunos.length}`;
  if (alunos.length === 0) {
    semAlunos.style.display = 'block';
    lista.style.display = 'none';
  } else {
    semAlunos.style.display = 'none';
    lista.style.display = 'flex';
  }
  if (window.lucide) lucide.createIcons({ root: lista });
}
function abrirModalCadastrarAlunoDaClasse() {
  if (CLASSE_DETALHE_ATUAL_ID === null) { abrirModalCadastrarAluno(); return; }
  const opts = DADOS.classes.map(c => `<option value="${c.id}" ${c.id === CLASSE_DETALHE_ATUAL_ID ? 'selected' : ''}>${escaparHtml(c.nome)}</option>`).join('');
  abrirModal(`
    <h3>Cadastrar Aluno</h3>
    <p class="submodal">Preencha os dados do novo aluno. A classe já está selecionada.</p>
    <div class="form-grupo">
      <label for="in-aluno-nome">Nome completo</label>
      <input id="in-aluno-nome" placeholder="Ex: Ana Paula">
      <div class="msg-erro" id="err-aluno-nome"></div>
    </div>
    <div class="form-grupo">
      <label for="in-aluno-nasc">Data de nascimento</label>
      <input id="in-aluno-nasc" type="date">
      <div class="msg-erro" id="err-aluno-nasc"></div>
    </div>
    <div class="form-grupo">
      <label for="in-aluno-classe">Classe</label>
      <select id="in-aluno-classe">${opts}</select>
    </div>
    <div class="modal-botoes">
      <button class="btn-modal cancelar" onclick="fecharModal()"><i data-lucide="x"></i> Cancelar</button>
      <button class="btn-modal salvar" id="btn-salvar-aluno-novo" onclick="salvarAlunoNovo(this)"><i data-lucide="plus"></i> Salvar</button>
    </div>`);
  setTimeout(() => document.getElementById('in-aluno-nome').focus(), 50);
}
function filtrarERenderizarAlunos() {
  FILTROS_ALUNOS.pesq = (document.getElementById('in-pesq-aluno')?.value || '').trim().toLowerCase();
  FILTROS_ALUNOS.classe = document.getElementById('filtro-classe-aluno')?.value || 'todas';
  const lista = document.getElementById('lista-alunos');
  lista.innerHTML = '';
  let alunosFiltrados = DADOS.alunos.filter(a => {
    const okNome = !FILTROS_ALUNOS.pesq || a.nome.toLowerCase().includes(FILTROS_ALUNOS.pesq);
    const okClasse = FILTROS_ALUNOS.classe === 'todas' || String(a.classeId) === String(FILTROS_ALUNOS.classe);
    return okNome && okClasse;
  });
  if (alunosFiltrados.length === 0) {
    if (DADOS.alunos.length === 0) {
      lista.innerHTML = `
        <div class="vazio-box">
          <div class="vazio-ico"><i data-lucide="users"></i></div>
          <h3>Nenhum aluno cadastrado ainda.</h3>
          <p>Comece adicionando o primeiro aluno da EBD.</p>
          <button class="btn-primario" onclick="abrirModalCadastrarAluno()">
            <i data-lucide="plus"></i> Cadastrar primeiro aluno
          </button>
        </div>`;
    } else {
      lista.innerHTML = `
        <div class="vazio-box">
          <div class="vazio-ico"><i data-lucide="search"></i></div>
          <h3>Nenhum aluno encontrado.</h3>
          <p>Tente ajustar os filtros de pesquisa.</p>
        </div>`;
    }
    document.getElementById('btn-ver-todos-alunos-wrap').style.display = 'none';
  } else {
    const limite = VER_TODOS_ALUNOS ? alunosFiltrados.length : Math.min(8, alunosFiltrados.length);
    const mostrar = alunosFiltrados.slice(0, limite);
    mostrar.forEach(a => {
      const classe = getClasse(a.classeId);
      const nomeClasse = escaparHtml(classe ? classe.nome : '—');
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.classeId = a.classeId;
      card.innerHTML = `
        <div class="card-esq">
          <div class="avatar ${a.cor}">${escaparHtml(a.iniciais)}</div>
          <div class="card-info">
            <h3>${escaparHtml(a.nome)}</h3>
            <div class="extra"><i data-lucide="calendar-days"></i> ${escaparHtml(a.dataNasc)}</div>
          </div>
        </div>
        <div class="card-dir">
          <div class="tags"><span class="tag">${nomeClasse}</span></div>
          <div class="card-botoes">
            <button class="btn-card editar" aria-label="Editar aluno ${escaparHtml(a.nome)}" onclick="abrirModalEditarAluno('${a.id}')"><i data-lucide="pencil"></i></button>
            <button class="btn-card excluir" aria-label="Excluir aluno ${escaparHtml(a.nome)}" onclick="abrirModalExcluirAluno('${a.id}')"><i data-lucide="trash-2"></i></button>
          </div>
        </div>`;
      lista.appendChild(card);
    });
    const wrap = document.getElementById('btn-ver-todos-alunos-wrap');
    const btnTexto = document.getElementById('btn-ver-todos-texto');
    if (alunosFiltrados.length > 8 && !VER_TODOS_ALUNOS) {
      wrap.style.display = 'block';
      btnTexto.textContent = `Ver todos (${alunosFiltrados.length})`;
    } else if (alunosFiltrados.length > 8 && VER_TODOS_ALUNOS) {
      wrap.style.display = 'block';
      btnTexto.textContent = `Mostrar menos`;
    } else {
      wrap.style.display = 'none';
    }
  }
  document.getElementById('total-alunos').textContent = `total de alunos matriculados: ${DADOS.alunos.length}`;
  if (window.lucide) lucide.createIcons({ root: lista });
}
function toggleVerTodosAlunos() {
  VER_TODOS_ALUNOS = !VER_TODOS_ALUNOS;
  filtrarERenderizarAlunos();
}
function renderizarProfessores() {
  const lista = document.getElementById('lista-professores');
  lista.innerHTML = '';
  if (DADOS.professores.length === 0) {
    lista.innerHTML = `
      <div class="vazio-box">
        <div class="vazio-ico"><i data-lucide="graduation-cap"></i></div>
        <h3>Nenhum professor cadastrado ainda.</h3>
        <p>Comece adicionando o primeiro professor da EBD.</p>
        <button class="btn-primario" onclick="abrirModalCadastrarProfessor()">
          <i data-lucide="plus"></i> Cadastrar primeiro professor
        </button>
      </div>`;
    document.getElementById('total-professores').textContent = `total de professores cadastrados: 0`;
    if (window.lucide) lucide.createIcons({ root: lista });
    return;
  }
  DADOS.professores.forEach(p => {
    let tagsClasses;
    if (!p.classesIds || p.classesIds.length === 0) {
      tagsClasses = `<span class="tag vazia"><i data-lucide="circle-off"></i> Nenhuma classe vinculada</span>`;
    } else {
      tagsClasses = p.classesIds.map(id => {
        const c = getClasse(id);
        return `<span class="tag">${escaparHtml(c ? c.nome : '—')}</span>`;
      }).join('');
    }
    const tagSenha = ''; /* NÃO exibimos senhas em lugar nenhum. Professor cria sozinho via e-mail. */
    const btnEditar = perfilEhAdmin()
      ? `<button class="btn-card editar" aria-label="Editar professor ${escaparHtml(p.nome)}" onclick="abrirModalEditarProfessor('${p.id}')"><i data-lucide="pencil"></i></button>` : '';
    const btnExcluir = perfilEhAdmin()
      ? `<button class="btn-card excluir" aria-label="Excluir professor ${escaparHtml(p.nome)}" onclick="abrirModalExcluirProfessor('${p.id}')"><i data-lucide="trash-2"></i></button>` : '';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-esq">
        <div class="avatar ${p.cor}">${escaparHtml(p.iniciais)}</div>
        <div class="card-info">
          <h3>${escaparHtml(p.nome)}</h3>
          <div class="extra"><i data-lucide="mail"></i> ${escaparHtml(p.email)}</div>
        </div>
      </div>
      <div class="card-dir">
        <div class="tags">${tagSenha}${tagsClasses}</div>
        <div class="card-botoes">${btnEditar}${btnExcluir}</div>
      </div>`;
    lista.appendChild(card);
  });
  document.getElementById('total-professores').textContent = `total de professores cadastrados: ${DADOS.professores.length}`;
  if (window.lucide) lucide.createIcons({ root: lista });
}
function popularFiltroClassesAlunos() {
  const sel = document.getElementById('filtro-classe-aluno');
  if (!sel) return;
  const valAtual = sel.value;
  sel.innerHTML = `<option value="todas">Todas as classes</option>` +
    DADOS.classes.map(c => `<option value="${c.id}">${escaparHtml(c.nome)}</option>`).join('');
  sel.value = valAtual || 'todas';
}
function hojeISOLocal() {
  const d = new Date();
  const a = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${a}-${m}-${dia}`;
}
function chamadaClassesPermitidasIds() {
  if (!usuarioAtual) return [];
  if (perfilEhAdmin()) return null;
  if (usuarioAtual.professorId) {
    const p = getProfessor(usuarioAtual.professorId);
    return p && Array.isArray(p.classesIds) ? p.classesIds.map(String) : [];
  }
  return null;
}
function usuarioPodeGerenciarClasse(classeId) {
  const ids = chamadaClassesPermitidasIds();
  return ids === null || ids.map(String).includes(String(classeId));
}
function chamadaClassesDisponiveis() {
  const ids = chamadaClassesPermitidasIds();
  return ids === null ? DADOS.classes.slice() : DADOS.classes.filter(c => ids.includes(String(c.id)));
}
function resetarEstadoChamada() {
  CHAMADA_ESTADO.classeId = null;
  CHAMADA_ESTADO.dataISO = null;
  CHAMADA_ESTADO.marcacoes = {};
  CHAMADA_ESTADO.editandoId = null;
  resetarContadoresDistribuicao();
}
function definirContadoresDistribuicao(biblias, revistas) {
  totalBiblias = Math.max(0, Number(biblias) || 0);
  totalRevistas = Math.max(0, Number(revistas) || 0);
  const elB = document.querySelector('#card-biblias .numero-distribuicao');
  const elR = document.querySelector('#card-revistas .numero-distribuicao');
  if (elB) elB.textContent = String(totalBiblias);
  if (elR) elR.textContent = String(totalRevistas);
}
function chamadaAtualizarModoEdicao() {
  const banner = document.getElementById('chamada-banner-edicao');
  const selClasse = document.getElementById('sel-classe-chamada');
  const selData = document.getElementById('sel-data-chamada');
  const btnTxt = document.getElementById('btn-concluir-chamada-txt');
  const emEdicao = !!CHAMADA_ESTADO.editandoId;
  if (banner) {
    if (emEdicao) {
      const classe = getClasse(CHAMADA_ESTADO.classeId);
      const nomeClasse = escaparHtml(classe ? classe.nome : '—');
      const dataBR = formatarDataBR(CHAMADA_ESTADO.dataISO);
      banner.style.display = 'flex';
      const txtEl = banner.querySelector('[data-banner-texto]');
      if (txtEl) txtEl.textContent = `Editando chamada: ${classe ? classe.nome : '—'} · ${dataBR}`;
    } else {
      banner.style.display = 'none';
    }
  }
  if (selClasse) selClasse.disabled = emEdicao;
  if (selData) selData.disabled = emEdicao;
  if (btnTxt) btnTxt.textContent = emEdicao ? 'Salvar alterações' : 'Concluir chamada';
}
function abrirEdicaoChamada(registroId) {
  const r = CHAMADAS_REGISTRO.find(x => x.id === registroId);
  if (!r) { toast('Chamada não encontrada.', 'erro'); return; }
  const classe = getClasse(r.classeId);
  if (!classe) { toast('Classe não encontrada.', 'erro'); return; }
  if (!usuarioPodeGerenciarClasse(r.classeId)) {
    toast('Você não tem permissão para esta classe.', 'erro');
    return;
  }
  resetarEstadoChamada();
  CHAMADA_ESTADO.classeId = String(r.classeId);
  CHAMADA_ESTADO.dataISO = r.dataISO;
  CHAMADA_ESTADO.editandoId = r.id;
  const alunosAtuais = DADOS.alunos.filter(a => String(a.classeId) === String(r.classeId));
  alunosAtuais.forEach(a => {
    const v = r.marcacoes && r.marcacoes[a.id];
    CHAMADA_ESTADO.marcacoes[a.id] = (v === 'P' || v === 'A') ? v : null;
  });
  definirContadoresDistribuicao(r.totalBiblias, r.totalRevistas);
  const elO = document.getElementById('total-oferta');
  if (elO) elO.value = (Number(r.totalOferta) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  irPara('tela-chamada');
}
function cancelarEdicaoChamada() {
  resetarEstadoChamada();
  popularSelectsChamada();
  chamadaAtualizarLista();
  chamadaAtualizarModoEdicao();
  irPara('tela-historico-chamadas');
}
function popularSelectsChamada() {
  const selClasse = document.getElementById('sel-classe-chamada');
  const selData = document.getElementById('sel-data-chamada');
  if (!selClasse || !selData) return;
  const classesDisp = chamadaClassesDisponiveis();
  const emEdicao = !!CHAMADA_ESTADO.editandoId;
  let classeAtual = CHAMADA_ESTADO.classeId;
  if (classeAtual && !emEdicao && !usuarioPodeGerenciarClasse(classeAtual)) {
    resetarEstadoChamada();
    classeAtual = null;
  }
  const placeholderClasse = classesDisp.length === 0
    ? `<option value="">Nenhuma classe vinculada ao seu perfil</option>`
    : `<option value="">-- Escolha uma classe --</option>`;
  selClasse.innerHTML = placeholderClasse +
    classesDisp.map(c => `<option value="${c.id}">${escaparHtml(c.nome)}</option>`).join('');
  if (classeAtual && classesDisp.some(c => String(c.id) === String(classeAtual))) {
    selClasse.value = String(classeAtual);
  } else if (!emEdicao) {
    selClasse.value = '';
  }
  let datas = [
    { iso: '2025-09-28', label: '28/09/2025' },
    { iso: '2025-09-21', label: '21/09/2025' },
    { iso: '2025-09-14', label: '14/09/2025' },
    { iso: '2025-09-07', label: '07/09/2025' },
    { iso: '2025-08-31', label: '31/08/2025' },
    { iso: '2025-08-24', label: '24/08/2025' }
  ];
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  if (!datas.some(d => d.iso === hoje)) {
    datas.unshift({ iso: hoje, label: formatarDataBR(hoje) });
  }
  if (emEdicao && CHAMADA_ESTADO.dataISO && !datas.some(d => d.iso === CHAMADA_ESTADO.dataISO)) {
    datas.push({ iso: CHAMADA_ESTADO.dataISO, label: formatarDataBR(CHAMADA_ESTADO.dataISO) });
  }
  const dataAtual = CHAMADA_ESTADO.dataISO;
  selData.innerHTML = `<option value="">-- Escolha uma data --</option>` +
    datas.map(d => `<option value="${d.iso}">${d.label}</option>`).join('');
  if (dataAtual && datas.some(d => d.iso === dataAtual)) {
    selData.value = dataAtual;
  } else if (!emEdicao) {
    selData.value = '';
  }
  chamadaAtualizarModoEdicao();
}
function formatarDataBR(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
async function lerErroFuncao(err) {
  try {
    if (!err) return '';
    if (typeof err === 'string') return err;
    if (err.message) return String(err.message);
    if (err.context && typeof err.context.json === 'function') {
      const j = await err.context.json();
      return (j && (j.mensagem || j.message || j.error)) ? String(j.mensagem || j.message || j.error) : '';
    }
    if (err.context && typeof err.context.text === 'function') {
      return String(await err.context.text() || '');
    }
    return '';
  } catch (e) { return ''; }
}

function escaparHtml(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function gerarIniciais(nome) {
  if (!nome) return '??';
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
function toast(msg, tipo = 'sucesso') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const mapIco = { sucesso: 'check', erro: 'alert-circle', info: 'info' };
  const ico = mapIco[tipo] || 'info';
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<i data-lucide="${ico}"></i><span>${msg}</span>`;
  container.appendChild(el);
  if (window.lucide) lucide.createIcons({ root: el });
  setTimeout(() => {
    el.style.transition = 'opacity 260ms ease, transform 260ms ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(() => el.remove(), 280);
  }, 3000);
}
function abrirModal(html) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-box');
  if (!overlay || !content) return;
  content.innerHTML = html;
  overlay.classList.add('aberto');
  if (window.lucide) lucide.createIcons({ root: content });
}
function fecharModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('aberto');
  setTimeout(() => {
    const content = document.getElementById('modal-box');
    if (content) content.innerHTML = '';
  }, 220);
  if (window.lucide) lucide.createIcons();
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('modal-overlay');
    if (overlay && overlay.classList.contains('aberto')) fecharModal();
  }
});
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.addEventListener('click', e => {
    if (e.target === overlay) fecharModal();
  });
  const cardBiblias = document.getElementById('card-biblias');
  if (cardBiblias) cardBiblias.addEventListener('click', () => abrirModalNumeros('biblias'));
  const cardRevistas = document.getElementById('card-revistas');
  if (cardRevistas) cardRevistas.addEventListener('click', () => abrirModalNumeros('revistas'));
  const modalNumeros = document.getElementById('modal-numeros');
  if (modalNumeros) modalNumeros.addEventListener('click', e => {
    if (e.target.id === 'modal-numeros') fecharModalNumeros();
  });
});
function abrirModalCadastrarClasse() {
  const categorias = ((DADOS.categoriasClasse && DADOS.categoriasClasse.length) ? DADOS.categoriasClasse : ['Crianças','Adolescentes','Jovens','Adultos']);
  abrirModal(`
    <div class="modal-header">
      <h2>Cadastrar classe</h2>
      <button class="btn-fechar" aria-label="Fechar modal" onclick="fecharModal()"><i data-lucide="x"></i></button>
    </div>
    <div class="msg-erro" id="modal-classe-erro"></div>
    <div class="campo">
      <label for="in-classe-nome">Nome da classe</label>
      <input type="text" id="in-classe-nome" placeholder="Ex: Turma Abraão" autocomplete="off">
    </div>
    <div class="campo">
      <label for="in-classe-categoria">Categoria</label>
      <select id="in-classe-categoria">
        ${categorias.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
    </div>
    <div class="campo">
      <label for="in-classe-professor">Professor responsável</label>
      <select id="in-classe-professor">
        <option value="">Sem professor</option>
        ${DADOS.professores.map(p => `<option value="${p.id}">${escaparHtml(p.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="modal-botoes">
      <button class="btn-secundario" onclick="fecharModal()">Cancelar</button>
      <button class="btn-primario" onclick="salvarClasseNova(this)">
        <i data-lucide="plus"></i> Cadastrar
      </button>
    </div>
  `);
  setTimeout(() => document.getElementById('in-classe-nome')?.focus(), 80);
}
function salvarClasseNova(btnEl) {
  comLoadingBtn(btnEl, async () => {
    const nome = document.getElementById('in-classe-nome').value.trim();
    const categoria = document.getElementById('in-classe-categoria').value;
    const profVal = document.getElementById('in-classe-professor').value;
    const erro = document.getElementById('modal-classe-erro');
    if (!nome) { erro.textContent = 'Informe o nome da classe.'; throw new Error('val'); }
    const sb = window.supabaseClient; if (!sb) { erro.textContent = 'Sistema nao inicializado.'; throw new Error('val'); }
    const cor = CORES_ICONE_CLASSE[DADOS.classes.length % CORES_ICONE_CLASSE.length];
    const { data, error } = await sb.from('classes').insert({ nome, categoria, cor_icone: cor }).select().single();
    if (error || !data) { erro.textContent = 'Erro ao cadastrar classe: ' + (error && error.message || ''); throw new Error('val'); }
    const novaId = String(data.id);
    if (profVal) {
      const p = getProfessor(profVal);
      if (p) {
        await sb.from('professor_classes').insert({ professor_id: p.id, classe_id: novaId });
        if (!p.classesIds.includes(novaId)) p.classesIds.push(novaId);
      }
    }
    await carregarDadosSupabase();
    renderizarTudo();
    toast('Classe cadastrada com sucesso!', 'sucesso');
    fecharModal();
  }, { txtLoading: 'Salvando...', txtOk: 'Cadastrar' });
}
function abrirModalEditarClasse(id) {
  const c = getClasse(id);
  if (!c) return;
  const categorias = ((DADOS.categoriasClasse && DADOS.categoriasClasse.length) ? DADOS.categoriasClasse : ['Crianças','Adolescentes','Jovens','Adultos']);
  abrirModal(`
    <div class="modal-header">
      <h2>Editar classe</h2>
      <button class="btn-fechar" aria-label="Fechar modal" onclick="fecharModal()"><i data-lucide="x"></i></button>
    </div>
    <div class="msg-erro" id="modal-classe-erro"></div>
    <div class="campo">
      <label for="in-classe-nome">Nome da classe</label>
      <input type="text" id="in-classe-nome" value="${escaparHtml(c.nome)}" autocomplete="off">
    </div>
    <div class="campo">
      <label for="in-classe-categoria">Categoria</label>
      <select id="in-classe-categoria">
        ${categorias.map(cat => `<option value="${escaparHtml(cat)}" ${cat === c.categoria ? 'selected' : ''}>${escaparHtml(cat)}</option>`).join('')}
      </select>
    </div>
    <div class="campo">
      <label for="in-classe-professor">Professor responsável</label>
      <select id="in-classe-professor">
        <option value="">Sem professor</option>
        ${DADOS.professores.map(p => `<option value="${p.id}" ${c.professorId === p.id ? 'selected' : ''}>${escaparHtml(p.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="modal-botoes">
      <button class="btn-secundario" onclick="fecharModal()">Cancelar</button>
      <button class="btn-primario" onclick="salvarClasseEdicao(this, '${id}')">
        <i data-lucide="pencil"></i> Salvar alterações
      </button>
    </div>
  `);
  setTimeout(() => { const el = document.getElementById('in-aluno-whatsapp'); if (el) el.value = (DADOS.alunos.find(x => x.id === id) || {}).whatsapp || ''; }, 80);
}
function salvarClasseEdicao(btnEl, id) {
  comLoadingBtn(btnEl, async () => {
    const c = getClasse(id);
    if (!c) return;
    const nome = document.getElementById('in-classe-nome').value.trim();
    const categoria = document.getElementById('in-classe-categoria').value;
    const profVal = document.getElementById('in-classe-professor').value;
    const erro = document.getElementById('modal-classe-erro');
    if (!nome) { erro.textContent = 'Informe o nome da classe.'; throw new Error('val'); }
    const sb = window.supabaseClient; if (!sb) { erro.textContent = 'Sistema nao inicializado.'; throw new Error('val'); }
    const { error } = await sb.from('classes').update({ nome, categoria }).eq('id', id);
    if (error) { erro.textContent = 'Erro ao salvar classe: ' + error.message; throw new Error('val'); }
    try { await sb.from('professor_classes').delete().eq('classe_id', id); } catch (e) {}
    if (profVal) {
      await sb.from('professor_classes').insert({ professor_id: profVal, classe_id: id });
      const p = getProfessor(profVal);
      if (p && !p.classesIds.includes(String(id))) p.classesIds.push(String(id));
    }
    await carregarDadosSupabase();
    renderizarTudo();
    toast('Classe atualizada com sucesso!', 'sucesso');
    fecharModal();
  }, { txtLoading: 'Salvando...', txtOk: 'Salvar alteracoes' });
}
function abrirModalExcluirClasse(id) {
  const c = getClasse(id);
  if (!c) return;
  const qtdAlunos = DADOS.alunos.filter(a => a.classeId === id).length;
  abrirModal(`
    <div class="modal-header">
      <h2>Excluir classe?</h2>
      <button class="btn-fechar" aria-label="Fechar modal" onclick="fecharModal()"><i data-lucide="x"></i></button>
    </div>
    <p class="modal-alerta"><strong>${escaparHtml(c.nome)}</strong> — ${escaparHtml(c.categoria)}.<br>${qtdAlunos > 0 ? `Atenção: ${qtdAlunos} aluno(s) estão matriculados nesta classe.` : 'Nenhum aluno matriculado nesta classe.'}</p>
    <div class="modal-botoes">
      <button class="btn-secundario" onclick="fecharModal()">Cancelar</button>
      <button class="btn-perigo" onclick="confirmarExcluirClasse(this, '${id}')">
        <i data-lucide="trash-2"></i> Excluir
      </button>
    </div>
  `);
}
function confirmarExcluirClasse(btnEl, id) {
  comLoadingBtn(btnEl, async () => {
    const sb = window.supabaseClient; if (!sb) { toast('Sistema nao inicializado.', 'erro'); throw new Error('val'); }
    const { count: qtdAlunos } = await sb.from('alunos').select('id', { count: 'exact', head: true }).eq('classe_id', id);
    const { count: qtdChamadas } = await sb.from('chamadas').select('id', { count: 'exact', head: true }).eq('classe_id', id);
    if ((qtdAlunos || 0) > 0 || (qtdChamadas || 0) > 0) {
      toast('Esta classe possui alunos ou chamadas registradas e nao pode ser excluida. Vou desativa-la.', 'erro');
      const erro = await sb.from('classes').update({ ativo: false }).eq('id', id);
      if (erro.error) throw new Error(erro.error.message);
      await carregarDadosSupabase();
      renderizarTudo();
      fecharModal();
      return;
    }
    const { error } = await sb.from('classes').delete().eq('id', id);
    if (error) { toast('Erro ao excluir classe: ' + error.message, 'erro'); throw new Error('val'); }
    if (CLASSE_DETALHE_ATUAL_ID === id) CLASSE_DETALHE_ATUAL_ID = null;
    await carregarDadosSupabase();
    renderizarTudo();
    toast('Classe excluida com sucesso.', 'sucesso');
    fecharModal();
  }, { txtLoading: 'Excluindo...', txtOk: 'Excluir' });
}
function abrirModalCadastrarAluno(classePreId = null) {
  const classesOpts = `<option value="">Selecione uma classe</option>` +
    DADOS.classes.map(c => `<option value="${c.id}" ${classePreId === c.id ? 'selected' : ''}>${escaparHtml(c.nome)}</option>`).join('');
  abrirModal(`
    <div class="modal-header">
      <h2>Cadastrar aluno</h2>
      <button class="btn-fechar" aria-label="Fechar modal" onclick="fecharModal()"><i data-lucide="x"></i></button>
    </div>
    <div class="msg-erro" id="modal-aluno-erro"></div>
    <div class="campo">
      <label for="in-aluno-nome">Nome completo</label>
      <input type="text" id="in-aluno-nome" placeholder="Ex: João Silva" autocomplete="off">
    </div>
    <div class="campo">
      <label for="in-aluno-nasc">Data de nascimento</label>
      <input type="date" id="in-aluno-nasc">
    </div>
    <div class="campo">
      <label for="in-aluno-whatsapp">WhatsApp do aluno ou do responsável</label>
      <input type="tel" id="in-aluno-whatsapp" inputmode="tel" placeholder="(86) 99999-9999" autocomplete="off" oninput="mascararWhatsApp(this)">
    </div>
    <div class="campo">
      <label for="in-aluno-classe">Classe</label>
      <select id="in-aluno-classe">${classesOpts}</select>
    </div>
    <div class="modal-botoes">
      <button class="btn-secundario" onclick="fecharModal()">Cancelar</button>
      <button class="btn-primario" onclick="salvarAlunoNovo(this)">
        <i data-lucide="plus"></i> Cadastrar
      </button>
    </div>
  `);
  setTimeout(() => document.getElementById('in-aluno-nome')?.focus(), 80);
}
function salvarAlunoNovo(btnEl) {
  comLoadingBtn(btnEl, async () => {
    const nome = document.getElementById('in-aluno-nome').value.trim();
    const nasc = document.getElementById('in-aluno-nasc').value;
    const classeVal = document.getElementById('in-aluno-classe').value;
    const erro = document.getElementById('modal-aluno-erro');
    if (!nome) { erro.textContent = 'Informe o nome do aluno.'; throw new Error('val'); }
    if (!classeVal) { erro.textContent = 'Selecione uma classe.'; throw new Error('val'); }
    const sb = window.supabaseClient; if (!sb) { erro.textContent = 'Sistema nao inicializado.'; throw new Error('val'); }
    const waRaw = (document.getElementById('in-aluno-whatsapp') ? document.getElementById('in-aluno-whatsapp').value : '').trim();
    const waDigits = waRaw.replace(/\D/g, '');
    if (waDigits && !(waDigits.length === 10 || waDigits.length === 11 || waDigits.length === 12 || waDigits.length === 13)) {
      erro.textContent = 'WhatsApp inválido. Use 10 ou 11 dígitos (com DDD).';
      throw new Error('val');
    }
    if (waDigits && (waDigits.length === 12 || waDigits.length === 13) && !waDigits.startsWith('55')) {
      erro.textContent = 'WhatsApp inválido. Use 10 ou 11 dígitos (com DDD).';
      throw new Error('val');
    }
    const waValue = waDigits === '' ? null : waDigits;
    const { data, error } = await sb.from('alunos').insert({ nome, classe_id: classeVal, data_nascimento: nasc || null, whatsapp: waValue }).select().single();
    if (error || !data) { erro.textContent = 'Erro ao cadastrar aluno: ' + (error && error.message || ''); throw new Error('val'); }
    await carregarDadosSupabase();
    renderizarTudo();
    toast('Aluno cadastrado com sucesso!', 'sucesso');
    fecharModal();
  }, { txtLoading: 'Cadastrando...', txtOk: 'Cadastrar' });
}
function abrirModalEditarAluno(id) {
  const a = DADOS.alunos.find(x => x.id === id);
  if (!a) return;
  const classesOpts = `<option value="">Sem classe</option>` +
    DADOS.classes.map(c => `<option value="${c.id}" ${a.classeId === c.id ? 'selected' : ''}>${escaparHtml(c.nome)}</option>`).join('');
  const nascISO = a.dataNasc && a.dataNasc.includes('/') ? a.dataNasc.split('/').reverse().join('-') : '';
  abrirModal(`
    <div class="modal-header">
      <h2>Editar aluno</h2>
      <button class="btn-fechar" aria-label="Fechar modal" onclick="fecharModal()"><i data-lucide="x"></i></button>
    </div>
    <div class="msg-erro" id="modal-aluno-erro"></div>
    <div class="campo">
      <label for="in-aluno-nome">Nome completo</label>
      <input type="text" id="in-aluno-nome" value="${escaparHtml(a.nome)}" autocomplete="off">
    </div>
    <div class="campo">
      <label for="in-aluno-nasc">Data de nascimento</label>
      <input type="date" id="in-aluno-nasc" value="${nascISO}">
    </div>
    <div class="campo">
      <label for="in-aluno-whatsapp">WhatsApp do aluno ou do responsável</label>
      <input type="tel" id="in-aluno-whatsapp" inputmode="tel" placeholder="(86) 99999-9999" autocomplete="off" oninput="mascararWhatsApp(this)">
    </div>
    <div class="campo">
      <label for="in-aluno-classe">Classe</label>
      <select id="in-aluno-classe">${classesOpts}</select>
    </div>
    <div class="modal-botoes">
      <button class="btn-secundario" onclick="fecharModal()">Cancelar</button>
      <button class="btn-primario" onclick="salvarAlunoEdicao(this, '${id}')">
        <i data-lucide="pencil"></i> Salvar alterações
      </button>
    </div>
  `);
}
function salvarAlunoEdicao(btnEl, id) {
  comLoadingBtn(btnEl, async () => {
    const a = DADOS.alunos.find(x => x.id === String(id));
    if (!a) return;
    const nome = document.getElementById('in-aluno-nome').value.trim();
    const nasc = document.getElementById('in-aluno-nasc').value;
    const classeVal = document.getElementById('in-aluno-classe').value;
    const erro = document.getElementById('modal-aluno-erro');
    if (!nome) { erro.textContent = 'Informe o nome do aluno.'; throw new Error('val'); }
    if (!classeVal) { erro.textContent = 'Selecione uma classe.'; throw new Error('val'); }
    const sb = window.supabaseClient; if (!sb) { erro.textContent = 'Sistema nao inicializado.'; throw new Error('val'); }
    const waRaw = (document.getElementById('in-aluno-whatsapp') ? document.getElementById('in-aluno-whatsapp').value : '').trim();
    const waDigits = waRaw.replace(/\D/g, '');
    if (waDigits && !(waDigits.length === 10 || waDigits.length === 11 || waDigits.length === 12 || waDigits.length === 13)) {
      erro.textContent = 'WhatsApp inválido. Use 10 ou 11 dígitos (com DDD).';
      throw new Error('val');
    }
    if (waDigits && (waDigits.length === 12 || waDigits.length === 13) && !waDigits.startsWith('55')) {
      erro.textContent = 'WhatsApp inválido. Use 10 ou 11 dígitos (com DDD).';
      throw new Error('val');
    }
    const waValue = waDigits === '' ? null : waDigits;
    const { error } = await sb.from('alunos').update({ nome, iniciais: gerarIniciais(nome), classe_id: classeVal, data_nascimento: nasc || null, whatsapp: waValue }).eq('id', id);
    if (error) { erro.textContent = 'Erro ao salvar aluno: ' + error.message; throw new Error('val'); }
    await carregarDadosSupabase();
    renderizarTudo();
    toast('Aluno atualizado com sucesso!', 'sucesso');
    fecharModal();
  }, { txtLoading: 'Salvando...', txtOk: 'Salvar alteracoes' });
}
function abrirModalExcluirAluno(id) {
  const a = DADOS.alunos.find(x => x.id === id);
  if (!a) return;
  const classe = getClasse(a.classeId);
  abrirModal(`
    <div class="modal-header">
      <h2>Excluir aluno?</h2>
      <button class="btn-fechar" aria-label="Fechar modal" onclick="fecharModal()"><i data-lucide="x"></i></button>
    </div>
    <p class="modal-alerta"><strong>${escaparHtml(a.nome)}</strong>${classe ? ` — ${escaparHtml(classe.nome)}` : ''}.<br>Esta ação não pode ser desfeita.</p>
    <div class="modal-botoes">
      <button class="btn-secundario" onclick="fecharModal()">Cancelar</button>
      <button class="btn-perigo" onclick="confirmarExcluirAluno(this, '${id}')">
        <i data-lucide="trash-2"></i> Excluir
      </button>
    </div>
  `);
}
function confirmarExcluirAluno(btnEl, id) {
  comLoadingBtn(btnEl, async () => {
    const sb = window.supabaseClient; if (!sb) { toast('Sistema nao inicializado.', 'erro'); throw new Error('val'); }
    const { error } = await sb.from('alunos').update({ ativo: false }).eq('id', id);
    if (error) { toast('Erro ao desativar aluno: ' + error.message, 'erro'); throw new Error('val'); }
    if (CLASSE_DETALHE_ATUAL_ID) { /* mantem tela; dados recarregam */ }
    await carregarDadosSupabase();
    renderizarTudo();
    toast('Aluno desativado com sucesso.', 'sucesso');
    fecharModal();
  }, { txtLoading: 'Desativando...', txtOk: 'Desativar' });
}
function obterClassesSelecionadasChips() {
  return Array.from(
    document.querySelectorAll('#lista-chips-classes-prof input.chk-classe:checked')
  ).map(i => String(i.value || '').trim()).filter(v => v !== '');
}
function configurarChipsClassesProf() {
  const chips = document.querySelectorAll('#lista-chips-classes-prof .chip-classe');
  chips.forEach(chip => {
    const chk = chip.querySelector('input.chk-classe');
    if (!chk) return;
    const sincronizar = () => { chip.classList.toggle('ativo', chk.checked); };
    sincronizar();
    chk.addEventListener('change', sincronizar);
    chip.addEventListener('click', (ev) => {
      if (ev.target === chk) return;
      ev.preventDefault();
      chk.checked = !chk.checked;
      sincronizar();
    });
  });
}
function alternarVisibilidadeSenha(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const mostrar = el.type === 'password';
  el.type = mostrar ? 'text' : 'password';
  if (btn) {
    const icone = btn.querySelector('i[data-lucide]');
    if (icone) icone.setAttribute('data-lucide', mostrar ? 'eye-off' : 'eye');
    if (window.lucide) lucide.createIcons({ root: btn });
  }
}
function abrirModalCadastrarProfessor() {
  if (!perfilEhAdmin()) { toast('Apenas o administrador pode cadastrar professores.', 'erro'); return; }
  const classesChips = DADOS.classes.map(c => {
    const corClasse = c.cor && c.cor.startsWith('icone-') ? c.cor.replace('icone-','') : 'azul';
    const corMap = { azul: '#3b82f6', verde: '#10b981', laranja: '#f59e0b' };
    const bg = corMap[corClasse] || '#3b82f6';
    const letraIc = (c.nome || '?').trim().charAt(0).toUpperCase();
    return `
      <label class="chip-classe" data-chip-classe="${c.id}">
        <input type="checkbox" class="chk-classe" value="${c.id}">
        <span class="chip-icone" style="background:${bg}">${letraIc}</span>
        <span class="chip-info">
          <span class="chip-nome">${escaparHtml(c.nome)}</span>
          <span class="chip-cat">${escaparHtml(c.categoria || 'Classe')}</span>
        </span>
      </label>`;
  }).join('');
  const chipsHtml = classesChips || `<div class="chips-aviso"><i data-lucide="info"></i> Nenhuma classe cadastrada ainda. Cadastre as classes primeiro.</div>`;
  abrirModal(`
    <div class="modal-header">
      <h2>Cadastrar professor</h2>
      <button class="btn-fechar" aria-label="Fechar modal" onclick="fecharModal()"><i data-lucide="x"></i></button>
    </div>
    <div class="msg-erro" id="modal-prof-erro"></div>
    <div class="campo">
      <label for="in-prof-nome">Nome completo</label>
      <input type="text" id="in-prof-nome" placeholder="Ex: Maria Oliveira" autocomplete="off">
    </div>
    <div class="campo">
      <label for="in-prof-email">E-mail (login do professor)</label>
      <input type="email" id="in-prof-email" placeholder="ex: maria.oliveira@igreja.com" autocomplete="email">
    </div>
    <div class="campo">
      <label for="in-prof-senha">Senha de acesso</label>
      <div style="display:flex;gap:8px;align-items:stretch">
        <input type="password" id="in-prof-senha" placeholder="Mínimo 8 caracteres" autocomplete="new-password" style="flex:1">
        <button type="button" class="btn-secundario" style="padding:0 12px;min-height:44px" onclick="alternarVisibilidadeSenha('in-prof-senha', this)" aria-label="Mostrar senha"><i data-lucide="eye"></i></button>
      </div>
      <small class="hint">Defina uma senha para o professor fazer login. Ele poderá trocar depois.</small>
    </div>
    <div class="campo">
      <label for="in-prof-senha2">Confirmar senha</label>
      <div style="display:flex;gap:8px;align-items:stretch">
        <input type="password" id="in-prof-senha2" placeholder="Repita a senha" autocomplete="new-password" style="flex:1">
        <button type="button" class="btn-secundario" style="padding:0 12px;min-height:44px" onclick="alternarVisibilidadeSenha('in-prof-senha2', this)" aria-label="Mostrar senha"><i data-lucide="eye"></i></button>
      </div>
    </div>
    <div class="campo">
      <label>Classes que leciona (opcional)</label>
      <div class="chips-lista" id="lista-chips-classes-prof">${chipsHtml}</div>
      <small class="hint">Toque nas classes para selecionar. Toque novamente para desmarcar.</small>
    </div>
    <div class="modal-botoes">
      <button class="btn-secundario" onclick="fecharModal()">Cancelar</button>
      <button class="btn-primario" onclick="salvarProfessorNovo(this)">
        <i data-lucide="plus"></i> Cadastrar
      </button>
    </div>
  `);
  setTimeout(() => {
    document.getElementById('in-prof-nome')?.focus();
    configurarChipsClassesProf();
    if (window.lucide) lucide.createIcons();
  }, 80);
}
function salvarProfessorNovo(btnEl) {
  if (!perfilEhAdmin()) { toast('Apenas o administrador pode cadastrar professores.', 'erro'); return; }
  comLoadingBtn(btnEl, async () => {
    const nome = document.getElementById('in-prof-nome').value.trim();
    const email = (document.getElementById('in-prof-email').value || '').trim().toLowerCase();
    const classesSel = obterClassesSelecionadasChips();
    const erro = document.getElementById('modal-prof-erro');
    if (!nome) { erro.textContent = 'Informe o nome do professor.'; throw new Error('val'); }
    if (!email) { erro.textContent = 'Informe o e-mail do professor.'; throw new Error('val'); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { erro.textContent = 'Informe um e-mail valido.'; throw new Error('val'); }
    if (DADOS.professores.some(p => (p.email || '').toLowerCase() === email)) { erro.textContent = 'Ja existe um professor com este e-mail.'; throw new Error('val'); }
    const senha1 = document.getElementById('in-prof-senha').value;
    const senha2 = document.getElementById('in-prof-senha2').value;
    if (!senha1 || senha1.length < 8) { erro.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; throw new Error('val'); }
    if (senha1 !== senha2) { erro.textContent = 'As senhas nao coincidem.'; throw new Error('val'); }
    const sb = window.supabaseClient;
    if (!sb) { erro.textContent = 'Sistema nao inicializado (supabase/config.js).'; throw new Error('val'); }
    let resposta;
    try { resposta = await sb.functions.invoke('swift-processor', { body: { nome, email, senha: senha1, classesIds: classesSel } }); }
    catch (e1) { const msg1 = (e1 && (e1.error || e1.message)) || 'Erro de rede ao chamar a funcao.'; erro.textContent = msg1; throw new Error(msg1); }
    const data = resposta && resposta.data;
    const errFn = resposta && resposta.error;
    let mensagem = '';
    if (data && typeof data === 'object') mensagem = data.mensagem || '';
    if (!mensagem && errFn) { const m = await lerErroFuncao(errFn); if (m) mensagem = m; }
    if (errFn || (data && !data.sucesso)) {
      const msgFinal = mensagem || 'Erro ao cadastrar professor.';
      erro.textContent = msgFinal;
      ['in-prof-senha','in-prof-senha2'].forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
      throw new Error(msgFinal);
    }
    const idDb = data && data.professor && data.professor.id;
    if (!idDb) { erro.textContent = 'Professor criado, mas nao veio o identificador.'; throw new Error('val'); }
    ['in-prof-senha','in-prof-senha2'].forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
    await carregarDadosSupabase();
    renderizarTudo();
    toast(mensagem || 'Professor cadastrado com sucesso!', 'sucesso', 8000);
    fecharModal();
  }, { txtLoading: 'Cadastrando...', txtOk: 'Cadastrar' });
}
function abrirModalEditarProfessor(id) {
  if (!perfilEhAdmin()) { toast('Apenas o administrador pode editar professores.', 'erro'); return; }
  const p = getProfessor(id);
  if (!p) return;
  const selIds = new Set(p.classesIds || []);
  const classesChips = DADOS.classes.map(c => {
    const corClasse = c.cor && c.cor.startsWith('icone-') ? c.cor.replace('icone-','') : 'azul';
    const corMap = { azul: '#3b82f6', verde: '#10b981', laranja: '#f59e0b' };
    const bg = corMap[corClasse] || '#3b82f6';
    const letraIc = (c.nome || '?').trim().charAt(0).toUpperCase();
    const checked = selIds.has(c.id) ? 'checked' : '';
    const ativo = selIds.has(c.id) ? ' ativo' : '';
    return `
      <label class="chip-classe${ativo}" data-chip-classe="${c.id}">
        <input type="checkbox" class="chk-classe" value="${c.id}" ${checked}>
        <span class="chip-icone" style="background:${bg}">${letraIc}</span>
        <span class="chip-info">
          <span class="chip-nome">${escaparHtml(c.nome)}</span>
          <span class="chip-cat">${escaparHtml(c.categoria || 'Classe')}</span>
        </span>
      </label>`;
  }).join('');
  const chipsHtml = classesChips || `<div class="chips-aviso"><i data-lucide="info"></i> Nenhuma classe cadastrada ainda. Cadastre as classes primeiro.</div>`;
  abrirModal(`
    <div class="modal-header">
      <h2>Editar professor</h2>
      <button class="btn-fechar" aria-label="Fechar modal" onclick="fecharModal()"><i data-lucide="x"></i></button>
    </div>
    <div class="msg-erro" id="modal-prof-erro"></div>
    <div class="campo">
      <label for="in-prof-nome">Nome completo</label>
      <input type="text" id="in-prof-nome" value="${escaparHtml(p.nome)}" autocomplete="off">
    </div>
    <div class="campo">
      <label for="in-prof-email">E-mail (login)</label>
      <input type="email" id="in-prof-email" value="${escaparHtml(p.email || '')}" autocomplete="email">
      <small class="hint">O professor pode entrar diretamente com o e-mail e a senha definidos.</small>
    </div>

    <div class="campo">
      <label for="in-prof-senha">Redefinir senha (opcional)</label>
      <div style="display:flex;gap:8px;align-items:stretch">
        <input type="password" id="in-prof-senha" placeholder="Preencha só se quiser trocar a senha" autocomplete="new-password" style="flex:1">
        <button type="button" class="btn-secundario" style="padding:0 12px;min-height:44px" onclick="alternarVisibilidadeSenha('in-prof-senha', this)" aria-label="Mostrar senha"><i data-lucide="eye"></i></button>
      </div>
    </div>
    <div class="campo">
      <label for="in-prof-senha2">Confirmar nova senha</label>
      <div style="display:flex;gap:8px;align-items:stretch">
        <input type="password" id="in-prof-senha2" placeholder="Repita a nova senha" autocomplete="new-password" style="flex:1">
        <button type="button" class="btn-secundario" style="padding:0 12px;min-height:44px" onclick="alternarVisibilidadeSenha('in-prof-senha2', this)" aria-label="Mostrar senha"><i data-lucide="eye"></i></button>
      </div>
    </div>
    <div class="campo">
      <label>Classes que leciona</label>
      <div class="chips-lista" id="lista-chips-classes-prof">${chipsHtml}</div>
      <small class="hint">Toque nas classes para selecionar. Toque novamente para desmarcar.</small>
    </div>
    <div class="modal-botoes">
      <button class="btn-secundario" onclick="fecharModal()">Cancelar</button>
      <button class="btn-primario" onclick="salvarProfessorEdicao(this, '${id}')">
        <i data-lucide="pencil"></i> Salvar alterações
      </button>
    </div>
  `);
  setTimeout(() => { configurarChipsClassesProf(); if (window.lucide) lucide.createIcons(); }, 80);
}
function salvarProfessorEdicao(btnEl, id) {
  if (!perfilEhAdmin()) { toast('Apenas o administrador pode editar professores.', 'erro'); return; }
  comLoadingBtn(btnEl, async () => {
    const p = getProfessor(id);
    if (!p) return;
    const nome = document.getElementById('in-prof-nome').value.trim();
    const email = (document.getElementById('in-prof-email').value || '').trim().toLowerCase();
    const classesSel = obterClassesSelecionadasChips();
    const erro = document.getElementById('modal-prof-erro');
    if (!nome) { erro.textContent = 'Informe o nome do professor.'; throw new Error('val'); }
    if (!email) { erro.textContent = 'Informe o e-mail do professor.'; throw new Error('val'); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { erro.textContent = 'Informe um e-mail valido.'; throw new Error('val'); }
    if (DADOS.professores.some(x => x.id !== id && (x.email || '').toLowerCase() === email)) { erro.textContent = 'Ja existe um professor com este e-mail.'; throw new Error('val'); }
    const senha1 = (document.getElementById('in-prof-senha')?.value || '');
    const senha2 = (document.getElementById('in-prof-senha2')?.value || '');
    const querTrocarSenha = senha1.length > 0 || senha2.length > 0;
    const ativoMarcado = (document.getElementById('in-prof-ativo')?.checked !== false);
    const sb = window.supabaseClient;
    if (!sb) { erro.textContent = 'Sistema nao inicializado.'; throw new Error('val'); }
    if (querTrocarSenha) {
      if (senha1.length < 8) { erro.textContent = 'A nova senha precisa ter pelo menos 8 caracteres.'; throw new Error('val'); }
      if (senha1 !== senha2) { erro.textContent = 'As senhas nao coincidem.'; throw new Error('val'); }
      let resposta;
      try {
        resposta = await sb.functions.invoke('swift-processor', { body: { nome, email, senha: senha1, classesIds: classesSel } });
      } catch (e1) {
        const m = (e1 && (e1.error || e1.message)) || 'Erro de rede ao salvar.';
        erro.textContent = m;
        ['in-prof-senha','in-prof-senha2'].forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
        throw new Error(m);
      }
      const data = resposta && resposta.data;
      const errFn = resposta && resposta.error;
      let mensagem = '';
      if (data && typeof data === 'object') mensagem = data.mensagem || '';
      if (!mensagem && errFn) { const m = await lerErroFuncao(errFn); if (m) mensagem = m; }
      if (errFn || (data && !data.sucesso)) {
        erro.textContent = mensagem || 'Erro ao salvar.';
        ['in-prof-senha','in-prof-senha2'].forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
        throw new Error(mensagem || 'erro');
      }
      toast(mensagem || 'Senha redefinida com sucesso!', 'sucesso');
      if (!ativoMarcado) {
        await sb.from('professores').update({ ativo: false }).eq('id', id);
      }
    } else {
      const { error } = await sb.from('professores').update({ nome, email, ativo: ativoMarcado }).eq('id', id);
      if (error) { erro.textContent = 'Erro ao salvar professor: ' + error.message; throw new Error('val'); }
      await sb.from('professor_classes').delete().eq('professor_id', id);
      if (classesSel.length) {
        const { error: eV } = await sb.from('professor_classes').insert(classesSel.map(cid => ({ professor_id: id, classe_id: cid })));
        if (eV) { erro.textContent = 'Professor salvo, mas falhou classes: ' + eV.message; throw new Error('val'); }
      }
    }
    ['in-prof-senha','in-prof-senha2'].forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
    await carregarDadosSupabase();
    renderizarTudo();
    toast('Professor atualizado!', 'sucesso');
    fecharModal();
    if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
  }, { txtLoading: 'Salvando...', txtOk: 'Salvar alteracoes' });
}
function abrirModalExcluirProfessor(id) {
  const p = getProfessor(id);
  if (!p) return;
  const qtd = (p.classesIds || []).length;
  abrirModal(`
    <div class="modal-header">
      <h2>Excluir professor?</h2>
      <button class="btn-fechar" aria-label="Fechar modal" onclick="fecharModal()"><i data-lucide="x"></i></button>
    </div>
    <p class="modal-alerta"><strong>${escaparHtml(p.nome)}</strong> — ${escaparHtml(p.email)}.<br>${qtd > 0 ? `Atenção: ${qtd} classe(s) deixarão de ter professor responsável.` : 'Nenhuma classe vinculada.'}<br>Esta ação não pode ser desfeita.</p>
    <div class="modal-botoes">
      <button class="btn-secundario" onclick="fecharModal()">Cancelar</button>
      <button class="btn-perigo" onclick="confirmarExcluirProfessor(this, '${id}')">
        <i data-lucide="trash-2"></i> Excluir
      </button>
    </div>
  `);
}
function confirmarExcluirProfessor(btnEl, id) {
  if (!perfilEhAdmin()) { toast('Apenas o administrador pode desativar professores.', 'erro'); return; }
  comLoadingBtn(btnEl, async () => {
    const sb = window.supabaseClient; if (!sb) { toast('Sistema nao inicializado.', 'erro'); throw new Error('val'); }
    const { data: prof, error: eProf } = await sb.from('professores').select('user_id').eq('id', id).maybeSingle();
    if (eProf) { toast('Erro ao localizar professor: ' + eProf.message, 'erro'); throw new Error('val'); }
    const { error } = await sb.from('professores').update({ ativo: false }).eq('id', id);
    if (error) { toast('Erro ao desativar professor: ' + error.message, 'erro'); throw new Error('val'); }
    if (prof && prof.user_id) {
      const { error: ePerfil } = await sb.from('perfis').update({ ativo: false }).eq('id', prof.user_id);
      if (ePerfil) { toast('Professor desativado, mas nao foi possivel bloquear o login: ' + ePerfil.message, 'erro'); throw new Error('val'); }
    }
    await carregarDadosSupabase();
    renderizarTudo();
    toast('Professor desativado com sucesso. O login desse professor foi bloqueado.', 'sucesso');
    fecharModal();
  }, { txtLoading: 'Desativando...', txtOk: 'Desativar' });
}
function chamadaSelecionarClasse(val) {
  if (val && !usuarioPodeGerenciarClasse(val)) {
    toast('Você não tem permissão para esta classe.', 'erro');
    resetarEstadoChamada();
    chamadaAtualizarLista();
    return;
  }
  CHAMADA_ESTADO.classeId = val ? String(val) : null;
  if (CHAMADA_ESTADO.classeId) {
    CHAMADA_ESTADO.marcacoes = {};
    const alunos = DADOS.alunos.filter(a => a.classeId === CHAMADA_ESTADO.classeId);
    alunos.forEach(a => { CHAMADA_ESTADO.marcacoes[a.id] = null; });
  } else {
    CHAMADA_ESTADO.marcacoes = {};
  }
  resetarContadoresDistribuicao();
  chamadaAtualizarLista();
}
function chamadaSelecionarData(val) {
  CHAMADA_ESTADO.dataISO = val || null;
  resetarContadoresDistribuicao();
  chamadaAtualizarLista();
}
function chamadaAtualizarLista() {
  const lista = document.getElementById('lista-chamada');
  const btnConcluir = document.getElementById('btn-concluir-chamada');
  if (!lista) return;
  lista.innerHTML = '';
  const { classeId, dataISO, marcacoes } = CHAMADA_ESTADO;
  if (!classeId || !dataISO) {
    document.getElementById('cc-mat').textContent = '—';
    document.getElementById('cc-pres').textContent = '—';
    document.getElementById('cc-aus').textContent = '—';
    document.getElementById('cc-por').textContent = '—';
    if (!classeId) {
      lista.innerHTML = `
        <div class="vazio-box">
          <div class="vazio-ico"><i data-lucide="users-round"></i></div>
          <h3>Selecione uma classe</h3>
          <p>Escolha uma turma acima para visualizar os alunos matriculados.</p>
        </div>`;
    } else {
      lista.innerHTML = `
        <div class="vazio-box">
          <div class="vazio-ico"><i data-lucide="calendar-days"></i></div>
          <h3>Selecione a data</h3>
          <p>Escolha o domingo da chamada para começar a marcação.</p>
        </div>`;
    }
    if (btnConcluir) { btnConcluir.disabled = true; }
    if (window.lucide) lucide.createIcons({ root: lista });
    return;
  }
  const alunos = DADOS.alunos.filter(a => a.classeId === classeId);
  if (alunos.length === 0) {
    document.getElementById('cc-mat').textContent = '0';
    document.getElementById('cc-pres').textContent = '0';
    document.getElementById('cc-aus').textContent = '0';
    document.getElementById('cc-por').textContent = '0%';
    lista.innerHTML = `
      <div class="vazio-box">
        <div class="vazio-ico"><i data-lucide="user"></i></div>
        <h3>Nenhum aluno nesta classe</h3>
        <p>Cadastre alunos nesta turma antes de fazer a chamada.</p>
        <button class="btn-primario" onclick="irPara('tela-alunos')">
          <i data-lucide="plus"></i> Ir para Alunos
        </button>
      </div>`;
    if (btnConcluir) { btnConcluir.disabled = true; }
    if (window.lucide) lucide.createIcons({ root: lista });
    return;
  }
  alunos.forEach(a => {
    if (marcacoes[a.id] === undefined) marcacoes[a.id] = null;
    const status = marcacoes[a.id];
    const statusClass = status === 'P' ? ' status-presente' : status === 'A' ? ' status-ausente' : '';
    const card = document.createElement('div');
    card.className = 'chamada-aluno-card' + statusClass;
    card.innerHTML = `
      <div class="card-esq">
        <div class="avatar ${a.cor}">${escaparHtml(a.iniciais)}</div>
        <div class="card-info">
          <h3>${escaparHtml(a.nome)}</h3>
          <div class="extra"><i data-lucide="calendar-days"></i> ${escaparHtml(a.dataNasc || 'Data não informada')}</div>
        </div>
      </div>
      <div class="chamada-botoes">
        <button class="btn-presenca presente ${status === 'P' ? 'ativo' : ''}"
          aria-label="Marcar presente ${escaparHtml(a.nome)}"
          onclick="marcarPresencaAusente('${a.id}', 'P')">
          <i data-lucide="check"></i> Presente
        </button>
        <button class="btn-presenca ausente ${status === 'A' ? 'ativo' : ''}"
          aria-label="Marcar ausente ${escaparHtml(a.nome)}"
          onclick="marcarPresencaAusente('${a.id}', 'A')">
          <i data-lucide="x"></i> Ausente
        </button>
      </div>`;
    lista.appendChild(card);
  });
  atualizarContadoresChamada();
  if (window.lucide) lucide.createIcons({ root: lista });
}
function marcarPresencaAusente(alunoId, tipo) {
  const atual = CHAMADA_ESTADO.marcacoes[alunoId];
  if (atual === tipo) {
    CHAMADA_ESTADO.marcacoes[alunoId] = null;
  } else {
    CHAMADA_ESTADO.marcacoes[alunoId] = tipo;
  }
  chamadaAtualizarLista();
}
function atualizarContadoresChamada() {
  const { marcacoes, classeId } = CHAMADA_ESTADO;
  const alunos = DADOS.alunos.filter(a => a.classeId === classeId);
  const matriculados = alunos.length;
  let presentes = 0, ausentes = 0;
  Object.values(marcacoes).forEach(v => {
    if (v === 'P') presentes++;
    if (v === 'A') ausentes++;
  });
  const marcados = presentes + ausentes;
  const porcento = matriculados > 0 ? Math.round((presentes / matriculados) * 100) : 0;
  const matEl = document.getElementById('cc-mat');
  const presEl = document.getElementById('cc-pres');
  const ausEl = document.getElementById('cc-aus');
  const porEl = document.getElementById('cc-por');
  if (matEl) matEl.textContent = matriculados;
  if (presEl) presEl.textContent = presentes;
  if (ausEl) ausEl.textContent = ausentes;
  if (porEl) porEl.textContent = `${porcento}%`;
  const btnConcluir = document.getElementById('btn-concluir-chamada');
  if (btnConcluir) btnConcluir.disabled = marcados === 0;
}
function concluirChamada(btnEl) {
  const eraEdicao = !!CHAMADA_ESTADO.editandoId;
  const promessa = comLoadingBtn(btnEl, async () => {
    const { classeId, dataISO, marcacoes, editandoId } = CHAMADA_ESTADO;
    if (!classeId || !dataISO) throw new Error('param');
    if (!usuarioPodeGerenciarClasse(classeId)) {
      toast('Você não tem permissão para esta classe.', 'erro');
      throw new Error('perm');
    }
    const total = (DADOS.alunos || []).filter(a => String(a.classeId) === String(classeId)).length;
    const presentes = Object.values(marcacoes).filter(v => v === 'P').length;
    const ausentes = Object.values(marcacoes).filter(v => v === 'A').length;
    const resumo = { presentes, ausentes, total };
    const sb = window.supabaseClient; if (!sb) throw new Error('sb');

    const ofertaRaw = (document.getElementById('total-oferta') ? document.getElementById('total-oferta').value : '').trim();
    const ofertaNorm = ofertaRaw.replace(',', '.');
    const ofertaNum = ofertaRaw === '' ? 0 : Number(ofertaNorm);
    if (ofertaRaw !== '' && (isNaN(ofertaNum) || ofertaNum < 0 || ofertaNum > 99999999.99)) {
      const erro = document.getElementById('modal-aluno-erro') || document.getElementById('login-erro');
      toast('Valor da oferta inválido.', 'erro');
      throw new Error('val');
    }
    totalOferta = ofertaNum;

    const { data, error } = await sb.rpc('salvar_chamada', {
      p_classe_id: classeId,
      p_data: dataISO,
      p_total_biblias: totalBiblias,
      p_total_revistas: totalRevistas,
      p_total_oferta: totalOferta,
      p_marcacoes: marcacoes,
      p_sobrescrever: !!editandoId
    });
    if (error) {
      const msg = traduzirErroChamada(error);
      toast(msg, 'erro');
      throw new Error('db');
    }
    await carregarChamadas();
    await carregarDashboardViews();
    try { renderizarRelatorioHoje(); } catch (e) {}
    if (typeof dashRenderDashboard === 'function') dashRenderDashboard();
    resetarEstadoChamada();
    toast(eraEdicao ? 'Chamada atualizada!' : 'Chamada concluída e salva!', 'sucesso');
  }, { txtLoading: 'Salvando chamada...', txtOk: eraEdicao ? 'Salvar alterações' : 'Concluir chamada' });
  promessa.then(() => {
    popularSelectsChamada();
    chamadaAtualizarLista();
    chamadaAtualizarModoEdicao();
    if (eraEdicao) {
      irPara('tela-historico-chamadas');
    }
  }).catch(() => {});
}

function traduzirErroChamada(error) {
  const code = error && (error.code || '');
  const msg = (error && error.message) ? String(error.message) : '';
  const tudo = (msg + ' ' + code).toUpperCase();
  if (/NAO_AUTENTICADO|28000/.test(tudo)) return 'Você precisa estar logado.';
  if (/SEM_PERMISSAO|42501/.test(tudo)) return 'Você não tem permissão para esta classe.';
  if (/DATA_INVALIDA|22007/.test(tudo)) return 'Data inválida ou futura.';
  if (/TOTAL_INVALIDO|22003/.test(tudo)) return 'Total de bíblias/revistas inválido.';
  if (/MARCACOES_INVALIDAS|22023/.test(tudo)) return 'Marcações inválidas.';
  if (/CHAMADA_DUPLICADA|23505/.test(tudo)) return 'Já existe uma chamada desta classe nesta data.';
  if (/OFERTA_INVALIDA/i.test(tudo)) return 'Valor da oferta inválido.';
  return 'Erro ao salvar chamada: ' + (msg || 'erro desconhecido');
}
function renderizarHistoricoChamadas() {
  const filtroEl = document.getElementById('hist-filtro-classe');
  const lista = document.getElementById('lista-historico-chamadas');
  if (!filtroEl || !lista) return;
  const classesDisp = chamadaClassesDisponiveis();
  const filtroAtual = filtroEl.value;
  filtroEl.innerHTML = `<option value="">Todas as minhas classes</option>` +
    classesDisp.map(c => `<option value="${c.id}">${escaparHtml(c.nome)}</option>`).join('');
  if (filtroAtual && classesDisp.some(c => String(c.id) === String(filtroAtual))) {
    filtroEl.value = filtroAtual;
  } else {
    filtroEl.value = '';
  }
  const filtroVal = filtroEl.value;
  let registros = CHAMADAS_REGISTRO.filter(r => {
    const classeExiste = !!getClasse(r.classeId);
    if (!classeExiste) return false;
    if (!usuarioPodeGerenciarClasse(r.classeId)) return false;
    if (filtroVal && String(r.classeId) !== String(filtroVal)) return false;
    return true;
  });
  registros.sort((a, b) => {
    if (a.dataISO !== b.dataISO) return a.dataISO < b.dataISO ? 1 : -1;
    return String(b.id).localeCompare(String(a.id));
  });
  lista.innerHTML = '';
  if (registros.length === 0) {
    lista.innerHTML = `
      <div class="vazio-box">
        <div class="vazio-ico"><i data-lucide="clipboard-list"></i></div>
        <h3>Nenhuma chamada registrada</h3>
        <p>As chamadas concluídas aparecerão aqui para revisão, edição ou exclusão.</p>
      </div>`;
    if (window.lucide) lucide.createIcons({ root: lista });
    return;
  }
  registros.forEach(r => {
    const classe = getClasse(r.classeId);
    const nomeClasse = escaparHtml(classe ? classe.nome : '—');
    const dataBR = formatarDataBR(r.dataISO);
    const resumo = r.resumo || {};
    const mat = Number(resumo.total) || 0;
    const pres = Number(resumo.presentes) || 0;
    const aus = Number(resumo.ausentes) || 0;
    const bib = Number(r.totalBiblias) || 0;
    const rev = Number(r.totalRevistas) || 0;
    const card = document.createElement('div');
    card.className = 'card';
    const esq = document.createElement('div');
    esq.className = 'card-esq';
    const info = document.createElement('div');
    info.className = 'card-info';
    const h3 = document.createElement('h3');
    h3.textContent = classe ? classe.nome : '—';
    const dataExtra = document.createElement('div');
    dataExtra.className = 'extra';
    dataExtra.innerHTML = `<i data-lucide="calendar-days"></i> ${dataBR}`;
    const tags = document.createElement('div');
    tags.className = 'tags';
    tags.style.marginTop = '8px';
    tags.innerHTML = `
      <span class="tag alunos"><i data-lucide="users"></i> ${mat}</span>
      <span class="tag" style="background:#d1fae5;color:#065f46;"><i data-lucide="check"></i> ${pres}</span>
      <span class="tag" style="background:#fee2e2;color:#991b1b;"><i data-lucide="x"></i> ${aus}</span>
      <span class="tag" style="background:#dbeafe;color:#1e40af;"><i data-lucide="book-open"></i> ${bib}</span>
      <span class="tag" style="background:#ede9fe;color:#6d28d9;"><i data-lucide="newspaper"></i> ${rev}</span>
      <span class="tag" style="background:#fef3c7;color:#92400e;"><i data-lucide="coins"></i> ${formatarMoeda(r.totalOferta)}</span>
    `;
    info.appendChild(h3);
    info.appendChild(dataExtra);
    info.appendChild(tags);
    const quadIco = document.createElement('div');
    quadIco.className = `quad-ico ${classe && classe.cor ? classe.cor : 'icone-azul'}`;
    quadIco.innerHTML = '<i data-lucide="clipboard-check"></i>';
    esq.appendChild(quadIco);
    esq.appendChild(info);
    const dir = document.createElement('div');
    dir.className = 'card-dir';
    dir.style.display = 'flex';
    dir.style.flexDirection = 'column';
    dir.style.alignItems = 'flex-end';
    dir.style.gap = '10px';
    const botoes = document.createElement('div');
    botoes.className = 'card-botoes';
    botoes.innerHTML = `
      <button class="btn-card editar" aria-label="Editar chamada de ${nomeClasse} do dia ${dataBR}" onclick="abrirEdicaoChamada('${r.id}')"><i data-lucide="pencil"></i></button>
      <button class="btn-card excluir" aria-label="Excluir chamada de ${nomeClasse} do dia ${dataBR}" onclick="abrirModalExcluirChamada('${r.id}')"><i data-lucide="trash-2"></i></button>
    `;
    dir.appendChild(botoes);
    card.appendChild(esq);
    card.appendChild(dir);
    lista.appendChild(card);
  });
  if (window.lucide) lucide.createIcons({ root: lista });
}
function abrirModalExcluirChamada(id) {
  const r = CHAMADAS_REGISTRO.find(x => x.id === id);
  if (!r) { toast('Chamada não encontrada.', 'erro'); return; }
  const classe = getClasse(r.classeId);
  if (!classe) { toast('Classe não encontrada.', 'erro'); return; }
  if (!usuarioPodeGerenciarClasse(r.classeId)) {
    toast('Você não tem permissão para esta classe.', 'erro');
    return;
  }
  const nomeClasse = escaparHtml(classe.nome);
  const dataBR = formatarDataBR(r.dataISO);
  abrirModal(`
    <div class="modal-header">
      <h2>Excluir chamada?</h2>
      <button class="btn-fechar" aria-label="Fechar modal" onclick="fecharModal()"><i data-lucide="x"></i></button>
    </div>
    <p class="modal-alerta">Excluir a chamada de <strong>${nomeClasse}</strong> do dia <strong>${dataBR}</strong>? Esta ação não pode ser desfeita.</p>
    <div class="modal-botoes">
      <button class="btn-secundario" onclick="fecharModal()">Cancelar</button>
      <button class="btn-perigo" onclick="confirmarExcluirChamada(this, '${id}')">
        <i data-lucide="trash-2"></i> Excluir
      </button>
    </div>
  `);
}
function confirmarExcluirChamada(btnEl, id) {
  comLoadingBtn(btnEl, async () => {
    const idx = CHAMADAS_REGISTRO.findIndex(x => x.id === id);
    if (idx === -1) { toast('Chamada não encontrada.', 'erro'); throw new Error('notfound'); }
    const r = CHAMADAS_REGISTRO[idx];
    if (!usuarioPodeGerenciarClasse(r.classeId)) {
      toast('Você não tem permissão para esta classe.', 'erro');
      throw new Error('perm');
    }
    const sb = window.supabaseClient; if (!sb) throw new Error('sb');
    const { error } = await sb.from('chamadas').delete().eq('id', r.id);
    if (error) { toast('Erro ao excluir chamada: ' + (error.message || ''), 'erro'); throw new Error('db'); }
    CHAMADAS_REGISTRO.splice(idx, 1);
    await carregarDashboardViews();
    if (typeof dashRenderDashboard === 'function') dashRenderDashboard();
    fecharModal();
    try { renderizarRelatorioHoje(); } catch (e) {}
    renderizarHistoricoChamadas();
    toast('Chamada excluída.', 'sucesso');
  }, { txtLoading: 'Excluindo...', txtOk: 'Excluir' });
}
function getAttendanceStatus(percentage) {
  const p = Math.round(Number(percentage) || 0);
  if (p < 40) {
    return {
      key: 'muito_ruim',
      level: 1,
      label: 'Muito ruim',
      color: '#ef4444',        // Vermelho
      bgLight: '#fef2f2',
      border: '#fecaca',
      text: '#991b1b',
      emoji: '🔴'
    };
  } else if (p < 60) {
    return {
      key: 'ruim',
      level: 2,
      label: 'Ruim',
      color: '#f59e0b',        // Amarelo
      bgLight: '#fffbeb',
      border: '#fde68a',
      text: '#92400e',
      emoji: '🟡'
    };
  } else if (p < 80) {
    return {
      key: 'boa',
      level: 3,
      label: 'Boa',
      color: '#10b981',        // Verde
      bgLight: '#ecfdf5',
      border: '#a7f3d0',
      text: '#065f46',
      emoji: '🟢'
    };
  } else {
    return {
      key: 'nao_muito_boa',
      level: 4,
      label: 'Não muito boa',  // Azul (nível superior)
      color: '#2563eb',        // Azul
      bgLight: '#eff6ff',
      border: '#bfdbfe',
      text: '#1e40af',
      emoji: '🔵'
    };
  }
}

const FILTROS_PERIODOS_LABELS = {
  '4domingos': 'Últimos 4 domingos',
  '8domingos': 'Últimos 8 domingos',
  '3meses': '3 meses',
  '6meses': '6 meses',
  'ano': '1 ano',
  '2anos': '2 anos',
  'inicio': 'Desde o início',
  'personalizado': 'Personalizado'
};

function getPeriodoSubtexto(periodoKey) {
  switch (periodoKey) {
    case '4domingos': return 'nas últimas 4 semanas';
    case '8domingos': return 'nas últimas 8 semanas';
    case '3meses': return 'nos últimos 3 meses';
    case '6meses': return 'nos últimos 6 meses';
    case 'ano': return 'no último ano';
    case '2anos': return 'nos últimos 2 anos';
    case 'inicio': return 'desde o início';
    default: return 'no período selecionado';
  }
}

// Estado do Dashboard
let DASH_PERIODO_ATUAL = '4domingos';
let DASH_CLASSE_FILTRO = 'todas';
let DASH_VER_MAIS = false;
let DASH_DADOS = [];
let DASH_TOTAL_ALUNOS_FILTRO = 0;
let DASH_AGRUPADO_MES = false;
let DASH_GRAFICO_DETALHES = [];
const DASH_PERIODOS = [
  ['2domingos', '2 domingos'],
  ['3domingos', '3 domingos'],
  ['4domingos', '4 domingos'],
  ['8domingos', '8 domingos'],
  ['1mes', '1 mês'],
  ['2meses', '2 meses'],
  ['3meses', '3 meses'],
  ['6meses', '6 meses'],
  ['1ano', '1 ano'],
  ['2anos', '2 anos'],
  ['inicio', 'Desde o início'],
  ['personalizado', 'Personalizado']
];

function dashHojeISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
}

function dashSomarMesesISO(iso, meses) {
  const partes = String(iso || '').split('-');
  if (partes.length !== 3) return iso;
  const dt = new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2])));
  dt.setUTCMonth(dt.getUTCMonth() - Number(meses || 0));
  return dt.toISOString().slice(0, 10);
}

function dashEhDomingoISO(iso) {
  const partes = String(iso || '').split('-');
  if (partes.length !== 3) return false;
  const dt = new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2])));
  return dt.getUTCDay() === 0;
}

function dashBR(iso) {
  const partes = String(iso || '').split('-');
  if (partes.length !== 3) return String(iso || '');
  return partes[2] + '/' + partes[1];
}

function dashObterLinhas(classeFiltro) {
  if (classeFiltro && classeFiltro !== 'todas') {
    const porData = new Map();
    (CHAMADAS_REGISTRO || []).forEach(r => {
      if (String(r.classeId) !== String(classeFiltro)) return;
      if (!r.dataISO) return;
      const item = porData.get(r.dataISO) || { dataISO: r.dataISO, pres: 0, aus: 0, bib: 0, rev: 0, ofe: 0 };
      item.pres += Number(r.resumo && r.resumo.presentes) || 0;
      item.aus += Number(r.resumo && r.resumo.ausentes) || 0;
      item.bib += Number(r.totalBiblias) || 0;
      item.rev += Number(r.totalRevistas) || 0;
      item.ofe += Number(r.totalOferta) || 0;
      item.ehDomingo = dashEhDomingoISO(r.dataISO);
      porData.set(r.dataISO, item);
    });
    return [...porData.values()].map(x => ({
      dataISO: x.dataISO,
      pres: x.pres,
      aus: x.aus,
      bib: x.bib,
      rev: x.rev,
      ehDomingo: x.ehDomingo,
      ofe: x.ofe,
      percentual: (x.pres + x.aus) > 0 ? Math.round((x.pres / (x.pres + x.aus)) * 100) : 0
    }));
  }

  const bibRevPorData = new Map();
  (CHAMADAS_REGISTRO || []).forEach(r => {
    if (!r.dataISO) return;
    const item = bibRevPorData.get(r.dataISO) || { bib: 0, rev: 0, ofe: 0 };
    item.bib += Number(r.totalBiblias) || 0;
    item.rev += Number(r.totalRevistas) || 0;
    item.ofe += Number(r.totalOferta) || 0;
    bibRevPorData.set(r.dataISO, item);
  });

  return (DASH_POR_DATA || []).map(r => {
    const extra = bibRevPorData.get(r.data_chamada) || { bib: 0, rev: 0, ofe: 0 };
    const pres = Number(r.qtd_presentes) || 0;
    const aus = Number(r.qtd_ausentes) || 0;
    const perc = Number(r.percentual_presenca);
    return {
      dataISO: r.data_chamada,
      pres,
      aus,
      bib: extra.bib,
      rev: extra.rev,
      ofe: extra.ofe,
      ehDomingo: !!r.eh_domingo,
      percentual: (!isNaN(perc)) ? perc : ((pres + aus) > 0 ? Math.round((pres / (pres + aus)) * 100) : 0)
    };
  });
}

function dashSelecionarDatas(rows, periodoKey) {
  const ordenadas = (rows || []).slice().sort((a, b) => String(b.dataISO).localeCompare(String(a.dataISO)));
  if (periodoKey === 'personalizado') {
    const ini = document.getElementById('dash-data-inicio') ? document.getElementById('dash-data-inicio').value : '';
    const fim = document.getElementById('dash-data-fim') ? document.getElementById('dash-data-fim').value : '';
    if (!ini || !fim) {
      toast('Escolha a data inicial e a data final.', 'erro');
      return null;
    }
    if (ini > fim) {
      toast('A data inicial deve ser menor ou igual à data final.', 'erro');
      return null;
    }
    return ordenadas.filter(r => r.dataISO >= ini && r.dataISO <= fim);
  }
  if (String(periodoKey).endsWith('domingos')) {
    const n = parseInt(String(periodoKey), 10) || 4;
    return ordenadas.filter(r => r.ehDomingo).slice(0, n);
  }
  if (periodoKey === 'inicio') return ordenadas;
  const mesesMap = { '1mes': 1, '2meses': 2, '3meses': 3, '6meses': 6, '1ano': 12, '2anos': 24 };
  const meses = mesesMap[periodoKey];
  if (!meses || ordenadas.length === 0) return ordenadas;
  const ultima = ordenadas[0].dataISO;
  const corte = dashSomarMesesISO(ultima, meses);
  return ordenadas.filter(r => r.dataISO >= corte);
}

function dashSelecionarPeriodo(key) {
  if (key === 'personalizado') {
    DASH_PERIODO_ATUAL = key;
    const box = document.getElementById('dash-personalizado');
    if (box) box.style.display = 'flex';
    const sel = document.getElementById('dash-periodo');
    if (sel) sel.value = key;
    return;
  }
  const box = document.getElementById('dash-personalizado');
  if (box) box.style.display = 'none';
  DASH_PERIODO_ATUAL = key;
  const sel = document.getElementById('dash-periodo');
  if (sel) sel.value = key;
  dashRenderDashboard();
}

function dashAplicarPersonalizado() {
  DASH_PERIODO_ATUAL = 'personalizado';
  dashRenderDashboard();
}

function dashAbrirFiltroClasse() {
  const modal = document.getElementById('modal-filtro-classe-dashboard');
  const opcoes = document.getElementById('dash-filtro-classe-opcoes');
  if (!modal || !opcoes) return;
  opcoes.innerHTML = '<label class="dash-radio"><input type="radio" name="dash-classe" value="todas" ' + (DASH_CLASSE_FILTRO === 'todas' ? 'checked' : '') + '> Todas as classes</label>' +
    (DADOS.classes || []).map(function (c) {
      return '<label class="dash-radio"><input type="radio" name="dash-classe" value="' + escaparHtml(c.id) + '" ' + (String(DASH_CLASSE_FILTRO) === String(c.id) ? 'checked' : '') + '> ' + escaparHtml(c.nome) + '</label>';
    }).join('');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function dashFecharFiltroClasse() {
  const modal = document.getElementById('modal-filtro-classe-dashboard');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

function dashAplicarFiltroClasse() {
  const sel = document.querySelector('input[name="dash-classe"]:checked');
  DASH_CLASSE_FILTRO = sel ? sel.value : 'todas';
  dashFecharFiltroClasse();
  dashRenderDashboard();
}

function dashRenderDashboard() {
  const loading = document.getElementById('dash-loading');
  const erro = document.getElementById('dash-erro');
  const vazio = document.getElementById('dash-vazio');
  const conteudo = document.getElementById('dash-conteudo');
  if (loading) loading.style.display = 'block';
  if (erro) erro.style.display = 'none';
  if (vazio) vazio.style.display = 'none';
  if (conteudo) conteudo.style.display = 'none';
  DASH_VER_MAIS = false;

  try {
    if (!window.supabaseClient) throw new Error('sistema');
    const linhas = dashObterLinhas(DASH_CLASSE_FILTRO);
    const selecionadas = dashSelecionarDatas(linhas, DASH_PERIODO_ATUAL);
    if (selecionadas === null) {
      if (loading) loading.style.display = 'none';
      return;
    }
    DASH_DADOS = selecionadas || [];

    const lblClasse = document.getElementById('dash-filtro-classe-label');
    if (lblClasse) {
      if (DASH_CLASSE_FILTRO === 'todas') lblClasse.textContent = 'Todas as classes';
      else {
        const c = (DADOS.classes || []).find(x => String(x.id) === String(DASH_CLASSE_FILTRO));
        lblClasse.textContent = c ? c.nome : 'Classe';
      }
    }

    const selPeriodoDash = document.getElementById('dash-periodo');
    if (selPeriodoDash) selPeriodoDash.value = DASH_PERIODO_ATUAL;

    const totalAlunos = (DASH_CLASSE_FILTRO === 'todas')
      ? (DADOS.alunos || []).length
      : (DADOS.alunos || []).filter(a => String(a.classeId) === String(DASH_CLASSE_FILTRO)).length;
    const elTotal = document.getElementById('dash-total-alunos');
    if (elTotal) elTotal.textContent = String(totalAlunos);
    DASH_TOTAL_ALUNOS_FILTRO = totalAlunos;

    if (!DASH_DADOS || DASH_DADOS.length === 0) {
      if (loading) loading.style.display = 'none';
      if (vazio) {
        vazio.style.display = 'block';
        vazio.textContent = 'Ainda não há chamadas registradas.';
      }
      dashRenderGrafico([]);
      dashRenderLista([]);
            return;
    }

    DASH_AGRUPADO_MES = DASH_DADOS.length > 12;
    const aviso = document.getElementById('dash-grafico-aviso');
    if (aviso) aviso.style.display = DASH_AGRUPADO_MES ? 'block' : 'none';

    dashRenderGrafico(DASH_DADOS);
    dashRenderLista(DASH_DADOS);
    
    if (loading) loading.style.display = 'none';
    if (conteudo) conteudo.style.display = 'block';
  } catch (e) {
    console.error('Dashboard: falha ao renderizar', e);
    if (loading) loading.style.display = 'none';
    if (erro) {
      erro.style.display = 'block';
      const msg = (e && e.message) ? String(e.message) : String(e || '');
      const ehRede = /failed to fetch|network|fetch|conex/i.test(msg.toLowerCase());
      erro.textContent = ehRede
        ? 'Não foi possível carregar o dashboard. Verifique sua conexão.'
        : 'Erro ao montar o dashboard.';
    }
  }
}

const dashPluginNumeros = {
  id: 'dashPluginNumeros',
  afterDatasetsDraw: function (chart) {
    const ctx = chart.ctx;
    chart.data.datasets.forEach(function (dataset) {
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.visible) return;
      meta.data.forEach(function (bar, index) {
        const val = dataset.data[index];
        if (val == null) return;
        ctx.save();
        ctx.fillStyle = '#0b1a3a';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(val), bar.x, bar.y - 4);
        ctx.restore();
      });
    });
  }
};

function dashRenderGrafico(dados) {
  const canvas = document.getElementById('chart-dashboard');
  if (!canvas) return;
  if (window.__chartInst && window.__chartInst.dashboard) {
    try { window.__chartInst.dashboard.destroy(); } catch (e) {}
    window.__chartInst.dashboard = null;
  }
  if (!window.Chart) return;

  let labels = [];
  let valores = [];
  DASH_GRAFICO_DETALHES = [];

  if (DASH_AGRUPADO_MES && dados && dados.length) {
    const map = new Map();
    (dados || []).forEach(d => {
      const mes = String(d.dataISO).slice(0, 7);
      const item = map.get(mes) || { pres: 0, aus: 0, bib: 0, rev: 0, ofe: 0 };
      item.pres += Number(d.pres) || 0;
      item.aus += Number(d.aus) || 0;
      item.bib += Number(d.bib) || 0;
      item.rev += Number(d.rev) || 0;
      item.ofe += Number(d.ofe) || 0;
      map.set(mes, item);
    });
    const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    labels = entries.map(e => { const p = e[0].split('-'); return p[1] + '/' + p[0]; });
    valores = entries.map(e => e[1].pres);
    DASH_GRAFICO_DETALHES = entries.map(e => {
      const p = e[0].split('-');
      return { label: p[1] + '/' + p[0], valor: e[1].pres, pres: e[1].pres, aus: e[1].aus, bib: e[1].bib, rev: e[1].rev, ofe: e[1].ofe };
    });
  } else {
    const cron = (dados || []).slice().reverse();
    labels = cron.map(d => dashBR(d.dataISO));
    valores = cron.map(d => Number(d.pres) || 0);
    DASH_GRAFICO_DETALHES = cron.map(d => ({ label: 'Domingo, ' + formatarDataBR(d.dataISO), valor: Number(d.pres) || 0, pres: Number(d.pres) || 0, aus: Number(d.aus) || 0, bib: Number(d.bib) || 0, rev: Number(d.rev) || 0, ofe: Number(d.ofe) || 0 }));
  }

  const totalAlunosGrafico = Number(DASH_TOTAL_ALUNOS_FILTRO) || (DADOS.alunos || []).length || 0;
  const maxPresentesGrafico = valores.length ? Math.max.apply(null, valores) : 0;
  let yMaxGrafico = Math.max(totalAlunosGrafico, maxPresentesGrafico);
  yMaxGrafico = Math.ceil(yMaxGrafico / 10) * 10;
  if (yMaxGrafico < 10) yMaxGrafico = 10;
  const stepGrafico = yMaxGrafico > 100 ? 20 : 10;

  window.__chartInst.dashboard = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Presentes',
        data: valores,
        backgroundColor: '#1155CB',
        borderColor: '#1155CB',
        borderWidth: 0,
        borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 },
        borderSkipped: false,
        maxBarThickness: 40,
        barPercentage: 0.62,
        categoryPercentage: 0.78
      }]
    },
    plugins: [dashPluginNumeros],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      layout: { padding: { top: 24, bottom: 4, left: 4, right: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0b1a3a',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          titleFont: { family: 'Inter', size: 13, weight: '700' },
          bodyFont: { family: 'Inter', size: 12, weight: '500' },
          padding: 12,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            title: function (items) {
              if (!items || !items.length) return '';
              const idx = items[0].dataIndex;
              const det = DASH_GRAFICO_DETALHES[idx];
              return det ? det.label : '';
            },
            label: function (ctx) {
              const idx = ctx.dataIndex;
              const det = DASH_GRAFICO_DETALHES[idx];
              if (!det) return 'Presentes: ' + (ctx.parsed.y || 0);
              if (det.aus != null) {
                return [
                  'Matriculados: ' + totalAlunosGrafico,
                  'Presentes: ' + (det.pres || 0),
                  'Ausentes: ' + (det.aus || 0),
                  'Bíblias: ' + (det.bib || 0),
                  'Revistas: ' + (det.rev || 0),
                  'Oferta: ' + formatarMoeda(det.ofe || 0)
                ];
              }
              return 'Presentes: ' + det.valor;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: 'Inter', size: 11, weight: '500' },
            color: '#64748b',
            maxRotation: 0,
            autoSkip: false
          }
        },
        y: {
          display: true,
          beginAtZero: true,
          min: 0,
          max: yMaxGrafico,
          ticks: {
            stepSize: stepGrafico,
            font: { family: 'Inter', size: 12 },
            color: '#64748b',
            callback: function (v) { return Number.isInteger(v) ? v : ''; }
          },
          grid: {
            color: 'rgba(0,0,0,0.06)',
            drawBorder: false
          }
        }
      }
    }
  });
}

let DASH_EXPANDIDOS = new Set();

function dashFormatarDataExtenso(iso) {
  const partes = String(iso || '').split('-');
  if (partes.length !== 3) return String(iso || '');
  const dt = new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2])));
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const dia = Number(partes[2]);
  const mes = meses[Number(partes[1]) - 1] || '';
  const ano = Number(partes[0]);
  const anoAtual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' }).slice(0,4);
  return 'Domingo, ' + dia + ' de ' + mes + (String(ano) !== String(anoAtual) ? ' de ' + ano : '');
}


function dashFormatarDataExtenso(iso) {
  const partes = String(iso || '').split('-');
  if (partes.length !== 3) return String(iso || '');
  const dia = Number(partes[2]);
  const mes = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][Number(partes[1]) - 1] || '';
  const ano = Number(partes[0]);
  const anoAtual = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' }).slice(0,4));
  return 'Domingo, ' + dia + ' de ' + mes + (ano !== anoAtual ? ' de ' + ano : '');
}

function dashRenderLista(dados) {
  const cont = document.getElementById('dash-lista-dias');
  if (!cont) return;
  const limite = DASH_VER_MAIS ? (dados || []).length : 10;
  const visiveis = (dados || []).slice(0, limite);
  if (!visiveis.length) {
    cont.innerHTML = '<div class="dash-vazio">Ainda não há chamadas registradas.</div>';
    const btn = document.getElementById('dash-ver-mais');
    if (btn) btn.style.display = 'none';
    return;
  }
  cont.innerHTML = visiveis.map(function (d) {
    const total = (Number(d.pres) || 0) + (Number(d.aus) || 0);
    const pctPres = total > 0 ? Math.round((Number(d.pres) || 0) / total * 100) : 0;
    const pctAus = total > 0 ? (100 - pctPres) : 0;
    const expandido = DASH_EXPANDIDOS.has(d.dataISO);
    const podeExpandir = (DASH_CLASSE_FILTRO === 'todas');
    const detalhe = (podeExpandir && expandido) ? dashRenderDetalheClasses(d.dataISO) : '';
    return '<div class="dash-dia-card">' +
      '<div class="dash-dia-titulo">' + escaparHtml(dashFormatarDataExtenso(d.dataISO)) + '</div>' +
      '<div class="dash-dia-grid">' +
        '<button type="button" class="dash-dia-item" aria-label="Presentes">' +
          '<i data-lucide="user-check" aria-hidden="true" class="dash-dia-ico" style="color:#047857;"></i>' +
          '<span class="dash-dia-lbl">Presentes</span>' +
          '<strong class="dash-dia-num" style="color:#047857;">' + (Number(d.pres) || 0) + '</strong>' +
        '</button>' +
        '<button type="button" class="dash-dia-item" aria-label="Ausentes">' +
          '<i data-lucide="user-x" aria-hidden="true" class="dash-dia-ico" style="color:#b91c1c;"></i>' +
          '<span class="dash-dia-lbl">Ausentes</span>' +
          '<strong class="dash-dia-num" style="color:#b91c1c;">' + (Number(d.aus) || 0) + '</strong>' +
        '</button>' +
        '<button type="button" class="dash-dia-item" aria-label="Bíblias">' +
          '<i data-lucide="book-open" aria-hidden="true" class="dash-dia-ico" style="color:#0b1a3a;"></i>' +
          '<span class="dash-dia-lbl">Bíblias</span>' +
          '<strong class="dash-dia-num" style="color:#0b1a3a;">' + (Number(d.bib) || 0) + '</strong>' +
        '</button>' +
        '<button type="button" class="dash-dia-item" aria-label="Revistas">' +
          '<i data-lucide="book" aria-hidden="true" class="dash-dia-ico" style="color:#0b1a3a;"></i>' +
          '<span class="dash-dia-lbl">Revistas</span>' +
          '<strong class="dash-dia-num" style="color:#0b1a3a;">' + (Number(d.rev) || 0) + '</strong>' +
        '</button>' +
      '</div>' +
      '<div class="dash-dia-barra">' +
        '<div class="dash-dia-barra-pres" style="width:' + pctPres + '%;"></div>' +
        '<div class="dash-dia-barra-aus" style="width:' + pctAus + '%;"></div>' +
      '</div>' +
      (podeExpandir ? '<button type="button" class="dash-dia-expandir" aria-expanded="' + (expandido ? 'true' : 'false') + '" data-dataiso="' + d.dataISO + '" onclick="dashToggleDetalhe(this.dataset.dataiso)"><i data-lucide="chevron-down" aria-hidden="true"></i> Ver por classe</button>' : '') +
      (podeExpandir && expandido ? '<div class="dash-dia-detalhe">' + detalhe + '</div>' : '') +
    '</div>';
  }).join('');

  const btn = document.getElementById('dash-ver-mais');
  if (btn) {
    if ((dados || []).length > 10 && !DASH_VER_MAIS) {
      btn.style.display = 'inline-block';
      btn.onclick = function () { DASH_VER_MAIS = true; dashRenderLista(dados); };
    } else {
      btn.style.display = 'none';
    }
  }
  if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }
}

function dashToggleDetalhe(dataISO) {
  if (DASH_CLASSE_FILTRO !== 'todas') return;
  if (DASH_EXPANDIDOS.has(dataISO)) DASH_EXPANDIDOS.delete(dataISO);
  else DASH_EXPANDIDOS.add(dataISO);
  dashRenderLista(DASH_DADOS);
}

function dashRenderDetalheClasses(dataISO) {
  const registros = (CHAMADAS_REGISTRO || []).filter(r => r.dataISO === dataISO);
  if (!registros.length) return '<div class="dash-dia-detalhe-vazio">Nenhuma chamada nesta data.</div>';
  const ordenados = registros.slice().sort(function (a, b) {
    const na = (DADOS.classes || []).find(c => String(c.id) === String(a.classeId));
    const nb = (DADOS.classes || []).find(c => String(c.id) === String(b.classeId));
    return String(na ? na.nome : '').localeCompare(String(nb ? nb.nome : ''));
  });
  return ordenados.map(r => {
    const classe = (DADOS.classes || []).find(c => String(c.id) === String(r.classeId));
    const nome = classe ? classe.nome : 'Classe';
    return '<div class="dash-dia-classe">' +
      '<div class="dash-dia-classe-nome">' + escaparHtml(nome) + '</div>' +
      '<div class="dash-dia-classe-grid">' +
        '<div><span>Presentes</span><strong style="color:#047857;">' + (Number(r.resumo && r.resumo.presentes) || 0) + '</strong></div>' +
        '<div><span>Ausentes</span><strong style="color:#b91c1c;">' + (Number(r.resumo && r.resumo.ausentes) || 0) + '</strong></div>' +
        '<div><span>Bíblias</span><strong style="color:#0b1a3a;">' + (Number(r.totalBiblias) || 0) + '</strong></div>' +
        '<div><span>Revistas</span><strong style="color:#0b1a3a;">' + (Number(r.totalRevistas) || 0) + '</strong></div>' +
      '</div>' +
    '</div>';
  }).join('');
}
function dashToggleDetalhe(dataISO) {
  if (DASH_CLASSE_FILTRO !== 'todas') return;
  if (DASH_EXPANDIDOS.has(dataISO)) DASH_EXPANDIDOS.delete(dataISO);
  else DASH_EXPANDIDOS.add(dataISO);
  dashRenderLista(DASH_DADOS);
}

function dashRenderDetalheClasses(dataISO) {
  const registros = (CHAMADAS_REGISTRO || []).filter(r => r.dataISO === dataISO);
  if (!registros.length) return '<div class="dash-dia-detalhe-vazio">Nenhuma chamada nesta data.</div>';
  return registros.map(r => {
    const classe = (DADOS.classes || []).find(c => String(c.id) === String(r.classeId));
    const nome = classe ? classe.nome : 'Classe';
    return '<div class="dash-dia-classe-linha">' +
      '<span class="dash-dia-classe-nome">' + escaparHtml(nome) + '</span>' +
      '<span>' + (Number(r.resumo && r.resumo.presentes) || 0) + ' presentes · ' + (Number(r.resumo && r.resumo.ausentes) || 0) + ' ausentes · ' + (Number(r.totalBiblias) || 0) + ' bíblias · ' + (Number(r.totalRevistas) || 0) + ' revistas</span>' +
    '</div>';
  }).join('');
}
function dashAlunosInicializar() { /* compatibilidade */ }

function animarDashboard() {
  dashRenderDashboard();
}

function atualizarDashboardPeriodo(periodo) {
  if (periodo) DASH_PERIODO_ATUAL = periodo;
  dashRenderDashboard();
}

function selecionarPeriodo(periodoKey) { dashSelecionarPeriodo(periodoKey); }
function trocarPeriodo(btn, valor) { dashSelecionarPeriodo(valor); }


// 13. Compatibilidade com chamadas legadas
function trocarPeriodo(btn, valor) {
  selecionarPeriodo(valor);
}
function atualizarDashboardPeriodo(periodo) {
  selecionarPeriodo(periodo || DASH_PERIODO_ATUAL || '4domingos');
}
async function renderizarRelatorioHoje() {
  const lista = document.getElementById('relatorio-hoje-lista');
  if (!lista) return;
  const sb = window.supabaseClient;
  if (!sb) { lista.innerHTML = '<div class="relatorio-hoje-vazio">Sistema não inicializado.</div>'; return; }
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  const partes = hoje.split('-');
  const dt = new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2])));
  const diasSemana = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  const tituloData = 'Hoje, ' + diasSemana[dt.getUTCDay()] + ' ' + Number(partes[2]) + '/' + partes[1];

  lista.innerHTML = '<div class="relatorio-hoje-data">' + escaparHtml(tituloData) + '</div>';
  try {
    const { data, error } = await sb.from('vw_relatorio_hoje').select('*');
    if (error) { console.error('renderizarRelatorioHoje: falha em vw_relatorio_hoje:', error.message || error); lista.innerHTML += '<div class="relatorio-hoje-vazio">Erro ao carregar o relatório de hoje.</div>'; return; }
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) { lista.innerHTML += '<div class="relatorio-hoje-vazio">Nenhuma classe cadastrada ainda.</div>'; return; }
    const feitas = rows.filter(r => !!r.chamada_id).length;
    const totalClasses = rows.length;
    const resumo = document.createElement('div');
    resumo.className = 'relatorio-hoje-resumo';
    resumo.textContent = feitas + ' de ' + totalClasses + ' classes já fizeram a chamada hoje.';
    lista.appendChild(resumo);

    if (feitas === 0) {
      const vazioHoje = document.createElement('div');
      vazioHoje.className = 'relatorio-hoje-vazio';
      vazioHoje.textContent = 'Nenhuma chamada registrada hoje.';
      lista.appendChild(vazioHoje);
      if (window.lucide) try { lucide.createIcons({ root: lista }); } catch (e) {}
      return;
    }

    if (feitas === 0) {
      const vazioHoje = document.createElement('div');
      vazioHoje.className = 'relatorio-hoje-vazio';
      vazioHoje.textContent = 'Nenhuma chamada registrada hoje.';
      lista.appendChild(vazioHoje);
      if (window.lucide) try { lucide.createIcons({ root: lista }); } catch (e) {}
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'relatorio-hoje-cards';
    rows.forEach(function (r) {
      const card = document.createElement('div');
      card.className = 'relatorio-hoje-card';
      const semChamada = !r.chamada_id;
      const nome = document.createElement('div');
      nome.className = 'relatorio-hoje-nome';
      nome.textContent = r.classe_nome || 'Classe';
      card.appendChild(nome);
      if (semChamada) {
        const etiqueta = document.createElement('div');
        etiqueta.className = 'relatorio-hoje-etiqueta';
        etiqueta.innerHTML = '<i data-lucide="clock" aria-hidden="true"></i> Chamada ainda não feita';
        card.appendChild(etiqueta);
        const mat = document.createElement('div');
        mat.className = 'relatorio-hoje-mat';
        mat.textContent = 'Matriculados: ' + (Number(r.matriculados) || 0);
        card.appendChild(mat);
      } else {
        const grid = document.createElement('div');
        grid.className = 'relatorio-hoje-grid';
        const itens = [
          { lbl: 'Matriculados', val: Number(r.matriculados) || 0, cor: '#0b1a3a' },
          { lbl: 'Presentes', val: Number(r.presentes) || 0, cor: '#047857' },
          { lbl: 'Ausentes', val: Number(r.ausentes) || 0, cor: '#b91c1c' },
          { lbl: 'Bíblias', val: Number(r.total_biblias) || 0, cor: '#0b1a3a' },
          { lbl: 'Revistas', val: Number(r.total_revistas) || 0, cor: '#0b1a3a' },
          { lbl: 'Oferta', val: Number(r.total_oferta) || 0, cor: '#0b1a3a', moeda: true }
        ];
        itens.forEach(function (it) {
          const box = document.createElement('div');
          box.className = 'relatorio-hoje-item';
          const lbl = document.createElement('span');
          lbl.className = 'relatorio-hoje-lbl';
          lbl.textContent = it.lbl;
          const num = document.createElement('strong');
          num.className = 'relatorio-hoje-num';
          num.style.color = it.cor;
          num.textContent = it.moeda ? formatarMoeda(it.val) : String(it.val);
          box.appendChild(lbl);
          box.appendChild(num);
          grid.appendChild(box);
        });
        card.appendChild(grid);
      }
      wrap.appendChild(card);
    });
    lista.appendChild(wrap);

    const feitasRows = rows.filter(r => !!r.chamada_id);
    if (feitasRows.length) {
      const totPres = feitasRows.reduce((acc, r) => acc + (Number(r.presentes) || 0), 0);
      const totAus = feitasRows.reduce((acc, r) => acc + (Number(r.ausentes) || 0), 0);
      const totBib = feitasRows.reduce((acc, r) => acc + (Number(r.total_biblias) || 0), 0);
      const totRev = feitasRows.reduce((acc, r) => acc + (Number(r.total_revistas) || 0), 0);
      const totOferta = feitasRows.reduce((acc, r) => acc + (Number(r.total_oferta) || 0), 0);
      const totalCard = document.createElement('div');
      totalCard.className = 'relatorio-hoje-total';
      const totalNome = document.createElement('div');
      totalNome.className = 'relatorio-hoje-nome';
      totalNome.textContent = 'Total do dia';
      totalCard.appendChild(totalNome);
      const totalGrid = document.createElement('div');
      totalGrid.className = 'relatorio-hoje-grid';
      [
        { lbl: 'Presentes', val: totPres, cor: '#047857' },
        { lbl: 'Ausentes', val: totAus, cor: '#b91c1c' },
        { lbl: 'Bíblias', val: totBib, cor: '#0b1a3a' },
        { lbl: 'Revistas', val: totRev, cor: '#0b1a3a' },
        { lbl: 'Oferta', val: totOferta, cor: '#0b1a3a', moeda: true }
      ].forEach(function (it) {
        const box = document.createElement('div');
        box.className = 'relatorio-hoje-item';
        const lbl = document.createElement('span');
        lbl.className = 'relatorio-hoje-lbl';
        lbl.textContent = it.lbl;
        const num = document.createElement('strong');
        num.className = 'relatorio-hoje-num';
        num.style.color = it.cor;
        num.textContent = it.moeda ? formatarMoeda(it.val) : String(it.val);
        box.appendChild(lbl);
        box.appendChild(num);
        totalGrid.appendChild(box);
      });
      totalCard.appendChild(totalGrid);
      lista.appendChild(totalCard);
    }

    if (window.lucide) try { lucide.createIcons({ root: lista }); } catch (e) {}
  } catch (e) {
    console.error('renderizarRelatorioHoje:', e);
    lista.innerHTML += '<div class="relatorio-hoje-vazio">Erro ao carregar o relatório de hoje.</div>';
  }
}
function tratarErroLogo(img) {
  try {
    if (!img || img.dataset.fallbackAplicado === '1') return;
    const srcAtual = img.getAttribute('src') || '';
    const caminhoCorreto = 'img/logo_igreja.png';
    if (srcAtual !== caminhoCorreto && !srcAtual.startsWith('data:')) {
      img.removeAttribute('onerror');
      img.onerror = function() { tratarErroLogo(img); };
      img.setAttribute('src', caminhoCorreto);
      return;
    }
    img.dataset.fallbackAplicado = '1';
    img.onerror = null;
    img.removeAttribute('src');
    const isHeader = img.classList.contains('header-topo-logo');
    const isLogin = img.classList.contains('login-logo');
    if (isHeader) {
      img.style.width = '150px';
      img.style.height = '68px';
    } else if (isLogin) {
      img.style.width = '180px';
      img.style.height = '72px';
    }
    img.classList.add('logo-erro');
    img.alt = 'ICE Buenos Aires-PI';
    img.style.color = '#1155CB';
    const span = document.createElement('span');
    span.textContent = '✝ ICE\nB.Aires-PI';
    span.style.whiteSpace = 'pre';
    img.parentElement.appendChild(span);
    img.style.display = 'none';
  } catch (e) { /* silencioso */ }
}
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.perfil-menu')) fecharMenusPerfil();
      });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      fecharMenusPerfil();
            dashFecharFiltroClasse();
      fecharModalNumeros();
    }
  });
  window.addEventListener('resize', () => {
    const innerCont = document.getElementById('chart-inner-container');
    if (innerCont && window.__chartInst && window.__chartInst.presencaTotal) {
      const numBarras = window.__chartInst.presencaTotal.data.datasets[0].data.length;
      const parentWidth = (innerCont.parentElement && innerCont.parentElement.clientWidth) || 320;
      const barSpacing = window.innerWidth < 640 ? 56 : 50;
      const requiredWidth = numBarras * barSpacing;
      if (requiredWidth > parentWidth) {
        innerCont.style.width = requiredWidth + 'px';
      } else {
        innerCont.style.width = '100%';
      }
      window.__chartInst.presencaTotal.resize();
    }
  });
  const init = () => {
    try { if (window.lucide) lucide.createIcons(); } catch(e) {}
    try { renderizarTudo(); } catch(e) { console.error(e); }
    try { if (window.Chart) atualizarDashboardPeriodo(); } catch(e) { console.error(e); }
    try { if (usuarioAtual) renderizarRelatorioHoje(); } catch(e) { console.error(e); }
  };
  if (document.readyState !== 'loading') {
    init();
  } else {
    window.addEventListener('load', init);
    setTimeout(init, 1500);
  }
});


// SEÇÃO: ACOMPANHAMENTO INDIVIDUAL DE ALUNOS
// =============================================

// Dados de frequência por aluno (mock - espelha os domingos dos últimos 4 domingos)


let DASH_ALUNO_CHART = null;

function getClasseNomeById(classeId) {
  if (!DADOS || !DADOS.classes) return '—';
  const c = DADOS.classes.find(cl => cl.id === classeId);
  return c ? c.nome : '—';
}

function dashAlunoGetStatus(perc) {
  if (perc < 40) return { key: 'muito-ruim', label: 'Frequência muito baixa' };
  if (perc < 60) return { key: 'ruim', label: 'Frequência regular' };
  if (perc < 80) return { key: 'boa', label: 'Boa frequência' };
  return { key: 'muito-boa', label: 'Frequência excelente' };
}

function dashAlunoGetMsgPastoral(perc, nome) {
  const primeiroNome = (nome || '').split(' ')[0];
  if (perc < 40) return `⚠️ ${primeiroNome} tem estado frequentemente ausente. Pode ser um bom momento para o pastor conversar pessoalmente e perguntar se está tudo bem.`;
  if (perc < 60) return `🟡 ${primeiroNome} tem frequência irregular. Vale uma atenção especial para entender o que tem impedido a participação.`;
  if (perc < 80) return `✅ ${primeiroNome} tem comparecido com boa regularidade. Continue incentivando!`;
  return `🌟 ${primeiroNome} tem presença excelente! Um motivo de alegria e gratidão.`;
}

function dashAlunoRenderizarLista(filtro) {
  const lista = document.getElementById('dash-aluno-lista');
  if (!lista) return;

  const alunos = (DADOS && DADOS.alunos) ? DADOS.alunos : [];
  const termo = (filtro || '').toLowerCase().trim();
  const filtrados = termo ? alunos.filter(a => a.nome.toLowerCase().includes(termo)) : alunos;

  if (filtrados.length === 0) {
    lista.innerHTML = `<div class="dash-aluno-vazio">Nenhum aluno encontrado.</div>`;
    return;
  }

  lista.innerHTML = filtrados.map(aluno => {
    const info = DASH_POR_ALUNO[String(aluno.id)] || {};
    const total = Number(info.total_chamadas) || 0;
    const pres = Number(info.qtd_presentes) || 0;
    const perc = total > 0 ? Math.round((pres / total) * 100) : 0;
    const st = dashAlunoGetStatus(perc);
    const turmeNome = escaparHtml(getClasseNomeById(aluno.classeId));
    return `
      <button class="dash-aluno-item" onclick="dashAlunoAbrirPerfil('${aluno.id}')" aria-label="Ver frequência de ${escaparHtml(aluno.nome)}">
        <div class="dai-avatar ${aluno.cor || 'azul'}">${escaparHtml(aluno.iniciais || aluno.nome.substring(0,2).toUpperCase())}</div>
        <div class="dai-info">
          <div class="dai-nome">${escaparHtml(aluno.nome)}</div>
          <div class="dai-turma">${escaparHtml(turmeNome)}</div>
        </div>
        <div class="dai-perc ${st.key}">${perc}%</div>
      </button>
    `;
  }).join('');
}

function dashAlunoFiltrar() {
  const input = document.getElementById('dash-aluno-pesquisa');
  dashAlunoRenderizarLista(input ? input.value : '');
}

function dashAlunoAbrirPerfil(alunoId) {
  const aluno = (DADOS && DADOS.alunos) ? DADOS.alunos.find(a => a.id === alunoId) : null;
  if (!aluno) return;

  const info = DASH_POR_ALUNO[String(alunoId)] || {};
  const total = Number(info.total_chamadas) || 0;
  const pres = Number(info.qtd_presentes) || 0;
  const aus = Number(info.qtd_ausentes) || (total - pres);
  const perc = total > 0 ? Math.round((pres / total) * 100) : 0;
  const st = dashAlunoGetStatus(perc);
  const turmeNome = escaparHtml(getClasseNomeById(aluno.classeId));

  // Esconde lista, mostra perfil
  const lista = document.getElementById('dash-aluno-lista');
  const pesquisa = document.getElementById('dash-aluno-pesquisa') && document.getElementById('dash-aluno-pesquisa').parentElement;
  const perfil = document.getElementById('dash-aluno-perfil');
  if (lista) lista.style.display = 'none';
  if (pesquisa) pesquisa.style.display = 'none';
  if (perfil) perfil.style.display = 'block';
  const dica = document.getElementById('dash-aluno-dica');
  if (dica) dica.style.display = 'none';

  // Preenche dados
  const avatar = document.getElementById('dap-avatar');
  if (avatar) {
    avatar.textContent = aluno.iniciais || aluno.nome.substring(0,2).toUpperCase();
    avatar.style.background = aluno.cor === 'azul' ? '#2563eb' : aluno.cor === 'verde' ? '#10b981' : aluno.cor === 'rosa' ? '#ec4899' : aluno.cor === 'roxo' ? '#a855f7' : aluno.cor === 'laranja' ? '#f59e0b' : '#374151';
  }

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('dap-nome', aluno.nome);
  setEl('dap-turma', `Turma: ${getClasseNomeById(aluno.classeId)}`);
  setEl('dap-perc', `${perc}%`);
  setEl('dap-pres', pres);
  setEl('dap-aus', aus);
  setEl('dap-dom', total);

  const badge = document.getElementById('dap-badge-status');
  if (badge) { badge.textContent = st.label; badge.className = `dap-badge-status ${st.key}`; }

  const progFill = document.getElementById('dap-prog-fill');
  const progLabel = document.getElementById('dap-prog-label');
  if (progFill) { progFill.style.width = `${perc}%`; progFill.className = `dap-prog-fill ${st.key}`; }
  if (progLabel) progLabel.textContent = `${perc}% de presença`;

  const msg = document.getElementById('dap-msg');
  if (msg) { msg.textContent = dashAlunoGetMsgPastoral(perc, aluno.nome); msg.className = `dap-msg ${st.key}`; }

  const wa = document.getElementById('dap-whatsapp');
  if (wa) {
    const numero = String(aluno.whatsapp || '').replace(/\D/g, '');
    if (!numero) {
      if (perfilEhAdmin()) {
        wa.innerHTML = '<div class="dap-whatsapp-texto">Este aluno não tem WhatsApp cadastrado.</div>' +
          '<button type="button" class="dap-whatsapp-btn discreto" onclick="fecharMenusPerfil(); fecharModal(); abrirModalEditarAluno(\'' + aluno.id + '\')">Cadastrar WhatsApp</button>';
      } else {
        wa.innerHTML = '<div class="dap-whatsapp-texto">Este aluno não tem WhatsApp cadastrado. Peça à secretaria para cadastrar.</div>';
      }
    } else {
      const primeiro = String(aluno.nome || '').split(' ')[0];
      const mensagem = 'Olá! Aqui é da Escola Bíblica Dominical da Igreja Cristã Evangélica de Buenos Aires-PI. Sentimos falta de ' + primeiro + ' nos últimos domingos. Está tudo bem? Estamos orando e esperando por vocês no próximo domingo. Deus abençoe! 🙏';
      const numWa = (numero.length === 12 || numero.length === 13) && numero.startsWith('55') ? numero : ('55' + numero);
      const url = 'https://wa.me/' + numWa + '?text=' + encodeURIComponent(mensagem);
      const destaque = perc < 60;
      wa.innerHTML = '<a class="dap-whatsapp-btn ' + (destaque ? 'destaque' : 'discreto') + '" href="' + url + '" target="_blank" rel="noopener">' +
        '<i data-lucide="message-circle" aria-hidden="true"></i> Enviar mensagem no WhatsApp</a>';
    }
    if (window.lucide) try { lucide.createIcons({ root: wa }); } catch (e) {}
  }

  // Histórico de presença
  const hist = document.getElementById('dash-aluno-historico');
  if (hist) {
    const linhas = (CHAMADAS_REGISTRO || []).filter(r => r.marcacoes && (r.marcacoes[alunoId] === 'P' || r.marcacoes[alunoId] === 'A'))
      .slice().sort((a, b) => String(b.dataISO).localeCompare(String(a.dataISO)));
    if (!linhas.length) {
      hist.innerHTML = '<div class="dash-aluno-vazio">Este aluno ainda não tem chamadas.</div>';
    } else {
      hist.innerHTML = linhas.map(function (r) {
        const presente = r.marcacoes[alunoId] === 'P';
        const partes = String(r.dataISO || '').split('-');
        const curta = (partes.length === 3) ? (partes[2] + '/' + partes[1]) : String(r.dataISO || '');
        const dt = (partes.length === 3) ? new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]))) : null;
        const diaSemana = dt ? dt.toLocaleDateString('pt-BR', { weekday: 'short' }) : '';
        return '<div class="dash-aluno-hist-linha">' +
          '<span class="dash-aluno-hist-data">' + escaparHtml((diaSemana ? diaSemana + ', ' : '') + curta) + '</span>' +
          '<span class="dash-aluno-hist-etiqueta ' + (presente ? 'presente' : 'ausente') + '">' +
            '<i data-lucide="' + (presente ? 'check' : 'x') + '" aria-hidden="true"></i> ' + (presente ? 'Presente' : 'Ausente') +
          '</span>' +
        '</div>';
      }).join('');
      if (window.lucide) try { lucide.createIcons({ root: hist }); } catch (e) {}
    }
  }


  // Mini-gráfico de evolução
  if (DASH_ALUNO_CHART) { try { DASH_ALUNO_CHART.destroy(); } catch(e) {} DASH_ALUNO_CHART = null; }
  const ctxAluno = document.getElementById('chart-aluno-evolucao');
  if (false && ctxAluno && window.Chart && domingos.length > 0) {
    const cores = domingos.map(d => d.presente ? '#10b981' : '#ef4444');
    DASH_ALUNO_CHART = new Chart(ctxAluno, {
      type: 'bar',
      data: {
        labels: domingos.map(d => d.data.substring(0,5)),
        datasets: [{
          data: domingos.map(d => d.presente ? 100 : 0),
          backgroundColor: cores,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 32
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0b1a3a',
            bodyFont: { family: 'Inter', size: 12 },
            padding: 10, cornerRadius: 10,
            callbacks: {
              label: ctx => domingos[ctx.dataIndex].presente ? '✅ Presente' : '❌ Ausente'
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 }, color: '#64748b' } },
          y: { display: false, min: 0, max: 110 }
        }
      }
    });
  }

  if (window.lucide) try { lucide.createIcons(); } catch(e) {}
}

function dashAlunoFecharPerfil() {
  const lista = document.getElementById('dash-aluno-lista');
  const pesquisaWrap = document.querySelector('.dash-aluno-pesquisa-wrap');
  const perfil = document.getElementById('dash-aluno-perfil');
  if (lista) lista.style.display = 'flex';
  if (pesquisaWrap) pesquisaWrap.style.display = '';
  if (perfil) perfil.style.display = 'none';
  const dica2 = document.getElementById('dash-aluno-dica');
  if (dica2) dica2.style.display = '';
  if (DASH_ALUNO_CHART) { try { DASH_ALUNO_CHART.destroy(); } catch(e) {} DASH_ALUNO_CHART = null; }
}

function dashAlunosInicializar() {
  dashAlunoRenderizarLista('');
}




function toggleSecaoDash(btnId, painelId) {
  const btn = document.getElementById(btnId);
  const painel = document.getElementById(painelId);
  if (!btn || !painel) return;
  const aberto = painel.style.display !== 'none';
  const lbl = btn.querySelector('.btt-label-acao');
  if (aberto) {
    painel.style.display = 'none';
    btn.setAttribute('aria-expanded', 'false');
    if (lbl) lbl.textContent = 'Ver mais';
  } else {
    painel.style.display = 'block';
    btn.setAttribute('aria-expanded', 'true');
    if (lbl) lbl.textContent = 'Ver menos';
    if (window.__chartInst && window.__chartInst.barras) {
      requestAnimationFrame(() => { window.__chartInst.barras.resize(); });
    }
  }
}


// PWA: registra o service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js').catch(function (e) { console.warn('SW:', e); });
  });
}
