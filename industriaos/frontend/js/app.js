// ── STATE ─────────────────────────────────────────────────────────
let currentUser = null;
let currentPage = null;
let etapasMap = {};

// 8 etapas: Impressão e Corte são paralelas na etapa 5
const ETAPAS_NOMES = {
  1: 'Contato', 2: 'Layout', 3: 'Aprovação', 4: 'Arte',
  5: 'Impressão / Corte', 6: 'Costura', 7: 'Motor', 8: 'Expedição'
};
const TIPO_LABELS = { INF: 'Inflável', LON: 'Lona', ADH: 'Adesivo', PLC: 'Placa', BAQ: 'Balão AR' };
const PERFIL_LABELS = {
  admin: 'Administrador', gerente_geral: 'Gerente Geral', vendedor: 'Vendedor',
  designer: 'Designer', moldes: 'Moldes', impressao: 'Impressão',
  corte: 'Corte', costura: 'Costura', motor: 'Motor', expedicao: 'Expedição', operador: 'Operador'
};

// ── INIT ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const token = getToken();
  if (token) {
    try {
      currentUser = await api.me();
      etapasMap = await api.etapas();
      mostrarApp();
      navigate('dashboard');
    } catch {
      removeToken();
      mostrarLogin();
    }
  } else {
    mostrarLogin();
  }

  document.getElementById('login-senha').addEventListener('keydown', e => {
    if (e.key === 'Enter') fazerLogin();
  });
});

// ── AUTH ──────────────────────────────────────────────────────────
async function fazerLogin() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const btn = document.getElementById('login-btn');
  const erro = document.getElementById('login-erro');
  erro.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  try {
    const res = await api.login(email, senha);
    setToken(res.token);
    currentUser = await api.me();
    etapasMap = await api.etapas();
    mostrarApp();
    navigate('dashboard');
  } catch (e) {
    erro.textContent = e.message;
    erro.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

function logout() {
  removeToken();
  currentUser = null;
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-screen').style.display = 'grid';
  document.getElementById('login-email').value = '';
  document.getElementById('login-senha').value = '';
}

function mostrarLogin() {
  document.getElementById('login-screen').style.display = 'grid';
  document.getElementById('app-shell').style.display = 'none';
}

function mostrarApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';

  // User card
  const iniciais = currentUser.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('user-avatar').textContent = iniciais;
  document.getElementById('user-nome').textContent = currentUser.nome;
  document.getElementById('user-perfil').textContent = PERFIL_LABELS[currentUser.perfil] || currentUser.perfil;

  buildNav();
}

// ── NAVIGATION ────────────────────────────────────────────────────
const PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬡', section: 'Principal', perfis: 'all' },
  { id: 'pedidos', label: 'Pedidos', icon: '◈', section: 'Produção', perfis: 'all' },
  { id: 'fila', label: 'Minha Fila', icon: '▷', section: 'Produção', perfis: ['vendedor','designer','moldes','impressao','corte','costura','motor','expedicao','operador'] },
  { id: 'clientes', label: 'Clientes', icon: '◎', section: 'Comercial', perfis: ['admin','gerente_geral','vendedor'] },
  { id: 'usuarios', label: 'Usuários', icon: '○', section: 'Administração', perfis: ['admin'] },
  { id: 'auditoria', label: 'Auditoria', icon: '◉', section: 'Administração', perfis: ['admin'] },
];

function buildNav() {
  const nav = document.getElementById('nav-menu');
  nav.innerHTML = '';
  let lastSection = '';

  for (const p of PAGES) {
    if (p.perfis !== 'all' && !p.perfis.includes(currentUser.perfil)) continue;

    if (p.section !== lastSection) {
      const sec = document.createElement('div');
      sec.className = 'nav-section';
      sec.textContent = p.section;
      nav.appendChild(sec);
      lastSection = p.section;
    }

    const item = document.createElement('div');
    item.className = 'nav-item';
    item.id = `nav-${p.id}`;
    item.innerHTML = `<span class="nav-icon">${p.icon}</span> ${p.label}`;
    item.onclick = () => navigate(p.id);
    nav.appendChild(item);
  }
}

function navigate(page, params = {}) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');

  const titles = { dashboard: 'Dashboard', pedidos: 'Pedidos', fila: 'Minha Fila', clientes: 'Clientes', usuarios: 'Usuários & Permissões', auditoria: 'Log de Auditoria' };
  document.getElementById('page-title').textContent = titles[page] || page;
  document.getElementById('topbar-actions').innerHTML = '';

  const content = document.getElementById('content');
  content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Carregando...</div>';

  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'pedidos': renderPedidos(params); break;
    case 'fila': renderFila(); break;
    case 'clientes': renderClientes(); break;
    case 'usuarios': renderUsuarios(); break;
    case 'auditoria': renderAuditoria(); break;
    default: content.innerHTML = '<div class="empty-state"><div class="empty-icon">🚧</div><div class="empty-text">Página em construção</div></div>';
  }

  // Fecha sidebar em mobile
  if (window.innerWidth <= 900) document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ── MODAL ─────────────────────────────────────────────────────────
function abrirModal(titulo, bodyHtml, footerHtml = '', size = '') {
  document.getElementById('modal-title').textContent = titulo;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml;
  document.getElementById('modal-box').className = 'modal' + (size ? ' ' + size : '');
  document.getElementById('modal-overlay').classList.add('open');
}

function fecharModal(e) {
  if (e.target === document.getElementById('modal-overlay')) fecharModalForce();
}

function fecharModalForce() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ── LIGHTBOX ──────────────────────────────────────────────────────
function abrirLightbox(url) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  if (!lb || !img) return;
  img.src = url;
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function fecharLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.style.display = 'none';
  document.body.style.overflow = '';
}

// Fechar lightbox com ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') fecharLightbox();
});

// ── TOASTS ────────────────────────────────────────────────────────
function toast(msg, tipo = 'info', dur = 3500) {
  const container = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  const icons = { success: '✓', error: '✕', info: '◈' };
  el.innerHTML = `<span style="color:var(--${tipo === 'success' ? 'green' : tipo === 'error' ? 'red' : 'accent'})">${icons[tipo] || '◈'}</span> ${msg}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), dur);
}

// ── HELPERS ───────────────────────────────────────────────────────
function tagEtapa(etapa) {
  const cores = { 1:'gray',2:'gray',3:'yellow',4:'yellow',5:'orange',6:'blue',7:'blue',8:'green' };
  return `<span class="tag tag-${cores[etapa] || 'gray'}">${ETAPAS_NOMES[etapa] || etapa}</span>`;
}

function tagTipo(tipo) {
  const cores = { INF: 'blue', LON: 'green', ADH: 'yellow', PLC: 'orange', BAQ: 'red' };
  return `<span class="tag tag-${cores[tipo] || 'gray'}">${TIPO_LABELS[tipo] || tipo}</span>`;
}

function tagStatus(status) {
  const map = { ativo: ['green','Ativo'], concluido: ['blue','Concluído'], cancelado: ['red','Cancelado'], aguardando: ['yellow','Aguardando'] };
  const [cor, label] = map[status] || ['gray', status];
  return `<span class="tag tag-${cor}">${label}</span>`;
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function formatMoney(v) {
  if (!v) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Fila page com abas por etapa
async function renderFila() {
  try {
    const etapasOperar = currentUser.etapasOperar || currentUser.etapasVisiveis || [];
    if (etapasOperar.length === 0) {
      document.getElementById('content').innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><div class="empty-text">Sem etapas configuradas para seu perfil.<br>Fale com o administrador.</div></div>';
      return;
    }

    const pedidos = await api.pedidos.listar();
    window._filaPedidos = pedidos;

    const activeTab = etapasOperar[0];
    _renderFilaTabs(etapasOperar, pedidos, activeTab);
  } catch (e) {
    document.getElementById('content').innerHTML = `<div class="empty-state"><div class="empty-text">Erro: ${e.message}</div></div>`;
  }
}

function _renderFilaTabs(etapasOperar, pedidos, activeTab) {
  const tabs = etapasOperar.map(e => {
    const count = pedidos.filter(p => p.etapa_atual === e).length;
    return `<button class="tab-btn ${e === activeTab ? 'active' : ''}" onclick="filaSetTab(${e})">
      ${ETAPAS_NOMES[e]}
      <span class="tab-badge">${count}</span>
    </button>`;
  }).join('');

  document.getElementById('content').innerHTML = `
    <div class="tabs-nav">${tabs}</div>
    <div id="fila-tab-content"></div>
  `;
  _renderFilaCards(pedidos, activeTab);
}

function filaSetTab(etapa) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.textContent.includes(ETAPAS_NOMES[etapa])) btn.classList.add('active');
  });
  _renderFilaCards(window._filaPedidos || [], etapa);
}

function _renderFilaCards(pedidos, etapa) {
  const lista = pedidos.filter(p => p.etapa_atual === etapa);
  if (lista.length === 0) {
    document.getElementById('fila-tab-content').innerHTML = `
      <div class="empty-state" style="margin-top:32px">
        <div class="empty-icon">✓</div>
        <div class="empty-text">Nenhum pedido em <strong>${ETAPAS_NOMES[etapa]}</strong> agora</div>
      </div>`;
    return;
  }

  const cards = lista.map(p => `
    <div class="fila-card" onclick="abrirFichaPedido(${p.id})">
      <div class="fila-card-header">
        <span class="fila-codigo">${p.codigo}</span>
        ${tagTipo(p.tipo)}
      </div>
      <div class="fila-card-body">
        <div class="fila-cliente">${p.cliente_nome || 'Sem cliente'}</div>
        <div class="fila-desc">${p.descricao?.substring(0, 90) || '—'}</div>
      </div>
      <div class="fila-card-footer">
        <span>${p.prazo ? 'Prazo: ' + formatDateShort(p.prazo) : ''}</span>
        <span>${formatDate(p.atualizado_em)}</span>
      </div>
    </div>
  `).join('');

  document.getElementById('fila-tab-content').innerHTML = `<div class="cards-grid">${cards}</div>`;
}

// Auditoria
async function renderAuditoria() {
  try {
    const logs = await api.auditoria();
    const rows = logs.map(l => `
      <tr>
        <td style="font-family:var(--font-mono);font-size:11px">${formatDate(l.criado_em)}</td>
        <td>${l.user_nome || '—'}</td>
        <td>${l.acao}</td>
        <td style="font-size:12px;color:var(--text2)">${l.detalhes || '—'}</td>
      </tr>
    `).join('');

    document.getElementById('content').innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">Log de Auditoria</div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4"><div class="empty-state"><div class="empty-text">Sem registros</div></div></td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    document.getElementById('content').innerHTML = `<div class="empty-state"><div class="empty-text">Erro: ${e.message}</div></div>`;
  }
}
