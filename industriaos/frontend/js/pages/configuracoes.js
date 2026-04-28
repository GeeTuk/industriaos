// ── CONFIGURAÇÕES DO SISTEMA (admin) ──────────────────────────────
let _cfgTab = 'impressoras';

async function renderConfiguracoes() {
  document.getElementById('topbar-actions').innerHTML =
    `<button class="btn btn-ghost btn-sm" onclick="renderConfiguracoes()">↻ Atualizar</button>`;

  const tabs = [
    { id: 'impressoras',       label: '🖨️ Impressoras' },
    { id: 'sup-categorias',    label: '📦 Suprimentos' },
    { id: 'produto-categorias',label: '🗂️ Produtos' },
  ];

  document.getElementById('content').innerHTML = `
    <div class="tabs-nav" style="margin-bottom:20px">
      ${tabs.map(t => `
        <button class="tab-btn ${_cfgTab === t.id ? 'active' : ''}"
          onclick="_cfgSetTab('${t.id}')">${t.label}</button>`).join('')}
    </div>
    <div id="cfg-content"></div>`;

  _cfgRenderTab();
}

function _cfgSetTab(tab) {
  _cfgTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.textContent.trim().includes(tab === 'impressoras' ? 'Impressoras' : tab === 'sup-categorias' ? 'Suprimentos' : 'Produtos'))
      b.classList.add('active');
  });
  _cfgRenderTab();
}

async function _cfgRenderTab() {
  const el = document.getElementById('cfg-content');
  if (!el) return;
  el.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text3)">Carregando...</div>';

  try {
    if (_cfgTab === 'impressoras')        await _cfgRenderImpressoras(el);
    else if (_cfgTab === 'sup-categorias') await _cfgRenderSupCategorias(el);
    else                                   await _cfgRenderProdutoCategorias(el);
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-text">Erro: ${e.message}</div></div>`;
  }
}

// ── ABA: IMPRESSORAS ──────────────────────────────────────────────
async function _cfgRenderImpressoras(el) {
  const lista = await api.admin.impressoras.listar();

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">🖨️ Impressoras Cadastradas</div>
      </div>
      <div style="padding:16px 20px">
        <div style="display:flex;gap:8px;margin-bottom:20px">
          <input type="text" id="cfg-nova-impressora" placeholder="Nome da impressora (ex: Mimaki UV 100-160)"
            style="flex:1" onkeydown="if(event.key==='Enter')_cfgAdicionarImpressora()">
          <button class="btn btn-primary" onclick="_cfgAdicionarImpressora()">＋ Adicionar</button>
        </div>
        <div id="cfg-impressoras-lista">
          ${lista.length ? lista.map(i => `
            <div class="alert-item" style="justify-content:space-between">
              <span style="font-size:13px;color:var(--text1)">🖨️ ${i.nome}</span>
              <button class="btn btn-danger btn-sm" style="font-size:11px"
                onclick="_cfgApagarImpressora(${i.id}, '${i.nome.replace(/'/g,"\\'")}')">🗑 Apagar</button>
            </div>`).join('')
          : '<div style="color:var(--text3);font-size:13px;padding:8px 0">Nenhuma impressora cadastrada</div>'}
        </div>
      </div>
    </div>`;
}

async function _cfgAdicionarImpressora() {
  const nome = document.getElementById('cfg-nova-impressora')?.value?.trim();
  if (!nome) { toast('Digite o nome da impressora', 'error'); return; }
  try {
    await api.admin.impressoras.criar(nome);
    window.appConfig = await api.config();
    toast('Impressora adicionada!', 'success');
    document.getElementById('cfg-nova-impressora').value = '';
    _cfgRenderTab();
  } catch (e) { toast(e.message, 'error'); }
}

async function _cfgApagarImpressora(id, nome) {
  if (!confirm(`Apagar a impressora "${nome}"?`)) return;
  try {
    await api.admin.impressoras.apagar(id);
    window.appConfig = await api.config();
    toast('Impressora removida', 'success');
    _cfgRenderTab();
  } catch (e) { toast(e.message, 'error'); }
}

// ── ABA: SUPRIMENTOS ──────────────────────────────────────────────
const CFG_SETORES = [
  { id: 'impressao', label: '🖨️ Impressão' },
  { id: 'corte',     label: '✂️ Corte' },
  { id: 'costura',   label: '🧵 Costura' },
  { id: 'motor',     label: '⚙️ Motor' },
  { id: 'expedicao', label: '📦 Expedição' },
  { id: 'default',   label: '📋 Geral' },
];
let _cfgSupSetor = 'impressao';

async function _cfgRenderSupCategorias(el) {
  const lista = await api.admin.supCategorias.listar();
  const porSetor = {};
  for (const s of CFG_SETORES) porSetor[s.id] = lista.filter(c => c.setor === s.id);

  const setorAtivo = porSetor[_cfgSupSetor] || [];

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:180px 1fr;gap:16px">
      <div class="card" style="padding:12px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Setor</div>
        ${CFG_SETORES.map(s => `
          <div onclick="_cfgSupSetSetor('${s.id}')"
            style="padding:8px 12px;border-radius:6px;cursor:pointer;font-size:13px;margin-bottom:2px;
              ${_cfgSupSetor === s.id ? 'background:var(--accent);color:#fff;font-weight:600' : 'color:var(--text2)'}">
            ${s.label}
            <span style="float:right;font-size:11px;opacity:.7">${(porSetor[s.id]||[]).length}</span>
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Categorias — ${CFG_SETORES.find(s=>s.id===_cfgSupSetor)?.label || ''}</div>
        </div>
        <div style="padding:16px 20px">
          <div style="display:flex;gap:8px;margin-bottom:20px">
            <input type="text" id="cfg-nova-sup-cat" placeholder="Nome da categoria..."
              style="flex:1" onkeydown="if(event.key==='Enter')_cfgAdicionarSupCat()">
            <button class="btn btn-primary" onclick="_cfgAdicionarSupCat()">＋ Adicionar</button>
          </div>
          <div>
            ${setorAtivo.length ? setorAtivo.map(c => `
              <div class="alert-item" style="justify-content:space-between">
                <span style="font-size:13px;color:var(--text1)">📌 ${c.nome}</span>
                <button class="btn btn-danger btn-sm" style="font-size:11px"
                  onclick="_cfgApagarSupCat(${c.id}, '${c.nome.replace(/'/g,"\\'")}')">🗑 Apagar</button>
              </div>`).join('')
            : '<div style="color:var(--text3);font-size:13px;padding:8px 0">Nenhuma categoria. Adicione uma acima.</div>'}
          </div>
        </div>
      </div>
    </div>`;
}

function _cfgSupSetSetor(setor) {
  _cfgSupSetor = setor;
  _cfgRenderTab();
}

async function _cfgAdicionarSupCat() {
  const nome = document.getElementById('cfg-nova-sup-cat')?.value?.trim();
  if (!nome) { toast('Digite o nome da categoria', 'error'); return; }
  try {
    await api.admin.supCategorias.criar({ setor: _cfgSupSetor, nome });
    window.appConfig = await api.config();
    toast('Categoria adicionada!', 'success');
    document.getElementById('cfg-nova-sup-cat').value = '';
    _cfgRenderTab();
  } catch (e) { toast(e.message, 'error'); }
}

async function _cfgApagarSupCat(id, nome) {
  if (!confirm(`Apagar a categoria "${nome}"?`)) return;
  try {
    await api.admin.supCategorias.apagar(id);
    window.appConfig = await api.config();
    toast('Categoria removida', 'success');
    _cfgRenderTab();
  } catch (e) { toast(e.message, 'error'); }
}

// ── ABA: CATEGORIAS DE PRODUTO ────────────────────────────────────
const CFG_TIPOS = [
  { id: 'INF', label: '🎈 Inflável' },
  { id: 'LON', label: '🏠 Lona' },
  { id: 'ADH', label: '🔖 Adesivo' },
  { id: 'PLC', label: '🪧 Placa' },
];
let _cfgProdTipo = 'INF';

async function _cfgRenderProdutoCategorias(el) {
  const lista = await api.admin.produtoCategorias.listar();
  const porTipo = {};
  for (const t of CFG_TIPOS) porTipo[t.id] = lista.filter(c => c.produto_tipo === t.id);
  const tipoAtivo = porTipo[_cfgProdTipo] || [];

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:180px 1fr;gap:16px">
      <div class="card" style="padding:12px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Tipo</div>
        ${CFG_TIPOS.map(t => `
          <div onclick="_cfgProdSetTipo('${t.id}')"
            style="padding:8px 12px;border-radius:6px;cursor:pointer;font-size:13px;margin-bottom:2px;
              ${_cfgProdTipo === t.id ? 'background:var(--accent);color:#fff;font-weight:600' : 'color:var(--text2)'}">
            ${t.label}
            <span style="float:right;font-size:11px;opacity:.7">${(porTipo[t.id]||[]).length}</span>
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Categorias — ${CFG_TIPOS.find(t=>t.id===_cfgProdTipo)?.label || ''}</div>
        </div>
        <div style="padding:16px 20px">
          <div style="display:flex;gap:8px;margin-bottom:20px">
            <input type="text" id="cfg-nova-prod-cat" placeholder="Ex: Tenda Casa, Roof Top, Portal..."
              style="flex:1" onkeydown="if(event.key==='Enter')_cfgAdicionarProdCat()">
            <button class="btn btn-primary" onclick="_cfgAdicionarProdCat()">＋ Adicionar</button>
          </div>
          <div>
            ${tipoAtivo.length ? tipoAtivo.map(c => `
              <div class="alert-item" style="justify-content:space-between">
                <span style="font-size:13px;color:var(--text1)">📁 ${c.nome}</span>
                <button class="btn btn-danger btn-sm" style="font-size:11px"
                  onclick="_cfgApagarProdCat(${c.id}, '${c.nome.replace(/'/g,"\\'")}')">🗑 Apagar</button>
              </div>`).join('')
            : '<div style="color:var(--text3);font-size:13px;padding:8px 0">Nenhuma categoria. Adicione uma acima.</div>'}
          </div>
        </div>
      </div>
    </div>`;
}

function _cfgProdSetTipo(tipo) {
  _cfgProdTipo = tipo;
  _cfgRenderTab();
}

async function _cfgAdicionarProdCat() {
  const nome = document.getElementById('cfg-nova-prod-cat')?.value?.trim();
  if (!nome) { toast('Digite o nome da categoria', 'error'); return; }
  try {
    await api.admin.produtoCategorias.criar({ produto_tipo: _cfgProdTipo, nome });
    window.appConfig = await api.config();
    toast('Categoria adicionada!', 'success');
    document.getElementById('cfg-nova-prod-cat').value = '';
    _cfgRenderTab();
  } catch (e) { toast(e.message, 'error'); }
}

async function _cfgApagarProdCat(id, nome) {
  if (!confirm(`Apagar a categoria "${nome}"?`)) return;
  try {
    await api.admin.produtoCategorias.apagar(id);
    window.appConfig = await api.config();
    toast('Categoria removida', 'success');
    _cfgRenderTab();
  } catch (e) { toast(e.message, 'error'); }
}
