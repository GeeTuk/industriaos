let pedidosCache = [];
let pedidosFiltroEtapa = null;

async function renderPedidos(params = {}) {
  if (params.etapa) pedidosFiltroEtapa = params.etapa;
  else pedidosFiltroEtapa = null;

  // Topbar action
  const canCreate = currentUser.etapasVisiveis?.includes(1) || ['admin','gerente_geral','vendedor'].includes(currentUser.perfil);
  if (canCreate) {
    document.getElementById('topbar-actions').innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="modalNovoPedido()">+ Novo Pedido</button>
    `;
  }

  document.getElementById('content').innerHTML = `
    <div class="search-bar">
      <div class="search-wrap" style="flex:1">
        <span class="search-icon">🔍</span>
        <input type="text" id="pedido-search" placeholder="Buscar por código, cliente, descrição..." oninput="filtrarPedidos(this.value)">
      </div>
      <select id="filtro-etapa" onchange="filtrarPedidosPorEtapa(this.value)" style="max-width:180px">
        <option value="">Todas as etapas</option>
        ${Object.entries(ETAPAS_NOMES).map(([k,v]) => `<option value="${k}" ${pedidosFiltroEtapa == k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <select id="filtro-tipo" onchange="carregarPedidos()" style="max-width:140px">
        <option value="">Todos os tipos</option>
        ${Object.entries(TIPO_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
    </div>
    <div id="pedidos-lista">
      <div style="padding:40px;text-align:center;color:var(--text3)">Carregando...</div>
    </div>
  `;

  await carregarPedidos();

  if (params.open) {
    const found = pedidosCache.find(p => p.codigo === params.open);
    if (found) abrirFichaPedido(found.id);
  }
}

async function carregarPedidos() {
  try {
    const etapa = document.getElementById('filtro-etapa')?.value || pedidosFiltroEtapa || '';
    const tipo = document.getElementById('filtro-tipo')?.value || '';
    const q = document.getElementById('pedido-search')?.value || '';
    pedidosCache = await api.pedidos.listar({ etapa, tipo, q });
    renderTabelaPedidos(pedidosCache);
  } catch (e) {
    document.getElementById('pedidos-lista').innerHTML = `<div class="empty-state"><div class="empty-text">Erro: ${e.message}</div></div>`;
  }
}

function filtrarPedidos(q) {
  clearTimeout(filtrarPedidos._t);
  filtrarPedidos._t = setTimeout(carregarPedidos, 300);
}

function filtrarPedidosPorEtapa(etapa) {
  pedidosFiltroEtapa = etapa || null;
  carregarPedidos();
}

function renderTabelaPedidos(pedidos) {
  const rows = pedidos.map(p => `
    <tr onclick="abrirFichaPedido(${p.id})">
      <td><span style="font-family:var(--font-mono);font-size:12px;color:var(--accent)">${p.codigo}</span></td>
      <td>${tagTipo(p.tipo)}</td>
      <td>${p.cliente_nome || '<span style="color:var(--text3)">—</span>'}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.descricao || '—'}</td>
      <td>${tagEtapa(p.etapa_atual)}</td>
      <td>${p.prazo ? `<span style="font-family:var(--font-mono);font-size:11px">${formatDateShort(p.prazo)}</span>` : '—'}</td>
      <td>${tagStatus(p.status)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">${formatDate(p.atualizado_em)}</td>
    </tr>
  `).join('');

  document.getElementById('pedidos-lista').innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title">${pedidos.length} pedido(s) encontrado(s)</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Código</th><th>Tipo</th><th>Cliente</th><th>Descrição</th><th>Etapa</th><th>Prazo</th><th>Status</th><th>Atualizado</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Nenhum pedido encontrado</div></div></td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ── FICHA DO PEDIDO ───────────────────────────────────────────────
async function abrirFichaPedido(id) {
  try {
    const pedido = await api.pedidos.get(id);
    const canOperar = currentUser.etapasOperar?.includes(pedido.etapa_atual) || ['admin','gerente_geral'].includes(currentUser.perfil);
    const isAdmin = ['admin','gerente_geral'].includes(currentUser.perfil);
    const showValor = ['admin','gerente_geral','vendedor'].includes(currentUser.perfil);

    // Etapas que o tipo de produto pula (Motor=7 só para INF e BAQ)
    const etapasAtivas = [1,2,3,4,5,6];
    if (['INF','BAQ'].includes(pedido.tipo)) etapasAtivas.push(7);
    etapasAtivas.push(8);

    const progressBar = Array.from({length: 8}, (_,i) => {
      const e = i + 1;
      const done = pedido.etapa_atual > e;
      const curr = pedido.etapa_atual === e;
      const skip = !etapasAtivas.includes(e);
      return `<div class="etapa-dot ${skip ? 'skip' : done ? 'done' : curr ? 'current' : ''}" title="${ETAPAS_NOMES[e]}"></div>`;
    }).join('');

    // Status paralelo Impressão + Corte (etapa 5)
    let impressaoStatus = '';
    const mostraParalelo = pedido.etapa_atual === 5 || pedido.corte_ok || pedido.impressao_ok || pedido.precisa_solvente || pedido.precisa_uv;
    if (mostraParalelo) {
      const corteTag = `<span class="tag ${pedido.corte_ok ? 'tag-green' : 'tag-orange'}">${pedido.corte_ok ? '✓ Corte' : '⏳ Corte'}</span>`;
      const solv = pedido.precisa_solvente ? `<span class="tag ${pedido.impressao_solvente_ok ? 'tag-green' : 'tag-orange'}">${pedido.impressao_solvente_ok ? '✓ Solvente' : '⏳ Solvente'}</span>` : '';
      const uv = pedido.precisa_uv ? `<span class="tag ${pedido.impressao_uv_ok ? 'tag-green' : 'tag-orange'}">${pedido.impressao_uv_ok ? '✓ UV' : '⏳ UV'}</span>` : '';
      const impTag = (!pedido.precisa_solvente && !pedido.precisa_uv)
        ? `<span class="tag ${pedido.impressao_ok ? 'tag-green' : 'tag-orange'}">${pedido.impressao_ok ? '✓ Impressão' : '⏳ Impressão'}</span>`
        : '';
      impressaoStatus = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        ${corteTag}${impTag}${solv}${uv}
      </div>`;
    }

    // Ações disponíveis
    let acoes = '';
    if (canOperar && pedido.status === 'ativo') {
      if (pedido.etapa_atual < 8) {
        // Etapa 5: Impressão e Corte em paralelo
        if (pedido.etapa_atual === 5) {
          const isCorte = ['corte','admin','gerente_geral'].includes(currentUser.perfil);
          const isImpressao = ['impressao','admin','gerente_geral'].includes(currentUser.perfil);

          // Botões de Corte
          if (isCorte && !pedido.corte_ok) {
            acoes += `<button class="btn btn-success btn-sm" onclick="avancarParalelo(${pedido.id}, 'corte')">✓ Corte Pronto</button>`;
          }

          // Botões de Impressão
          if (isImpressao && !pedido.impressao_ok) {
            if (pedido.precisa_solvente && !pedido.impressao_solvente_ok) {
              acoes += `<button class="btn btn-success btn-sm" onclick="avancarParalelo(${pedido.id}, 'solvente')">✓ Solvente Pronta</button>`;
            }
            if (pedido.precisa_uv && !pedido.impressao_uv_ok) {
              acoes += `<button class="btn btn-success btn-sm" onclick="avancarParalelo(${pedido.id}, 'uv')">✓ UV Pronta</button>`;
            }
            if (!pedido.precisa_solvente && !pedido.precisa_uv) {
              acoes += `<button class="btn btn-success btn-sm" onclick="avancarParalelo(${pedido.id}, 'impressao')">✓ Impressão Pronta</button>`;
            }
          }

          if (!acoes) {
            acoes += `<span style="color:var(--text3);font-size:13px">⏳ Aguardando equipes...</span>`;
          }
          acoes += `<button class="btn btn-orange btn-sm" onclick="modalDevolver(${pedido.id}, ${pedido.etapa_atual})">↩ Devolver</button>`;
        } else {
          acoes += `<button class="btn btn-success btn-sm" onclick="modalAvancar(${pedido.id}, ${pedido.etapa_atual})">→ Avançar Etapa</button>`;
          acoes += `<button class="btn btn-orange btn-sm" onclick="modalDevolver(${pedido.id}, ${pedido.etapa_atual})">↩ Devolver</button>`;
        }
      } else {
        acoes += `<button class="btn btn-success btn-sm" onclick="modalAvancar(${pedido.id}, ${pedido.etapa_atual})">✓ Concluir (Expedir)</button>`;
      }
    }
    if (isAdmin) {
      acoes += `<button class="btn btn-ghost btn-sm" onclick="modalEditarPedido(${pedido.id})">✎ Editar</button>`;
    }

    // Capa: primeira imagem da etapa Aprovação (3)
    const capaArquivo = pedido.arquivos?.find(a => a.etapa === 3 && /\.(jpg|jpeg|png|gif|webp)$/i.test(a.nome));

    // Obs destaque: última movimentação
    const ultimaMovimentacao = pedido.historico?.[0];
    const obsDestaque = (ultimaMovimentacao && ['avanco','devolucao'].includes(ultimaMovimentacao.tipo)) ? `
      <div class="obs-destaque ${ultimaMovimentacao.tipo === 'devolucao' ? 'obs-devolucao' : 'obs-avanco'}">
        <div class="obs-destaque-icon">${ultimaMovimentacao.tipo === 'devolucao' ? '↩' : '→'}</div>
        <div class="obs-destaque-body">
          <div class="obs-destaque-text">${ultimaMovimentacao.descricao}</div>
          <div class="obs-destaque-meta">${formatDate(ultimaMovimentacao.criado_em)}</div>
        </div>
      </div>` : '';

    // Filtrar arquivos por visibilidade
    const arquivosVisiveis = (pedido.arquivos || []).filter(a => {
      if (isAdmin) return true;
      if (a.etapa === 3) return true; // capa/aprovação: todos veem
      if (a.etapa === 4) return currentUser.etapasVisiveis?.includes(5); // arte: só impressão vê
      return currentUser.etapasVisiveis?.includes(a.etapa);
    });

    const arquivosHtml = arquivosVisiveis.length
      ? arquivosVisiveis.map(a => {
          const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(a.nome);
          return `
            <div class="arquivo-item">
              <span class="arquivo-icon">${isImg ? '🖼' : '📄'}</span>
              <div class="arquivo-info">
                <a href="${api.arquivos.url(a.id)}" target="_blank" class="arquivo-nome">${a.nome}</a>
                <div class="arquivo-meta">Etapa: ${ETAPAS_NOMES[a.etapa] || a.etapa} · ${formatDate(a.criado_em)}</div>
              </div>
            </div>`;
        }).join('')
      : `<div style="color:var(--text3);font-size:13px;padding:4px 0">Nenhum arquivo disponível</div>`;

    // Histórico
    const timeline = pedido.historico?.map(h => {
      const cores = { criacao: 'var(--accent)', avanco: 'var(--green)', devolucao: 'var(--red)', edicao: 'var(--blue)', parcial: 'var(--orange)' };
      return `
        <div class="timeline-item">
          <div class="timeline-dot" style="background:${cores[h.tipo] || 'var(--text3)'}"></div>
          <div class="timeline-content">
            <div class="timeline-text">${h.descricao}</div>
            <div class="timeline-meta">${formatDate(h.criado_em)}</div>
          </div>
        </div>
      `;
    }).join('') || '<div style="padding:12px;color:var(--text3);font-size:13px">Sem histórico</div>';

    const body = `
      ${capaArquivo
        ? `<div class="pedido-hero" style="background-image:url('${api.arquivos.url(capaArquivo.id)}')">
            <div class="pedido-hero-overlay">
              <div class="pedido-hero-info">
                <div class="pedido-codigo" style="font-size:20px">${pedido.codigo}</div>
                <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
                  ${tagTipo(pedido.tipo)}
                  ${tagEtapa(pedido.etapa_atual)}
                  ${tagStatus(pedido.status)}
                </div>
              </div>
              <div class="pedido-actions">${acoes}</div>
            </div>
            <button class="capa-ampliar-btn" onclick="window.open('${api.arquivos.url(capaArquivo.id)}')" title="Ampliar imagem">⤢</button>
          </div>`
        : `<div class="pedido-header">
            <div>
              <div class="pedido-codigo">${pedido.codigo}</div>
              <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
                ${tagTipo(pedido.tipo)}
                ${tagEtapa(pedido.etapa_atual)}
                ${tagStatus(pedido.status)}
              </div>
            </div>
            <div class="pedido-actions">${acoes}</div>
          </div>
          ${pedido.etapa_atual === 3 && canOperar
            ? `<label class="capa-upload-area">
                <div class="capa-upload-icon">🖼</div>
                <div class="capa-upload-text">Clique para enviar o Layout / Capa do Pedido</div>
                <div class="capa-upload-sub">JPG, PNG — ficará visível para todas as etapas</div>
                <input type="file" hidden accept="image/*" onchange="uploadArquivo(${pedido.id}, this)">
              </label>`
            : ''}`
      }

      ${obsDestaque}

      <div style="margin-bottom:16px">
        <div class="section-label">Progresso</div>
        <div class="etapa-progress">${progressBar}</div>
        ${impressaoStatus}
      </div>

      <div class="info-row">
        <div class="info-item"><div class="info-label">Cliente</div><div class="info-value">${pedido.cliente_nome || '—'}</div></div>
        <div class="info-item"><div class="info-label">Vendedor</div><div class="info-value">${pedido.vendedor_nome || '—'}</div></div>
        ${pedido.categoria ? `<div class="info-item"><div class="info-label">Categoria</div><div class="info-value">${pedido.categoria}</div></div>` : ''}
        <div class="info-item"><div class="info-label">Prazo</div><div class="info-value">${formatDateShort(pedido.prazo) || '—'}</div></div>
        ${showValor ? `<div class="info-item"><div class="info-label">Orçamento</div><div class="info-value">${formatMoney(pedido.valor_orcamento)}</div></div>` : ''}
      </div>

      <div class="info-row">
        <div class="info-item"><div class="info-label">Descrição</div><div class="info-value">${pedido.descricao || '—'}</div></div>
      </div>

      ${pedido.dimensoes || pedido.material || pedido.cores ? `
      <div class="info-row">
        ${pedido.dimensoes ? `<div class="info-item"><div class="info-label">Dimensões</div><div class="info-value">${pedido.dimensoes}</div></div>` : ''}
        ${pedido.material ? `<div class="info-item"><div class="info-label">Material</div><div class="info-value">${pedido.material}</div></div>` : ''}
        ${pedido.cores ? `<div class="info-item"><div class="info-label">Cores</div><div class="info-value">${pedido.cores}</div></div>` : ''}
      </div>` : ''}

      <hr class="divider">
      <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
        <span>Arquivos</span>
        ${canOperar || isAdmin ? `<label class="btn btn-ghost btn-sm" style="cursor:pointer;font-size:12px;font-weight:normal">
          + Anexar
          <input type="file" hidden onchange="uploadArquivo(${pedido.id}, this)" accept="image/*,.pdf,.ai,.eps,.psd,.zip,.rar">
        </label>` : ''}
      </div>
      <div id="arquivos-list-${pedido.id}">${arquivosHtml}</div>

      <hr class="divider">
      <div class="section-label">Histórico</div>
      <div class="timeline">${timeline}</div>
    `;

    abrirModal(`Pedido — ${pedido.codigo}`, body, '', 'modal-lg');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── UPLOAD DE ARQUIVO ─────────────────────────────────────────────
async function uploadArquivo(pedidoId, input) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('arquivo', file);
  try {
    toast('Enviando arquivo...', 'info');
    await api.arquivos.upload(pedidoId, formData);
    toast('Arquivo enviado!', 'success');
    fecharModalForce();
    setTimeout(() => abrirFichaPedido(pedidoId), 300);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── AÇÕES ─────────────────────────────────────────────────────────
// Avança uma das filas paralelas (corte, solvente, uv, impressao)
async function avancarParalelo(id, fila) {
  try {
    const res = await api.pedidos.avancar(id, { fila });
    toast(res.mensagem, 'success');
    fecharModalForce();
    setTimeout(() => abrirFichaPedido(id), 300);
    carregarPedidos();
  } catch (e) { toast(e.message, 'error'); }
}

function modalAvancar(id, etapaAtual) {
  const isArte = etapaAtual === 4;
  const body = `
    ${isArte ? `<div class="form-group">
      <label>Tipo de Impressão *</label>
      <div style="display:flex;gap:20px;margin-top:8px">
        <label class="checkbox-row"><input type="checkbox" id="imp-solvente"> Solvente</label>
        <label class="checkbox-row"><input type="checkbox" id="imp-uv"> UV</label>
      </div>
    </div>` : ''}
    <div class="form-group">
      <label>Observação ${isArte ? '(opcional)' : '(opcional)'}</label>
      <textarea id="obs-avancar" placeholder="Adicione uma observação para a próxima etapa..."></textarea>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-success" onclick="confirmarAvancar(${id}, ${etapaAtual})">→ Confirmar Avanço</button>
  `;
  abrirModal('Avançar Etapa', body, footer);
}

async function confirmarAvancar(id, etapaAtual) {
  const obs = document.getElementById('obs-avancar')?.value;
  const dados = { observacao: obs };
  if (etapaAtual === 4) {
    dados.precisa_solvente = document.getElementById('imp-solvente')?.checked;
    dados.precisa_uv = document.getElementById('imp-uv')?.checked;
  }
  try {
    const res = await api.pedidos.avancar(id, dados);
    toast(res.mensagem, 'success');
    fecharModalForce();
    carregarPedidos();
  } catch (e) { toast(e.message, 'error'); }
}

function modalDevolver(id, etapaAtual) {
  const isAdmin = ['admin','gerente_geral'].includes(currentUser.perfil);
  const etapasDevolver = currentUser.etapasDevolver || [];
  const opts = Object.entries(ETAPAS_NOMES)
    .filter(([k]) => {
      const e = parseInt(k);
      return e < etapaAtual && (isAdmin || etapasDevolver.includes(e) || currentUser.etapasVisiveis?.includes(e));
    })
    .map(([k,v]) => `<option value="${k}">${k} — ${v}</option>`)
    .join('');

  const body = `
    <div class="form-grid cols1" style="gap:14px">
      <div class="form-group">
        <label>Devolver para qual etapa?</label>
        <select id="devolucao-etapa">${opts}</select>
      </div>
      <div class="form-group">
        <label>Motivo da Devolução *</label>
        <textarea id="devolucao-motivo" placeholder="Descreva o motivo..." required></textarea>
      </div>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-danger" onclick="confirmarDevolver(${id})">↩ Confirmar Devolução</button>
  `;
  abrirModal('Devolver Pedido', body, footer);
}

async function confirmarDevolver(id) {
  const etapa = document.getElementById('devolucao-etapa')?.value;
  const motivo = document.getElementById('devolucao-motivo')?.value?.trim();
  if (!motivo) { toast('Informe o motivo da devolução', 'error'); return; }
  try {
    const res = await api.pedidos.devolver(id, { etapa_destino: parseInt(etapa), motivo });
    toast(res.mensagem, 'success');
    fecharModalForce();
    carregarPedidos();
  } catch (e) { toast(e.message, 'error'); }
}

// ── CATÁLOGOS ─────────────────────────────────────────────────────
const NP_CATEGORIAS = {
  INF: ['Tenda Casa', 'Tenda Padrão', 'Tenda Aranha', 'Portal', 'Roof Top', '3D', 'Colchão', 'Túnel'],
  BAQ: ['Normal Shape', 'Special Shape', 'Racer'],
  LON: [], ADH: [], PLC: [],
};
const NP_MATERIAIS = {
  INF: ['Nylon'],
  BAQ: ['Nylon'],
  LON: ['Lona'],
  ADH: ['Transparente', 'Branco', 'Lux'],
  PLC: ['2mm', '1mm'],
};
const NP_CORES = ['Vermelho', 'Azul Omni', 'Azul 388C', 'Verde Maçã', 'Branco', 'Verde Bandeira', 'Laranja'];

function npAtualizarCampos() {
  const tipo = document.getElementById('np-tipo')?.value;
  // Categoria
  const cats = NP_CATEGORIAS[tipo] || [];
  const catEl = document.getElementById('np-categoria');
  if (catEl) {
    catEl.innerHTML = cats.length
      ? cats.map(c => `<option value="${c}">${c}</option>`).join('')
      : '<option value="">— Não aplicável —</option>';
    catEl.disabled = cats.length === 0;
    catEl.closest('.form-group').style.display = cats.length ? '' : 'none';
  }
  // Material
  const mats = NP_MATERIAIS[tipo] || [];
  const matEl = document.getElementById('np-material');
  if (matEl) {
    matEl.innerHTML = mats.map(m => `<option value="${m}">${m}</option>`).join('');
  }
}

// ── NOVO PEDIDO ───────────────────────────────────────────────────
async function modalNovoPedido() {
  let clientes = [];
  try { clientes = await api.clientes.listar(); } catch {}
  const clienteOpts = clientes.map(c => `<option value="${c.id}">${c.razao_social}</option>`).join('');

  const coresCheckboxes = NP_CORES.map(c =>
    `<label class="checkbox-row" style="min-width:130px"><input type="checkbox" class="np-cor-check" value="${c}"> ${c}</label>`
  ).join('');

  const body = `
    <div class="form-grid">
      <div class="form-group">
        <label>Tipo de Produto *</label>
        <select id="np-tipo" onchange="npAtualizarCampos()">
          <option value="INF">Inflável</option>
          <option value="LON">Lona</option>
          <option value="ADH">Adesivo</option>
          <option value="PLC">Placa</option>
          <option value="BAQ">Balão de Ar Quente</option>
        </select>
      </div>
      <div class="form-group" id="np-categoria-group">
        <label>Categoria</label>
        <select id="np-categoria"></select>
      </div>
      <div class="form-group">
        <label>Cliente</label>
        <select id="np-cliente">
          <option value="">— Selecionar —</option>
          ${clienteOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Material</label>
        <select id="np-material"></select>
      </div>
      <div class="form-group span2">
        <label>Cores (selecione quantas quiser)</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">${coresCheckboxes}</div>
      </div>
      <div class="form-group span2">
        <label>Descrição do Pedido *</label>
        <textarea id="np-descricao" placeholder="Descreva o produto, finalidade, informações relevantes..."></textarea>
      </div>
      <div class="form-group">
        <label>Dimensões</label>
        <input type="text" id="np-dimensoes" placeholder="ex: 3m x 2m">
      </div>
      <div class="form-group">
        <label>Prazo de Entrega</label>
        <input type="date" id="np-prazo">
      </div>
      <div class="form-group">
        <label>Valor do Orçamento (R$)</label>
        <input type="number" id="np-valor" placeholder="0,00" step="0.01">
      </div>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-primary" onclick="confirmarNovoPedido()">Criar Pedido</button>
  `;
  abrirModal('Novo Pedido', body, footer);
  // Inicializar dropdowns dependentes
  setTimeout(npAtualizarCampos, 0);
}

async function confirmarNovoPedido() {
  const tipo = document.getElementById('np-tipo').value;
  const cats = NP_CATEGORIAS[tipo] || [];
  const coresSelecionadas = [...document.querySelectorAll('.np-cor-check:checked')].map(el => el.value).join(', ');
  const dados = {
    tipo,
    categoria: cats.length ? document.getElementById('np-categoria')?.value : null,
    cliente_id: document.getElementById('np-cliente').value || null,
    descricao: document.getElementById('np-descricao').value.trim(),
    dimensoes: document.getElementById('np-dimensoes').value,
    material: document.getElementById('np-material').value,
    cores: coresSelecionadas,
    prazo: document.getElementById('np-prazo').value,
    valor_orcamento: document.getElementById('np-valor').value || null,
  };
  if (!dados.descricao) { toast('Preencha a descrição', 'error'); return; }
  try {
    const res = await api.pedidos.criar(dados);
    toast(`Pedido ${res.codigo} criado!`, 'success');
    fecharModalForce();
    carregarPedidos();
  } catch (e) { toast(e.message, 'error'); }
}

// ── EDITAR PEDIDO ─────────────────────────────────────────────────
async function modalEditarPedido(id) {
  const pedido = await api.pedidos.get(id);
  const body = `
    <div class="form-grid">
      <div class="form-group span2">
        <label>Descrição *</label>
        <textarea id="ep-descricao">${pedido.descricao || ''}</textarea>
      </div>
      <div class="form-group">
        <label>Dimensões</label>
        <input type="text" id="ep-dimensoes" value="${pedido.dimensoes || ''}">
      </div>
      <div class="form-group">
        <label>Material</label>
        <input type="text" id="ep-material" value="${pedido.material || ''}">
      </div>
      <div class="form-group">
        <label>Cores</label>
        <input type="text" id="ep-cores" value="${pedido.cores || ''}">
      </div>
      <div class="form-group">
        <label>Prazo</label>
        <input type="date" id="ep-prazo" value="${pedido.prazo || ''}">
      </div>
      <div class="form-group">
        <label>Valor Orçamento</label>
        <input type="number" id="ep-valor" value="${pedido.valor_orcamento || ''}" step="0.01">
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="ep-status">
          <option value="ativo" ${pedido.status==='ativo'?'selected':''}>Ativo</option>
          <option value="aguardando" ${pedido.status==='aguardando'?'selected':''}>Aguardando</option>
          <option value="concluido" ${pedido.status==='concluido'?'selected':''}>Concluído</option>
          <option value="cancelado" ${pedido.status==='cancelado'?'selected':''}>Cancelado</option>
        </select>
      </div>
      <div class="form-group" style="padding-top:20px">
        <label class="checkbox-row"><input type="checkbox" id="ep-solvente" ${pedido.precisa_solvente?'checked':''}> Impressão Solvente</label>
        <label class="checkbox-row" style="margin-top:8px"><input type="checkbox" id="ep-uv" ${pedido.precisa_uv?'checked':''}> Impressão UV</label>
      </div>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-primary" onclick="confirmarEditarPedido(${id})">Salvar</button>
  `;
  abrirModal(`Editar — ${pedido.codigo}`, body, footer);
}

async function confirmarEditarPedido(id) {
  const dados = {
    descricao: document.getElementById('ep-descricao').value,
    dimensoes: document.getElementById('ep-dimensoes').value,
    material: document.getElementById('ep-material').value,
    cores: document.getElementById('ep-cores').value,
    prazo: document.getElementById('ep-prazo').value,
    valor_orcamento: document.getElementById('ep-valor').value || null,
    status: document.getElementById('ep-status').value,
    precisa_solvente: document.getElementById('ep-solvente').checked,
    precisa_uv: document.getElementById('ep-uv').checked,
  };
  try {
    await api.pedidos.atualizar(id, dados);
    toast('Pedido atualizado', 'success');
    fecharModalForce();
    carregarPedidos();
  } catch (e) { toast(e.message, 'error'); }
}
