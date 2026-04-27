// ── PEDIDOS DE SUPRIMENTOS ────────────────────────────────────────
const SUP_STATUS_LABEL = {
  pendente:  { cor: 'orange', label: 'Pendente' },
  aprovado:  { cor: 'blue',   label: 'Aprovado' },
  entregue:  { cor: 'green',  label: 'Entregue' },
  cancelado: { cor: 'gray',   label: 'Cancelado' },
};

const PERFIL_SETOR = {
  impressao: 'Impressão', corte: 'Corte', costura: 'Costura',
  motor: 'Motor', expedicao: 'Expedição', admin: 'Admin', gerente_geral: 'Gerência',
};

async function renderSuprimentos() {
  const isGerente = ['admin','gerente_geral'].includes(currentUser.perfil);

  if (isGerente) {
    document.getElementById('topbar-actions').innerHTML =
      `<button class="btn btn-ghost btn-sm" onclick="renderSuprimentos()">↻ Atualizar</button>`;
  } else {
    document.getElementById('topbar-actions').innerHTML =
      `<button class="btn btn-primary btn-sm" onclick="modalSolicitarSuprimento()">📦 Novo Pedido</button>`;
  }

  try {
    const lista = await api.suprimentos.listar();
    _renderTabelaSuprimentos(lista, isGerente);
  } catch (e) {
    document.getElementById('content').innerHTML =
      `<div class="empty-state"><div class="empty-text">Erro: ${e.message}</div></div>`;
  }
}

function _renderTabelaSuprimentos(lista, isGerente) {
  // Abas por status
  const abas = ['pendente','aprovado','entregue','cancelado'];
  let abaAtiva = 'pendente';

  function renderAba(status) {
    abaAtiva = status;
    const filtrada = lista.filter(s => s.status === status);

    document.querySelectorAll('.sup-tab').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`sup-tab-${status}`);
    if (btn) btn.classList.add('active');

    const tbody = document.getElementById('sup-tbody');
    if (!tbody) return;

    if (!filtrada.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">
        Nenhum pedido ${SUP_STATUS_LABEL[status]?.label?.toLowerCase() || status}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = filtrada.map(s => {
      const st = SUP_STATUS_LABEL[s.status] || { cor: 'gray', label: s.status };
      const acoes = isGerente ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${s.status === 'pendente' ? `
            <button class="btn btn-success btn-sm" style="font-size:11px" onclick="atualizarSuprimento(${s.id},'aprovado')">✓ Aprovar</button>
            <button class="btn btn-danger btn-sm" style="font-size:11px" onclick="atualizarSuprimento(${s.id},'cancelado')">✕ Cancelar</button>
          ` : ''}
          ${s.status === 'aprovado' ? `
            <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="atualizarSuprimento(${s.id},'entregue')">📦 Entregue</button>
            <button class="btn btn-danger btn-sm" style="font-size:11px" onclick="atualizarSuprimento(${s.id},'cancelado')">✕ Cancelar</button>
          ` : ''}
        </div>` : `<span style="color:var(--text3);font-size:12px">${s.resposta || '—'}</span>`;

      return `<tr>
        <td style="font-family:var(--font-mono);font-size:11px">${formatDate(s.criado_em)}</td>
        <td><span class="tag tag-${st.cor}">${st.label}</span></td>
        <td><span style="font-size:12px;color:var(--accent)">${PERFIL_SETOR[s.perfil] || s.perfil}</span></td>
        <td style="font-size:13px">${s.categoria}</td>
        <td style="max-width:240px">
          <div style="font-size:13px">${s.descricao}</div>
          ${s.quantidade ? `<div style="font-size:11px;color:var(--text3)">${s.quantidade}</div>` : ''}
        </td>
        <td style="font-size:12px;color:var(--text2)">${s.solicitante_nome || '—'}</td>
        <td>${acoes}</td>
      </tr>`;
    }).join('');
  }

  const contagens = {};
  abas.forEach(a => { contagens[a] = lista.filter(s => s.status === a).length; });

  const tabsHtml = abas.map(a => {
    const { cor, label } = SUP_STATUS_LABEL[a];
    return `<button id="sup-tab-${a}" class="tab-btn sup-tab ${a === 'pendente' ? 'active' : ''}"
      onclick="document.querySelectorAll('.sup-tab').forEach(b=>b.classList.remove('active'));this.classList.add('active');_supRenderAba('${a}')">
      ${label}
      <span class="tab-badge" style="background:var(--${cor}-dim);color:var(--${cor})">${contagens[a]}</span>
    </button>`;
  }).join('');

  document.getElementById('content').innerHTML = `
    <div class="tabs-nav" style="margin-bottom:16px">${tabsHtml}</div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th><th>Status</th><th>Setor</th>
              <th>Categoria</th><th>Pedido</th><th>Solicitante</th>
              <th>${isGerente ? 'Ações' : 'Resposta'}</th>
            </tr>
          </thead>
          <tbody id="sup-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  // Expõe para os botões nas abas
  window._supLista = lista;
  window._supIsGerente = isGerente;
  window._supRenderAba = renderAba;

  renderAba('pendente');
}

async function atualizarSuprimento(id, status) {
  try {
    await api.suprimentos.atualizar(id, { status });
    toast(`Pedido marcado como ${SUP_STATUS_LABEL[status]?.label || status}`, 'success');
    renderSuprimentos();
  } catch (e) { toast(e.message, 'error'); }
}
