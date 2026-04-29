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

// Situação amigável para o vendedor repassar ao cliente
function statusCliente(etapa, status) {
  if (status === 'concluido') return '<span class="tag tag-green">✅ Entregue</span>';
  if (status === 'cancelado') return '<span class="tag tag-gray">❌ Cancelado</span>';
  if (etapa <= 2)  return '<span class="tag tag-gray">📝 Em orçamento</span>';
  if (etapa === 3) return '<span class="tag tag-yellow">⏳ Ag. aprovação</span>';
  if (etapa <= 7)  return '<span class="tag tag-blue">🏭 Em produção</span>';
  if (etapa === 8) return '<span class="tag tag-orange">🚚 Pronto p/ envio</span>';
  return '—';
}

function renderTabelaPedidos(pedidos) {
  const isVendedor = currentUser.perfil === 'vendedor';

  const rows = pedidos.map(p => `
    <tr onclick="abrirFichaPedido(${p.id})" ${p.urgente ? 'style="border-left:3px solid var(--red)"' : ''}>
      <td>
        <span style="font-family:var(--font-mono);font-size:12px;color:var(--accent)">${p.codigo}</span>
        ${tagsBadges(p)}
      </td>
      <td>${tagTipo(p.tipo)}</td>
      <td>${p.cliente_nome || '<span style="color:var(--text3)">—</span>'}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.descricao || '—'}</td>
      <td>${isVendedor ? statusCliente(p.etapa_atual, p.status) : tagEtapa(p.etapa_atual)}</td>
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
          <thead><tr>
            <th>Código</th><th>Tipo</th><th>Cliente</th><th>Descrição</th>
            <th>${isVendedor ? 'Situação' : 'Etapa'}</th>
            <th>Prazo</th><th>Status</th><th>Atualizado</th>
          </tr></thead>
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
    const temItens = !!(pedido.tem_itens && pedido.itens?.length > 0);

    // Etapas que o tipo de produto pula (Motor=7 só para INF)
    const etapasAtivas = [1,2,3,4,5,6];
    if (!temItens && pedido.tipo === 'INF') etapasAtivas.push(7);
    else if (temItens) { etapasAtivas.push(7); } // multi-item: include all stages in progress bar
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
      const impTag2 = pedido.impressora
        ? `<span class="tag tag-blue" style="font-size:11px">🖨️ ${pedido.impressora}</span>`
        : '';
      impressaoStatus = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        ${impTag2}${corteTag}${impTag}${solv}${uv}
      </div>`;
    }

    // Ações disponíveis
    let acoes = '';
    if (canOperar && pedido.status === 'ativo') {
      if (temItens) {
        // ── Pedido com itens: etapas 1-3 e 8 no nível do pedido ──────
        if (pedido.etapa_atual <= 3) {
          acoes += `<button class="btn btn-success btn-sm" onclick="modalAvancar(${pedido.id}, ${pedido.etapa_atual}, true)">→ Avançar Etapa</button>`;
          acoes += `<button class="btn btn-orange btn-sm" onclick="modalDevolver(${pedido.id}, ${pedido.etapa_atual})">↩ Devolver</button>`;
        } else if (pedido.etapa_atual === 8) {
          acoes += `<button class="btn btn-success btn-sm" onclick="modalAvancar(${pedido.id}, ${pedido.etapa_atual}, true)">🚚 Expedir Pedido</button>`;
        } else if (pedido.etapa_atual === 4) {
          // Em produção: verificar se todos os itens estão prontos
          const todosOk = pedido.itens?.every(it => it.status === 'concluido');
          if (todosOk) {
            acoes += `<button class="btn btn-success btn-sm" onclick="modalAvancar(${pedido.id}, 8, true)">🚚 Todos prontos — Expedir</button>`;
          } else {
            acoes += `<span style="color:var(--text3);font-size:12px">⏳ Avance cada item na tabela abaixo</span>`;
          }
        }
      } else {
        // ── Pedido simples (sem itens) — lógica original ─────────────
        if (pedido.etapa_atual < 8) {
          if (pedido.etapa_atual === 5) {
            const isCorte = ['corte','admin','gerente_geral'].includes(currentUser.perfil);
            const isImpressao = ['impressao','admin','gerente_geral'].includes(currentUser.perfil);
            if (isCorte && !pedido.corte_ok) {
              acoes += `<button class="btn btn-success btn-sm" onclick="avancarParalelo(${pedido.id}, 'corte')">✓ Corte Pronto</button>`;
            }
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
            if (!acoes) acoes += `<span style="color:var(--text3);font-size:13px">⏳ Aguardando equipes...</span>`;
            acoes += `<button class="btn btn-orange btn-sm" onclick="modalDevolver(${pedido.id}, ${pedido.etapa_atual})">↩ Devolver</button>`;
          } else {
            acoes += `<button class="btn btn-success btn-sm" onclick="modalAvancar(${pedido.id}, ${pedido.etapa_atual})">→ Avançar Etapa</button>`;
            acoes += `<button class="btn btn-orange btn-sm" onclick="modalDevolver(${pedido.id}, ${pedido.etapa_atual})">↩ Devolver</button>`;
          }
        } else {
          acoes += `<button class="btn btn-success btn-sm" onclick="modalAvancar(${pedido.id}, ${pedido.etapa_atual})">🚚 Expedir Pedido</button>`;
        }
      }
    }
    if (isAdmin) {
      acoes += `<button class="btn btn-ghost btn-sm" onclick="modalEditarPedido(${pedido.id})">✎ Editar</button>`;
    }
    // Cancelar (admin/gerente sempre; vendedor até etapa 3)
    const podeCanc = ['admin','gerente_geral'].includes(currentUser.perfil) ||
      (currentUser.perfil === 'vendedor' && pedido.etapa_atual <= 3);
    if (podeCanc && pedido.status === 'ativo') {
      acoes += `<button class="btn btn-danger btn-sm" onclick="modalCancelarPedido(${pedido.id}, '${pedido.codigo}')">✕ Cancelar</button>`;
    }
    // Excluir permanentemente (admin, quando já cancelado)
    if (currentUser.perfil === 'admin' && pedido.status === 'cancelado') {
      acoes += `<button class="btn btn-danger btn-sm" onclick="modalExcluirPedido(${pedido.id}, '${pedido.codigo}')">🗑 Excluir</button>`;
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

    // Filtrar arquivos por visibilidade + excluir capa dos anexos
    const arquivosVisiveis = (pedido.arquivos || []).filter(a => {
      if (a.id === capaArquivo?.id) return false; // capa fica só no hero, não nos anexos
      if (isAdmin) return true;
      if (a.etapa === 3) return true; // aprovação: todos veem
      if (a.etapa === 4) {
        // Arte: arquivos separados por destino
        if (a.destino === 'impressao') return ['impressao','admin','gerente_geral'].includes(currentUser.perfil);
        if (a.destino === 'corte_costura') return ['corte','costura','admin','gerente_geral'].includes(currentUser.perfil);
        return currentUser.etapasVisiveis?.includes(5); // sem destino → só impressão (legado)
      }
      return currentUser.etapasVisiveis?.includes(a.etapa);
    });

    const arquivosHtml = arquivosVisiveis.length
      ? arquivosVisiveis.map(a => {
          const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(a.nome);
          const destinoBadge = a.destino === 'impressao'
            ? `<span class="arquivo-destino-badge destino-impressao">Impressão</span>`
            : a.destino === 'corte_costura'
            ? `<span class="arquivo-destino-badge destino-corte">Corte/Costura</span>`
            : '';
          return `
            <div class="arquivo-item">
              <span class="arquivo-icon">${isImg ? '🖼' : '📄'}</span>
              <div class="arquivo-info">
                <span class="arquivo-nome">${a.nome}</span>
                <div class="arquivo-meta">Etapa: ${ETAPAS_NOMES[a.etapa] || a.etapa} · ${formatDate(a.criado_em)}</div>
              </div>
              ${destinoBadge}
              <div class="arquivo-acoes">
                ${isImg
                  ? `<button onclick="abrirLightbox('${api.arquivos.url(a.id)}')">🔍 Ver</button>`
                  : `<a href="${api.arquivos.url(a.id)}" target="_blank">↗ Abrir</a>`}
                <a href="${api.arquivos.downloadUrl(a.id)}">⬇ Baixar</a>
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
        ? `<div class="pedido-hero" style="background-image:url('${api.arquivos.url(capaArquivo.id)}');cursor:zoom-in" onclick="abrirLightbox('${api.arquivos.url(capaArquivo.id)}')">
            <div class="pedido-hero-overlay" onclick="event.stopPropagation()">
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
            <button class="capa-ampliar-btn" onclick="event.stopPropagation();abrirLightbox('${api.arquivos.url(capaArquivo.id)}')" title="Ampliar imagem">⤢</button>
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

      ${pedido.urgente ? `<div class="urgente-banner">🔴 PEDIDO URGENTE</div>` : ''}
      ${['admin','gerente_geral','vendedor'].includes(currentUser.perfil) ? `
        <div style="margin-bottom:12px">
          <button class="btn ${pedido.urgente ? 'btn-danger' : 'btn-ghost'} btn-sm" onclick="toggleUrgente(${pedido.id})">
            ${pedido.urgente ? '🔴 Urgente — Clique para remover' : '+ Marcar como Urgente'}
          </button>
        </div>` : ''}

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

      ${!temItens && (pedido.dimensoes || pedido.material || pedido.cores) ? `
      <div class="info-row">
        ${pedido.dimensoes ? `<div class="info-item"><div class="info-label">Dimensões</div><div class="info-value">${pedido.dimensoes}</div></div>` : ''}
        ${pedido.material ? `<div class="info-item"><div class="info-label">Material</div><div class="info-value">${pedido.material}</div></div>` : ''}
        ${pedido.cores ? `<div class="info-item"><div class="info-label">Cores</div><div class="info-value">${pedido.cores}</div></div>` : ''}
      </div>` : ''}

      ${temItens ? (() => {
        const canManageItems = isAdmin && pedido.etapa_atual <= 3;
        const itensRows = (pedido.itens || []).map((item, idx) => {
          const etapaTag = tagEtapaItem(item.etapa_atual, item.status);
          const paraleloStatus = renderItemParaleloStatus(item);

          let itemAcoes = '';
          if (item.status !== 'concluido' && pedido.status === 'ativo') {
            const canOperarItem = currentUser.etapasOperar?.includes(item.etapa_atual) || isAdmin;
            if (canOperarItem) {
              if (item.etapa_atual === 5) {
                const isCorte = ['corte','admin','gerente_geral'].includes(currentUser.perfil);
                const isImpressao = ['impressao','admin','gerente_geral'].includes(currentUser.perfil);
                if (isCorte && !item.corte_ok)
                  itemAcoes += `<button class="btn btn-success btn-sm" style="font-size:10px;padding:3px 7px;margin:1px" onclick="avancarItemParalelo(${pedido.id}, ${item.id}, 'corte')">✂ Corte</button>`;
                if (isImpressao && !item.impressao_ok) {
                  if (item.precisa_solvente && !item.impressao_solvente_ok)
                    itemAcoes += `<button class="btn btn-success btn-sm" style="font-size:10px;padding:3px 7px;margin:1px" onclick="avancarItemParalelo(${pedido.id}, ${item.id}, 'solvente')">🖨 Solv</button>`;
                  if (item.precisa_uv && !item.impressao_uv_ok)
                    itemAcoes += `<button class="btn btn-success btn-sm" style="font-size:10px;padding:3px 7px;margin:1px" onclick="avancarItemParalelo(${pedido.id}, ${item.id}, 'uv')">🖨 UV</button>`;
                  if (!item.precisa_solvente && !item.precisa_uv)
                    itemAcoes += `<button class="btn btn-success btn-sm" style="font-size:10px;padding:3px 7px;margin:1px" onclick="avancarItemParalelo(${pedido.id}, ${item.id}, 'impressao')">🖨 Imp</button>`;
                }
              } else {
                itemAcoes += `<button class="btn btn-primary btn-sm" style="font-size:10px;padding:3px 8px" onclick="modalAvancarItem(${pedido.id}, ${item.id}, ${item.etapa_atual}, '${item.tipo}')">→</button>`;
              }
            }
            if (canManageItems)
              itemAcoes += `<button class="btn btn-danger btn-sm" style="font-size:10px;padding:3px 6px;margin:1px" onclick="confirmarRemoverItem(${pedido.id}, ${item.id})">✕</button>`;
          }

          const impressoraTag = item.impressora ? `<span style="font-size:10px;color:var(--text3);display:block">🖨 ${item.impressora}</span>` : '';

          return `
            <tr>
              <td style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">${idx + 1}</td>
              <td>${tagTipo(item.tipo)}</td>
              <td style="font-size:12px">${item.categoria || '—'}</td>
              <td style="font-family:var(--font-mono);font-size:11px">${item.dimensoes || '—'}</td>
              <td style="font-size:12px">${item.material || '—'}</td>
              <td style="font-size:11px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${item.cores || ''}">${item.cores || '—'}</td>
              <td style="text-align:center;font-family:var(--font-mono);font-size:12px">${item.quantidade}</td>
              <td>${etapaTag}${impressoraTag}${paraleloStatus}</td>
              <td style="white-space:nowrap">${itemAcoes || ''}</td>
            </tr>`;
        }).join('');

        const concluidos = (pedido.itens || []).filter(i => i.status === 'concluido').length;
        return `
          <hr class="divider">
          <div class="section-label" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <span>Itens do Pedido <span style="color:var(--text3);font-weight:400;font-size:12px">(${concluidos}/${pedido.itens.length} prontos)</span></span>
            ${canManageItems ? `<button class="btn btn-ghost btn-sm" onclick="fecharModalForce();setTimeout(()=>modalAdicionarItem(${pedido.id}),200)">+ Adicionar Item</button>` : ''}
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>#</th><th>Tipo</th><th>Categoria</th><th>Dimensões</th>
                <th>Material</th><th>Cores</th><th>Qtd</th><th>Etapa</th><th>Ações</th>
              </tr></thead>
              <tbody>${itensRows || '<tr><td colspan="9" style="text-align:center;color:var(--text3)">Nenhum item</td></tr>'}</tbody>
            </table>
          </div>`;
      })() : ''}

      ${(pedido.transportadora || pedido.codigo_rastreio) ? `
      <div class="info-row">
        <div class="section-label" style="grid-column:1/-1;margin-bottom:4px">🚚 Informações de Envio</div>
        ${pedido.transportadora ? `<div class="info-item"><div class="info-label">Transportadora</div><div class="info-value">${pedido.transportadora}</div></div>` : ''}
        ${pedido.codigo_rastreio ? `<div class="info-item"><div class="info-label">Código de Rastreio</div><div class="info-value" style="font-family:var(--font-mono)">${pedido.codigo_rastreio}</div></div>` : ''}
      </div>` : ''}

      <hr class="divider">
      <div class="section-label" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span>Arquivos</span>
        ${(canOperar || isAdmin) ? (
          pedido.etapa_atual === 4
            ? `<div style="display:flex;gap:6px">
                <label class="btn btn-ghost btn-sm" style="cursor:pointer;font-size:11px;font-weight:normal;color:var(--blue)" title="Arquivo visível apenas para Impressão">
                  🖨 Para Impressão
                  <input type="file" hidden onchange="uploadArquivo(${pedido.id}, this, 'impressao')" accept="image/*,.pdf,.ai,.eps,.psd,.zip,.rar">
                </label>
                <label class="btn btn-ghost btn-sm" style="cursor:pointer;font-size:11px;font-weight:normal;color:var(--orange)" title="Arquivo visível para Corte e Costura">
                  ✂ Para Corte/Costura
                  <input type="file" hidden onchange="uploadArquivo(${pedido.id}, this, 'corte_costura')" accept="image/*,.pdf,.ai,.eps,.psd,.zip,.rar">
                </label>
              </div>`
            : `<label class="btn btn-ghost btn-sm" style="cursor:pointer;font-size:12px;font-weight:normal">
                + Anexar
                <input type="file" hidden onchange="uploadArquivo(${pedido.id}, this)" accept="image/*,.pdf,.ai,.eps,.psd,.zip,.rar">
              </label>`
        ) : ''}
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
async function uploadArquivo(pedidoId, input, destino = null) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('arquivo', file);
  try {
    toast('Enviando arquivo...', 'info');
    await api.arquivos.upload(pedidoId, formData, destino);
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

function modalAvancar(id, etapaAtual, temItens = false) {
  const isArte = etapaAtual === 4 && !temItens; // Arte só para pedidos simples (sem itens)
  const isExpedicao = etapaAtual === 8;

  const body = `
    ${isArte ? `
    <div class="form-group">
      <label>Impressora *</label>
      <select id="imp-impressora" style="width:100%">
        <option value="">— Selecione a impressora —</option>
        ${(window.appConfig?.impressoras || [{nome:'Mimaki UV (100-160)'},{nome:'Mimaki Solvente (150-160)'}])
          .map(i => `<option value="${i.nome}">🖨️ ${i.nome}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Tratamento de impressão necessário</label>
      <div style="display:flex;gap:20px;margin-top:8px">
        <label class="checkbox-row"><input type="checkbox" id="imp-solvente"> Solvente</label>
        <label class="checkbox-row"><input type="checkbox" id="imp-uv"> UV</label>
      </div>
    </div>` : ''}
    ${isExpedicao ? `
    <div class="form-group">
      <label>Transportadora <span style="color:var(--text3);font-weight:400;font-size:11px">(opcional)</span></label>
      <input type="text" id="exp-transportadora" placeholder="Nome da transportadora ou entrega própria">
    </div>
    <div class="form-group">
      <label>Código de Rastreio <span style="color:var(--text3);font-weight:400;font-size:11px">(opcional)</span></label>
      <input type="text" id="exp-rastreio" placeholder="Código de rastreamento">
    </div>` : ''}
    <div class="form-group">
      <label>Observação (opcional)</label>
      <textarea id="obs-avancar" placeholder="${isExpedicao ? 'Informações adicionais sobre a entrega...' : 'Observação para a próxima etapa...'}"></textarea>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-success" onclick="confirmarAvancar(${id}, ${etapaAtual}, ${temItens})">
      ${isExpedicao ? '🚚 Confirmar Expedição' : '→ Confirmar Avanço'}
    </button>
  `;
  abrirModal(isExpedicao ? 'Expedir Pedido' : 'Avançar Etapa', body, footer);
}

async function confirmarAvancar(id, etapaAtual, temItens = false) {
  const obs = document.getElementById('obs-avancar')?.value;
  const dados = { observacao: obs };
  if (etapaAtual === 4 && !temItens) {
    const impressora = document.getElementById('imp-impressora')?.value;
    if (!impressora) { toast('Selecione a impressora antes de avançar.', 'error'); return; }
    dados.impressora = impressora;
    dados.precisa_solvente = document.getElementById('imp-solvente')?.checked;
    dados.precisa_uv = document.getElementById('imp-uv')?.checked;
  }
  if (etapaAtual === 8) {
    dados.transportadora = document.getElementById('exp-transportadora')?.value;
    dados.codigo_rastreio = document.getElementById('exp-rastreio')?.value;
  }
  try {
    const res = await api.pedidos.avancar(id, dados);
    toast(res.mensagem, 'success');
    fecharModalForce();
    carregarPedidos();
    if (etapaAtual !== 8) setTimeout(() => abrirFichaPedido(id), 300);
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

// ── CANCELAR / EXCLUIR PEDIDO ─────────────────────────────────────
function modalCancelarPedido(id, codigo) {
  const body = `
    <p style="color:var(--text2);margin-bottom:16px">O pedido <strong>${codigo}</strong> será marcado como cancelado. Esta ação pode ser revertida por um administrador.</p>
    <div class="form-group">
      <label>Motivo do Cancelamento *</label>
      <textarea id="cancel-motivo" placeholder="Informe o motivo (ex: cliente desistiu, orçamento não aprovado...)"></textarea>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Voltar</button>
    <button class="btn btn-danger" onclick="confirmarCancelar(${id})">✕ Confirmar Cancelamento</button>
  `;
  abrirModal('Cancelar Pedido', body, footer);
}

async function toggleUrgente(id) {
  try {
    const res = await api.pedidos.toggleUrgente(id);
    toast(res.mensagem, res.urgente ? 'error' : 'success');
    fecharModalForce();
    setTimeout(() => abrirFichaPedido(id), 200);
    carregarPedidos();
  } catch (e) { toast(e.message, 'error'); }
}

async function confirmarCancelar(id) {
  const motivo = document.getElementById('cancel-motivo')?.value?.trim();
  if (!motivo) { toast('Informe o motivo do cancelamento', 'error'); return; }
  try {
    await api.pedidos.cancelar(id, motivo);
    toast('Pedido cancelado', 'success');
    fecharModalForce();
    carregarPedidos();
  } catch (e) { toast(e.message, 'error'); }
}

function modalExcluirPedido(id, codigo) {
  const body = `
    <div style="text-align:center;padding:8px 0">
      <div style="font-size:40px;margin-bottom:12px">⚠️</div>
      <p style="color:var(--text1);font-size:15px;font-weight:600">Excluir permanentemente?</p>
      <p style="color:var(--text2);font-size:13px;margin-top:8px">O pedido <strong>${codigo}</strong> e todo seu histórico serão removidos do banco de dados. <strong>Esta ação não pode ser desfeita.</strong></p>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-danger" onclick="confirmarExcluir(${id})">🗑 Excluir Definitivamente</button>
  `;
  abrirModal('Excluir Pedido', body, footer);
}

async function confirmarExcluir(id) {
  try {
    await api.pedidos.deletar(id);
    toast('Pedido excluído permanentemente', 'success');
    fecharModalForce();
    carregarPedidos();
  } catch (e) { toast(e.message, 'error'); }
}

// ── BUSCA DE CLIENTES (searchable dropdown) ───────────────────────
let _npClientes = [];

function npFiltrarClientes() {
  const q = (document.getElementById('np-cliente-search')?.value || '').toLowerCase();
  const opts = document.getElementById('np-cliente-opts');
  if (!opts) return;
  const lista = q ? _npClientes.filter(c =>
    c.razao_social.toLowerCase().includes(q) ||
    (c.nome_fantasia || '').toLowerCase().includes(q) ||
    (c.cnpj_cpf || '').includes(q)
  ) : _npClientes;
  opts.innerHTML =
    `<div class="searchable-opt" onmousedown="npSelecionarCliente('','')">— Nenhum cliente —</div>` +
    lista.map(c => `<div class="searchable-opt" onmousedown="npSelecionarCliente('${c.id}','${c.razao_social.replace(/'/g,"\\'")}')">
      <span>${c.razao_social}</span>
      ${c.nome_fantasia ? `<span style="color:var(--text3);font-size:11px;margin-left:6px">${c.nome_fantasia}</span>` : ''}
    </div>`).join('');
  opts.style.display = 'block';
}

function npFecharDropdownCliente() {
  const opts = document.getElementById('np-cliente-opts');
  if (opts) opts.style.display = 'none';
}

function npSelecionarCliente(id, nome) {
  const inp = document.getElementById('np-cliente-search');
  const hid = document.getElementById('np-cliente-id');
  if (inp) inp.value = nome || '';
  if (hid) hid.value = id || '';
  npFecharDropdownCliente();
}

// ── HELPERS DE ITEM ───────────────────────────────────────────────
function tagEtapaItem(etapa, status) {
  if (status === 'concluido') return '<span class="tag tag-green" style="font-size:11px">✅ Pronto</span>';
  const map = {
    4: '<span class="tag tag-blue" style="font-size:11px">🎨 Arte</span>',
    5: '<span class="tag tag-orange" style="font-size:11px">🖨 Impressão/Corte</span>',
    6: '<span class="tag" style="font-size:11px;background:rgba(130,80,200,0.18);color:#a060d0">🧵 Costura</span>',
    7: '<span class="tag tag-yellow" style="font-size:11px">⚙️ Motor</span>',
  };
  return map[etapa] || `<span class="tag" style="font-size:11px">Etapa ${etapa}</span>`;
}

function renderItemParaleloStatus(item) {
  if (item.etapa_atual !== 5 && item.status !== 'concluido') return '';
  const c = item.corte_ok ? '<span style="color:var(--green);font-size:10px">✂✓</span>' : '<span style="color:var(--text3);font-size:10px">✂?</span>';
  const p = item.impressao_ok ? '<span style="color:var(--green);font-size:10px"> 🖨✓</span>' : '<span style="color:var(--text3);font-size:10px"> 🖨?</span>';
  return `<div style="display:flex;gap:2px;margin-top:2px">${c}${p}</div>`;
}

// ── ITEM: AVANÇAR ─────────────────────────────────────────────────
function modalAvancarItem(pedidoId, itemId, etapaAtual, tipoItem) {
  const isArte = etapaAtual === 4;
  const nomeEtapa = { 4: 'Arte', 6: 'Costura', 7: 'Motor' }[etapaAtual] || `Etapa ${etapaAtual}`;

  const body = `
    ${isArte ? `
    <div class="form-group">
      <label>Impressora *</label>
      <select id="ai-impressora" style="width:100%">
        <option value="">— Selecione a impressora —</option>
        ${(window.appConfig?.impressoras || [{nome:'Mimaki UV (100-160)'},{nome:'Mimaki Solvente (150-160)'}])
          .map(i => `<option value="${i.nome}">🖨️ ${i.nome}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Tratamento de impressão</label>
      <div style="display:flex;gap:20px;margin-top:8px">
        <label class="checkbox-row"><input type="checkbox" id="ai-solvente"> Solvente</label>
        <label class="checkbox-row"><input type="checkbox" id="ai-uv"> UV</label>
      </div>
    </div>` : ''}
    <div class="form-group">
      <label>Observação (opcional)</label>
      <textarea id="ai-obs" placeholder="Informação adicional..."></textarea>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-success" onclick="confirmarAvancarItem(${pedidoId}, ${itemId}, ${etapaAtual})">
      ${isArte ? '🖨 Arte Pronta → Impressão' : `→ ${nomeEtapa} Pronto`}
    </button>
  `;
  abrirModal(`Avançar Item — ${nomeEtapa}`, body, footer);
}

async function confirmarAvancarItem(pedidoId, itemId, etapaAtual) {
  const dados = { observacao: document.getElementById('ai-obs')?.value };
  if (etapaAtual === 4) {
    const impressora = document.getElementById('ai-impressora')?.value;
    if (!impressora) { toast('Selecione a impressora antes de avançar.', 'error'); return; }
    dados.impressora = impressora;
    dados.precisa_solvente = document.getElementById('ai-solvente')?.checked;
    dados.precisa_uv = document.getElementById('ai-uv')?.checked;
  }
  try {
    const res = await api.pedidos.avancarItem(pedidoId, itemId, dados);
    toast(res.mensagem, 'success');
    fecharModalForce();
    setTimeout(() => abrirFichaPedido(pedidoId), 300);
    carregarPedidos();
  } catch (e) { toast(e.message, 'error'); }
}

async function avancarItemParalelo(pedidoId, itemId, fila) {
  try {
    const res = await api.pedidos.avancarItem(pedidoId, itemId, { fila });
    toast(res.mensagem, 'success');
    fecharModalForce();
    setTimeout(() => abrirFichaPedido(pedidoId), 300);
    carregarPedidos();
  } catch (e) { toast(e.message, 'error'); }
}

// ── ITEM: ADICIONAR A PEDIDO EXISTENTE ───────────────────────────
function modalAdicionarItem(pedidoId) {
  const body = `
    <div class="form-grid">
      <div class="form-group">
        <label>Tipo *</label>
        <select id="mai-tipo" onchange="maiUpdateCampos()">
          <option value="INF">Inflável</option>
          <option value="LON">Lona</option>
          <option value="ADH">Adesivo</option>
          <option value="PLC">Placa</option>
          <option value="BAQ">Balão AR</option>
        </select>
      </div>
      <div class="form-group" id="mai-categoria-group">
        <label>Categoria</label>
        <select id="mai-categoria"></select>
      </div>
      <div class="form-group">
        <label>Material</label>
        <select id="mai-material"></select>
      </div>
      <div class="form-group">
        <label>Dimensões</label>
        <input type="text" id="mai-dimensoes" placeholder="ex: 3m x 2m">
      </div>
      <div class="form-group">
        <label>Cores</label>
        <input type="text" id="mai-cores" placeholder="ex: Vermelho, Azul Omni">
      </div>
      <div class="form-group">
        <label>Quantidade</label>
        <input type="number" id="mai-quantidade" value="1" min="1">
      </div>
      <div class="form-group span2">
        <label>Descrição do item</label>
        <input type="text" id="mai-descricao" placeholder="Descrição específica deste item (opcional)">
      </div>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-primary" onclick="confirmarAdicionarItem(${pedidoId})">+ Adicionar Item</button>
  `;
  abrirModal('Adicionar Item ao Pedido', body, footer);
  setTimeout(maiUpdateCampos, 0);
}

function maiUpdateCampos() {
  const tipo = document.getElementById('mai-tipo')?.value;
  if (!tipo) return;
  const cfgCats = window.appConfig?.produtoCategorias || {};
  const cats = cfgCats[tipo] ?? NP_CATEGORIAS[tipo] ?? [];
  const catEl = document.getElementById('mai-categoria');
  const catGrp = document.getElementById('mai-categoria-group');
  if (catEl) {
    catEl.innerHTML = cats.length ? cats.map(c => `<option value="${c}">${c}</option>`).join('') : '<option value="">— Não aplicável —</option>';
    catEl.disabled = cats.length === 0;
    if (catGrp) catGrp.style.display = cats.length ? '' : 'none';
  }
  const cfgMats = window.appConfig?.produtoMateriais || {};
  const mats = cfgMats[tipo] ?? NP_MATERIAIS[tipo] ?? [];
  const matEl = document.getElementById('mai-material');
  if (matEl) {
    matEl.innerHTML = mats.length ? mats.map(m => `<option value="${m}">${m}</option>`).join('') : '<option value="">— Não aplicável —</option>';
    matEl.disabled = mats.length === 0;
  }
}

async function confirmarAdicionarItem(pedidoId) {
  const tipo = document.getElementById('mai-tipo')?.value;
  if (!tipo) { toast('Selecione o tipo', 'error'); return; }
  const dados = {
    tipo,
    categoria: document.getElementById('mai-categoria')?.value || null,
    material: document.getElementById('mai-material')?.value || null,
    dimensoes: document.getElementById('mai-dimensoes')?.value || null,
    cores: document.getElementById('mai-cores')?.value || null,
    quantidade: parseInt(document.getElementById('mai-quantidade')?.value) || 1,
    descricao: document.getElementById('mai-descricao')?.value || null,
  };
  try {
    await api.pedidos.adicionarItem(pedidoId, dados);
    toast('Item adicionado!', 'success');
    fecharModalForce();
    setTimeout(() => abrirFichaPedido(pedidoId), 300);
  } catch (e) { toast(e.message, 'error'); }
}

async function confirmarRemoverItem(pedidoId, itemId) {
  if (!confirm('Remover este item do pedido?')) return;
  try {
    await api.pedidos.removerItem(pedidoId, itemId);
    toast('Item removido', 'success');
    fecharModalForce();
    setTimeout(() => abrirFichaPedido(pedidoId), 300);
  } catch (e) { toast(e.message, 'error'); }
}

// ── CATÁLOGOS ─────────────────────────────────────────────────────
const NP_CATEGORIAS = {
  INF: ['Tenda Casa', 'Tenda Padrão', 'Tenda Aranha', 'Portal', 'Roof Top', '3D', 'Colchão', 'Túnel'],
  LON: [], ADH: [], PLC: [],
};
const NP_MATERIAIS = {
  INF: ['Nylon'],
  LON: ['Lona'],
  ADH: ['Transparente', 'Branco', 'Lux'],
  PLC: ['2mm', '1mm'],
};
const NP_CORES = ['Vermelho', 'Azul Omni', 'Azul 388C', 'Verde Maçã', 'Branco', 'Verde Bandeira', 'Laranja'];

function npAtualizarCampos() {
  const tipo = document.getElementById('np-tipo')?.value;
  // Categoria (usa appConfig se disponível, senão fallback hardcoded)
  const cfgCats = window.appConfig?.produtoCategorias || {};
  const cats = cfgCats[tipo] ?? NP_CATEGORIAS[tipo] ?? [];
  const catEl = document.getElementById('np-categoria');
  if (catEl) {
    catEl.innerHTML = cats.length
      ? cats.map(c => `<option value="${c}">${c}</option>`).join('')
      : '<option value="">— Não aplicável —</option>';
    catEl.disabled = cats.length === 0;
    catEl.closest('.form-group').style.display = cats.length ? '' : 'none';
  }
  // Material (usa appConfig se disponível, senão fallback hardcoded)
  const cfgMats = window.appConfig?.produtoMateriais || {};
  const mats = cfgMats[tipo] ?? NP_MATERIAIS[tipo] ?? [];
  const matEl = document.getElementById('np-material');
  if (matEl) {
    matEl.innerHTML = mats.length
      ? mats.map(m => `<option value="${m}">${m}</option>`).join('')
      : '<option value="">— Não aplicável —</option>';
    matEl.disabled = mats.length === 0;
    matEl.closest('.form-group').style.display = mats.length ? '' : 'none';
  }
}

function npToggleNovoCliente() {
  const form = document.getElementById('np-novo-cliente-form');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function npCriarCliente() {
  const razao = document.getElementById('nc-razao')?.value?.trim();
  if (!razao) { toast('Informe a Razão Social', 'error'); return; }
  const dados = {
    razao_social: razao,
    nome_fantasia: document.getElementById('nc-fantasia')?.value || null,
    cnpj_cpf: document.getElementById('nc-cnpj')?.value || null,
    ie: document.getElementById('nc-ie')?.value || null,
    im: document.getElementById('nc-im')?.value || null,
    telefone: document.getElementById('nc-telefone')?.value || null,
    email: document.getElementById('nc-email')?.value || null,
    cidade: document.getElementById('nc-cidade')?.value || null,
    estado: document.getElementById('nc-estado')?.value || null,
    endereco: document.getElementById('nc-endereco')?.value || null,
    observacoes: document.getElementById('nc-obs')?.value || null,
  };
  try {
    const res = await api.clientes.criar(dados);
    // Adiciona ao cache e seleciona no searchable dropdown
    _npClientes.push({ id: res.id, razao_social: razao, nome_fantasia: dados.nome_fantasia });
    npSelecionarCliente(String(res.id), razao);
    toast(`Cliente "${razao}" criado e selecionado!`, 'success');
    npToggleNovoCliente();
  } catch (e) { toast(e.message, 'error'); }
}

// ── NOVO PEDIDO (com itens) ────────────────────────────────────────
let _npItemSeq = 0;

function npItemCard(seq) {
  const tipos = ['INF','LON','ADH','PLC','BAQ'];
  const tipoOpts = tipos.map(t => `<option value="${t}">${TIPO_LABELS[t] || t}</option>`).join('');
  return `
    <div class="np-item-card" id="np-item-card-${seq}" data-seq="${seq}" style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:13px;font-weight:600;color:var(--accent)">Item #<span class="np-item-num"></span></span>
        <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px;color:var(--red)" onclick="npRemoveItem(${seq})">✕ Remover</button>
      </div>
      <div class="form-grid" style="gap:10px">
        <div class="form-group">
          <label style="font-size:11px">Tipo *</label>
          <select id="np-item-tipo-${seq}" onchange="npItemUpdateCampos(${seq})">${tipoOpts}</select>
        </div>
        <div class="form-group" id="np-item-cat-grp-${seq}">
          <label style="font-size:11px">Categoria</label>
          <select id="np-item-categoria-${seq}"></select>
        </div>
        <div class="form-group">
          <label style="font-size:11px">Material</label>
          <select id="np-item-material-${seq}"></select>
        </div>
        <div class="form-group">
          <label style="font-size:11px">Dimensões</label>
          <input type="text" id="np-item-dimensoes-${seq}" placeholder="ex: 3m × 2m">
        </div>
        <div class="form-group">
          <label style="font-size:11px">Cores</label>
          <input type="text" id="np-item-cores-${seq}" placeholder="ex: Vermelho, Azul Omni">
        </div>
        <div class="form-group">
          <label style="font-size:11px">Quantidade</label>
          <input type="number" id="np-item-quantidade-${seq}" value="1" min="1" style="width:80px">
        </div>
        <div class="form-group span2">
          <label style="font-size:11px">Descrição do item <span style="color:var(--text3);font-weight:400">(opcional)</span></label>
          <input type="text" id="np-item-descricao-${seq}" placeholder="Observações específicas deste item...">
        </div>
      </div>
    </div>
  `;
}

function npAddItem() {
  _npItemSeq++;
  const seq = _npItemSeq;
  const list = document.getElementById('np-itens-list');
  if (!list) return;
  const div = document.createElement('div');
  div.innerHTML = npItemCard(seq);
  list.appendChild(div.firstElementChild);
  npItemUpdateCampos(seq);
  npRenumberItems();
  const empty = document.getElementById('np-itens-empty');
  if (empty) empty.style.display = 'none';
}

function npRemoveItem(seq) {
  document.getElementById(`np-item-card-${seq}`)?.remove();
  npRenumberItems();
  const remaining = document.querySelectorAll('.np-item-card').length;
  const empty = document.getElementById('np-itens-empty');
  if (empty) empty.style.display = remaining === 0 ? '' : 'none';
}

function npRenumberItems() {
  document.querySelectorAll('.np-item-card').forEach((card, idx) => {
    const numEl = card.querySelector('.np-item-num');
    if (numEl) numEl.textContent = idx + 1;
  });
}

function npItemUpdateCampos(seq) {
  const tipo = document.getElementById(`np-item-tipo-${seq}`)?.value;
  if (!tipo) return;
  const cfgCats = window.appConfig?.produtoCategorias || {};
  const cats = cfgCats[tipo] ?? NP_CATEGORIAS[tipo] ?? [];
  const catEl = document.getElementById(`np-item-categoria-${seq}`);
  const catGrp = document.getElementById(`np-item-cat-grp-${seq}`);
  if (catEl) {
    catEl.innerHTML = cats.length ? cats.map(c => `<option value="${c}">${c}</option>`).join('') : '<option value="">— Não aplicável —</option>';
    catEl.disabled = cats.length === 0;
    if (catGrp) catGrp.style.display = cats.length ? '' : 'none';
  }
  const cfgMats = window.appConfig?.produtoMateriais || {};
  const mats = cfgMats[tipo] ?? NP_MATERIAIS[tipo] ?? [];
  const matEl = document.getElementById(`np-item-material-${seq}`);
  if (matEl) {
    matEl.innerHTML = mats.length ? mats.map(m => `<option value="${m}">${m}</option>`).join('') : '<option value="">— Não aplicável —</option>';
    matEl.disabled = mats.length === 0;
  }
}

function npGetItems() {
  return Array.from(document.querySelectorAll('.np-item-card')).map(card => {
    const seq = card.dataset.seq;
    return {
      tipo: document.getElementById(`np-item-tipo-${seq}`)?.value,
      categoria: document.getElementById(`np-item-categoria-${seq}`)?.value || null,
      material: document.getElementById(`np-item-material-${seq}`)?.value || null,
      dimensoes: document.getElementById(`np-item-dimensoes-${seq}`)?.value || null,
      cores: document.getElementById(`np-item-cores-${seq}`)?.value || null,
      quantidade: parseInt(document.getElementById(`np-item-quantidade-${seq}`)?.value) || 1,
      descricao: document.getElementById(`np-item-descricao-${seq}`)?.value || null,
    };
  }).filter(it => it.tipo);
}

async function modalNovoPedido() {
  let clientes = [];
  try { clientes = await api.clientes.listar(); } catch {}
  _npClientes = clientes;
  _npItemSeq = 0;

  const body = `
    <div class="form-grid">
      <div class="form-group span2">
        <label>Cliente</label>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="searchable-select-wrap" style="flex:1">
            <input type="text" id="np-cliente-search" placeholder="🔍 Buscar cliente pelo nome ou CNPJ..."
              autocomplete="off"
              oninput="npFiltrarClientes()"
              onfocus="npFiltrarClientes()"
              onblur="setTimeout(npFecharDropdownCliente, 150)">
            <input type="hidden" id="np-cliente-id">
            <div class="searchable-opts" id="np-cliente-opts" style="display:none"></div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="npToggleNovoCliente()" style="white-space:nowrap;flex-shrink:0">+ Novo Cliente</button>
        </div>
      </div>

      <!-- Formulário inline de novo cliente -->
      <div id="np-novo-cliente-form" style="display:none;grid-column:1/-1;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:4px">
        <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:12px">📋 Cadastrar Novo Cliente</div>
        <div class="form-grid">
          <div class="form-group"><label>Razão Social *</label><input type="text" id="nc-razao" placeholder="Razão social da empresa"></div>
          <div class="form-group"><label>Nome Fantasia</label><input type="text" id="nc-fantasia"></div>
          <div class="form-group"><label>CNPJ / CPF</label><input type="text" id="nc-cnpj" placeholder="00.000.000/0001-00"></div>
          <div class="form-group"><label>IE</label><input type="text" id="nc-ie"></div>
          <div class="form-group"><label>IM</label><input type="text" id="nc-im"></div>
          <div class="form-group"><label>Telefone</label><input type="text" id="nc-telefone" placeholder="(00) 00000-0000"></div>
          <div class="form-group"><label>E-mail</label><input type="email" id="nc-email"></div>
          <div class="form-group"><label>Cidade</label><input type="text" id="nc-cidade"></div>
          <div class="form-group"><label>Estado</label><input type="text" id="nc-estado" placeholder="SP" maxlength="2"></div>
          <div class="form-group span2"><label>Endereço</label><input type="text" id="nc-endereco"></div>
          <div class="form-group span2"><label>Observações</label><textarea id="nc-obs" style="height:60px"></textarea></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
          <button type="button" class="btn btn-ghost btn-sm" onclick="npToggleNovoCliente()">Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="npCriarCliente()">✓ Criar e Selecionar</button>
        </div>
      </div>

      <div class="form-group span2">
        <label>Descrição do Pedido *</label>
        <textarea id="np-descricao" placeholder="Finalidade, evento, observações gerais do pedido..."></textarea>
      </div>
      <div class="form-group">
        <label>Prazo de Entrega</label>
        <input type="date" id="np-prazo">
      </div>
      <div class="form-group">
        <label>Valor do Orçamento (R$)</label>
        <input type="number" id="np-valor" placeholder="0,00" step="0.01">
      </div>

      <!-- Itens -->
      <div style="grid-column:1/-1;margin-top:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <label style="margin:0;font-size:13px;font-weight:600">Itens do Pedido *</label>
          <button type="button" class="btn btn-primary btn-sm" onclick="npAddItem()">+ Adicionar Item</button>
        </div>
        <div id="np-itens-list"></div>
        <div id="np-itens-empty" style="text-align:center;padding:20px;color:var(--text3);font-size:13px;border:2px dashed var(--border);border-radius:10px">
          Clique em <strong>"+ Adicionar Item"</strong> para incluir os produtos deste pedido
        </div>
      </div>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-primary" onclick="confirmarNovoPedido()">Criar Pedido</button>
  `;
  abrirModal('Novo Pedido', body, footer, 'modal-lg');
}

async function confirmarNovoPedido() {
  const itens = npGetItems();
  if (itens.length === 0) { toast('Adicione pelo menos um item ao pedido', 'error'); return; }
  const descricao = document.getElementById('np-descricao').value.trim();
  if (!descricao) { toast('Preencha a descrição do pedido', 'error'); return; }

  const dados = {
    cliente_id: document.getElementById('np-cliente-id')?.value || null,
    descricao,
    prazo: document.getElementById('np-prazo').value,
    valor_orcamento: document.getElementById('np-valor').value || null,
    itens,
  };
  try {
    const res = await api.pedidos.criar(dados);
    toast(`Pedido ${res.codigo} criado com ${itens.length} item(s)!`, 'success');
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
