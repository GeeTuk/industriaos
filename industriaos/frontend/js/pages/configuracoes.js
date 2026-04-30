// ── CONFIGURAÇÕES DO SISTEMA (admin) ──────────────────────────────
let _cfgTab = 'impressoras';

async function renderConfiguracoes() {
  document.getElementById('topbar-actions').innerHTML =
    `<button class="btn btn-ghost btn-sm" onclick="renderConfiguracoes()">↻ Atualizar</button>`;

  const tabs = [
    { id: 'impressoras',       label: '🖨️ Impressoras' },
    { id: 'sup-categorias',    label: '📦 Suprimentos' },
    { id: 'produto-categorias',label: '🗂️ Categorias' },
    { id: 'produto-materiais', label: '🧵 Materiais' },
    { id: 'produto-cores',     label: '🎨 Cores' },
    { id: 'produto-dimensoes', label: '📐 Dimensões' },
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
  // Re-render: o HTML das tabs usa onclick="_cfgSetTab('id')" e a classe active é definida por _cfgTab
  _cfgRenderTab();
  // Atualizar active na nav de tabs (as tabs ficam no .tabs-nav, geradas por renderConfiguracoes)
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.getAttribute('onclick')?.includes(`'${tab}'`)) b.classList.add('active');
  });
}

async function _cfgRenderTab() {
  const el = document.getElementById('cfg-content');
  if (!el) return;
  el.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text3)">Carregando...</div>';

  try {
    if (_cfgTab === 'impressoras')            await _cfgRenderImpressoras(el);
    else if (_cfgTab === 'sup-categorias')   await _cfgRenderSupCategorias(el);
    else if (_cfgTab === 'produto-materiais') await _cfgRenderProdutoMateriais(el);
    else if (_cfgTab === 'produto-cores')    await _cfgRenderProdutoCores(el);
    else if (_cfgTab === 'produto-dimensoes') await _cfgRenderProdutoDimensoes(el);
    else                                     await _cfgRenderProdutoCategorias(el);
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

// ── ABA: MATERIAIS DE PRODUTO ─────────────────────────────────────
let _cfgMatTipo = 'INF';

async function _cfgRenderProdutoMateriais(el) {
  const lista = await api.admin.produtoMateriais.listar();
  const porTipo = {};
  for (const t of CFG_TIPOS) porTipo[t.id] = lista.filter(m => m.produto_tipo === t.id);
  const tipoAtivo = porTipo[_cfgMatTipo] || [];

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:180px 1fr;gap:16px">
      <div class="card" style="padding:12px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Tipo</div>
        ${CFG_TIPOS.map(t => `
          <div onclick="_cfgMatSetTipo('${t.id}')"
            style="padding:8px 12px;border-radius:6px;cursor:pointer;font-size:13px;margin-bottom:2px;
              ${_cfgMatTipo === t.id ? 'background:var(--accent);color:#fff;font-weight:600' : 'color:var(--text2)'}">
            ${t.label}
            <span style="float:right;font-size:11px;opacity:.7">${(porTipo[t.id]||[]).length}</span>
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Materiais — ${CFG_TIPOS.find(t=>t.id===_cfgMatTipo)?.label || ''}</div>
        </div>
        <div style="padding:16px 20px">
          <div style="display:flex;gap:8px;margin-bottom:20px">
            <input type="text" id="cfg-nova-mat" placeholder="Ex: Nylon, Lona, Vinil..."
              style="flex:1" onkeydown="if(event.key==='Enter')_cfgAdicionarMat()">
            <button class="btn btn-primary" onclick="_cfgAdicionarMat()">＋ Adicionar</button>
          </div>
          <div>
            ${tipoAtivo.length ? tipoAtivo.map(m => `
              <div class="alert-item" style="justify-content:space-between">
                <span style="font-size:13px;color:var(--text1)">🧵 ${m.nome}</span>
                <button class="btn btn-danger btn-sm" style="font-size:11px"
                  onclick="_cfgApagarMat(${m.id}, '${m.nome.replace(/'/g,"\\'")}')">🗑 Apagar</button>
              </div>`).join('')
            : '<div style="color:var(--text3);font-size:13px;padding:8px 0">Nenhum material. Adicione um acima.</div>'}
          </div>
        </div>
      </div>
    </div>`;
}

function _cfgMatSetTipo(tipo) {
  _cfgMatTipo = tipo;
  _cfgRenderTab();
}

async function _cfgAdicionarMat() {
  const nome = document.getElementById('cfg-nova-mat')?.value?.trim();
  if (!nome) { toast('Digite o nome do material', 'error'); return; }
  try {
    await api.admin.produtoMateriais.criar({ produto_tipo: _cfgMatTipo, nome });
    window.appConfig = await api.config();
    toast('Material adicionado!', 'success');
    document.getElementById('cfg-nova-mat').value = '';
    _cfgRenderTab();
  } catch (e) { toast(e.message, 'error'); }
}

async function _cfgApagarMat(id, nome) {
  if (!confirm(`Apagar o material "${nome}"?`)) return;
  try {
    await api.admin.produtoMateriais.apagar(id);
    window.appConfig = await api.config();
    toast('Material removido', 'success');
    _cfgRenderTab();
  } catch (e) { toast(e.message, 'error'); }
}

// ── ABA: CORES ────────────────────────────────────────────────────
async function _cfgRenderProdutoCores(el) {
  const lista = await api.admin.produtoCores.listar();

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">🎨 Cores Disponíveis</div>
        <div style="font-size:12px;color:var(--text3)">Cores que aparecem no formulário de novo pedido</div>
      </div>
      <div style="padding:16px 20px">
        <div style="display:flex;gap:8px;margin-bottom:20px">
          <input type="text" id="cfg-nova-cor" placeholder="Nome da cor (ex: Azul Royal, Rosa Bebê...)"
            style="flex:1" onkeydown="if(event.key==='Enter')_cfgAdicionarCor()">
          <button class="btn btn-primary" onclick="_cfgAdicionarCor()">＋ Adicionar</button>
        </div>
        <div id="cfg-cores-lista" style="display:flex;flex-wrap:wrap;gap:8px">
          ${lista.length ? lista.map(c => `
            <div style="display:flex;align-items:center;gap:6px;background:var(--bg2);border:1px solid var(--border);border-radius:20px;padding:6px 12px 6px 14px">
              <span style="font-size:13px;color:var(--text1)">🎨 ${c.nome}</span>
              <button onclick="_cfgApagarCor(${c.id}, '${c.nome.replace(/'/g,"\\'")}') "
                style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px;padding:0 2px;line-height:1"
                title="Remover">✕</button>
            </div>`).join('')
          : '<div style="color:var(--text3);font-size:13px;padding:8px 0">Nenhuma cor cadastrada</div>'}
        </div>
      </div>
    </div>`;
}

async function _cfgAdicionarCor() {
  const nome = document.getElementById('cfg-nova-cor')?.value?.trim();
  if (!nome) { toast('Digite o nome da cor', 'error'); return; }
  try {
    await api.admin.produtoCores.criar(nome);
    window.appConfig = await api.config();
    toast('Cor adicionada!', 'success');
    document.getElementById('cfg-nova-cor').value = '';
    _cfgRenderTab();
  } catch (e) { toast(e.message, 'error'); }
}

async function _cfgApagarCor(id, nome) {
  if (!confirm(`Apagar a cor "${nome}"?`)) return;
  try {
    await api.admin.produtoCores.apagar(id);
    window.appConfig = await api.config();
    toast('Cor removida', 'success');
    _cfgRenderTab();
  } catch (e) { toast(e.message, 'error'); }
}

// ── ABA: DIMENSÕES ────────────────────────────────────────────────
async function _cfgRenderProdutoDimensoes(el) {
  const lista = await api.admin.produtoDimensoes.listar();

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">📐 Dimensões Padrão</div>
        <div style="font-size:12px;color:var(--text3)">Tamanhos que aparecem como opções no formulário de itens</div>
      </div>
      <div style="padding:16px 20px">
        <div style="display:flex;gap:8px;margin-bottom:20px">
          <input type="text" id="cfg-nova-dim" placeholder="ex: 3.5m × 2m, 10m × 5m..."
            style="flex:1" onkeydown="if(event.key==='Enter')_cfgAdicionarDim()">
          <button class="btn btn-primary" onclick="_cfgAdicionarDim()">＋ Adicionar</button>
        </div>
        <div id="cfg-dims-lista" style="display:flex;flex-wrap:wrap;gap:8px">
          ${lista.length ? lista.map(d => `
            <div style="display:flex;align-items:center;gap:6px;background:var(--bg2);border:1px solid var(--border);border-radius:20px;padding:6px 12px 6px 14px">
              <span style="font-size:13px;color:var(--text1);font-family:var(--font-mono)">📐 ${d.nome}</span>
              <button onclick="_cfgApagarDim(${d.id}, '${d.nome.replace(/'/g,"\\'")}')"
                style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px;padding:0 2px;line-height:1"
                title="Remover">✕</button>
            </div>`).join('')
          : '<div style="color:var(--text3);font-size:13px;padding:8px 0">Nenhuma dimensão cadastrada</div>'}
        </div>
      </div>
    </div>`;
}

async function _cfgAdicionarDim() {
  const nome = document.getElementById('cfg-nova-dim')?.value?.trim();
  if (!nome) { toast('Digite a dimensão', 'error'); return; }
  try {
    await api.admin.produtoDimensoes.criar(nome);
    window.appConfig = await api.config();
    toast('Dimensão adicionada!', 'success');
    document.getElementById('cfg-nova-dim').value = '';
    _cfgRenderTab();
  } catch (e) { toast(e.message, 'error'); }
}

async function _cfgApagarDim(id, nome) {
  if (!confirm(`Apagar a dimensão "${nome}"?`)) return;
  try {
    await api.admin.produtoDimensoes.apagar(id);
    window.appConfig = await api.config();
    toast('Dimensão removida', 'success');
    _cfgRenderTab();
  } catch (e) { toast(e.message, 'error'); }
}
