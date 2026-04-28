async function renderDashboard() {
  try {
    const data = await api.dashboard();
    const perfil = currentUser.perfil;

    if (['admin', 'gerente_geral'].includes(perfil)) {
      _renderDashboardAdmin(data);
    } else if (perfil === 'vendedor') {
      _renderDashboardVendedor(data);
    } else {
      _renderDashboardProducao(data);
    }
  } catch (e) {
    document.getElementById('content').innerHTML =
      `<div class="empty-state"><div class="empty-icon">⚠</div><div class="empty-text">Erro ao carregar dashboard: ${e.message}</div></div>`;
  }
}

// ── ADMIN / GERENTE ───────────────────────────────────────────────────────────
function _renderDashboardAdmin(data) {
  const alertKpis = `
    <div class="kpi-grid" style="margin-bottom:10px">
      <div class="kpi-card red" style="cursor:pointer" onclick="navigate('pedidos')">
        <div class="kpi-label">🔴 Urgentes</div>
        <div class="kpi-value">${data.totalUrgentes ?? 0}</div>
        <div class="kpi-sub">pedidos marcados</div>
      </div>
      <div class="kpi-card red" style="cursor:pointer" onclick="navigate('pedidos')">
        <div class="kpi-label">⛔ Vencidos</div>
        <div class="kpi-value">${data.totalVencidos ?? 0}</div>
        <div class="kpi-sub">prazo expirado</div>
      </div>
      <div class="kpi-card orange" style="cursor:pointer" onclick="navigate('pedidos')">
        <div class="kpi-label">⚠ Prazo Próximo</div>
        <div class="kpi-value">${data.totalPrazoProx ?? 0}</div>
        <div class="kpi-sub">dentro de 3 dias</div>
      </div>
      <div class="kpi-card yellow" style="cursor:pointer" onclick="navigate('suprimentos')">
        <div class="kpi-label">📦 Suprimentos</div>
        <div class="kpi-value">${data.supPendentes ?? 0}</div>
        <div class="kpi-sub">pedidos pendentes</div>
      </div>
    </div>`;

  const mainKpis = `
    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card yellow">
        <div class="kpi-label">Pedidos Ativos</div>
        <div class="kpi-value">${data.totalAtivos}</div>
        <div class="kpi-sub">em produção</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Clientes</div>
        <div class="kpi-value">${data.totalClientes}</div>
        <div class="kpi-sub">cadastrados</div>
      </div>
      <div class="kpi-card blue">
        <div class="kpi-label">Usuários</div>
        <div class="kpi-value">${data.totalUsuarios}</div>
        <div class="kpi-sub">ativos no sistema</div>
      </div>
    </div>`;

  const pipelineSteps = (data.porEtapa || []).map(e => `
    <div class="pipeline-step" onclick="navigate('pedidos', {etapa: ${e.etapa}})">
      <div class="pipeline-step-num">${e.etapa}</div>
      <div class="pipeline-step-count">${e.total}</div>
      <div class="pipeline-step-name">${e.nome}</div>
    </div>`).join('');

  // Alertas lado a lado
  const urgentesHtml = (data.urgentes || []).length ? data.urgentes.map(p => `
    <div class="alert-item" onclick="navigate('pedidos', {open: ${p.id}})" style="cursor:pointer">
      <span class="badge-urgente">🔴 URGENTE</span>
      <span style="font-family:var(--font-mono);font-size:12px;color:var(--accent)">${p.codigo}</span>
      <span style="color:var(--text2);font-size:13px">${p.cliente_nome || '—'}</span>
      ${tagEtapa(p.etapa_atual)}
    </div>`).join('') : `<div style="color:var(--text3);font-size:13px;padding:12px 0">Nenhum pedido urgente</div>`;

  const prazoHtml = (data.prazoProximo || []).length ? data.prazoProximo.map(p => {
    const dias = diasAtePrazo(p.prazo);
    const cor = dias < 0 ? 'var(--red)' : 'var(--orange)';
    const label = dias < 0 ? `Vencido há ${Math.abs(dias)}d` : dias === 0 ? 'Vence hoje' : `${dias}d restante${dias > 1 ? 's' : ''}`;
    return `
    <div class="alert-item" onclick="navigate('pedidos', {open: ${p.id}})" style="cursor:pointer">
      <span style="font-size:11px;font-weight:700;color:${cor};white-space:nowrap">⚠ ${label}</span>
      <span style="font-family:var(--font-mono);font-size:12px;color:var(--accent)">${p.codigo}</span>
      <span style="color:var(--text2);font-size:13px">${p.cliente_nome || '—'}</span>
      ${tagEtapa(p.etapa_atual)}
    </div>`;
  }).join('') : `<div style="color:var(--text3);font-size:13px;padding:12px 0">Nenhum prazo crítico</div>`;

  const recentRows = (data.recentes || []).map(p => `
    <tr onclick="navigate('pedidos', {open: ${p.id}})" style="cursor:pointer${p.urgente ? ';border-left:3px solid var(--red)' : ''}">
      <td><span style="font-family:var(--font-mono);font-size:12px">${p.codigo}</span>${p.urgente ? ' <span class="badge-urgente" style="font-size:9px">URGENTE</span>' : ''}</td>
      <td>${tagTipo(p.tipo)}</td>
      <td>${p.cliente_nome || '—'}</td>
      <td>${tagEtapa(p.etapa_atual)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${formatDate(p.atualizado_em)}</td>
    </tr>`).join('');

  document.getElementById('topbar-actions').innerHTML =
    `<button class="btn btn-ghost btn-sm" onclick="renderDashboard()">↻ Atualizar</button>`;

  document.getElementById('content').innerHTML = `
    ${alertKpis}
    ${mainKpis}
    <div style="margin-bottom:20px">
      <div class="section-label">Pipeline de Produção — clique para filtrar</div>
      <div class="pipeline">${pipelineSteps}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div class="card">
        <div class="card-header"><div class="card-title">🔴 Pedidos Urgentes</div></div>
        <div style="padding:0 16px 8px">${urgentesHtml}</div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">⚠ Prazos Críticos</div></div>
        <div style="padding:0 16px 8px">${prazoHtml}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <div class="card-title">Movimentações Recentes</div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('pedidos')">Ver todos →</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Código</th><th>Tipo</th><th>Cliente</th><th>Etapa Atual</th><th>Atualizado</th></tr></thead>
          <tbody>${recentRows || '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text3)">Nenhum pedido ainda</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

// ── VENDEDOR ─────────────────────────────────────────────────────────────────
function _renderDashboardVendedor(data) {
  const mp = data.meusPedidos || { total: 0, aguardando: 0, urgentes: 0, concluidos: 0, lista: [] };

  const kpis = `
    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card blue">
        <div class="kpi-label">Meus Pedidos</div>
        <div class="kpi-value">${mp.total}</div>
        <div class="kpi-sub">no total</div>
      </div>
      <div class="kpi-card yellow">
        <div class="kpi-label">⏳ Aguardando</div>
        <div class="kpi-value">${mp.aguardando}</div>
        <div class="kpi-sub">aguardando aprovação</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label">🔴 Urgentes</div>
        <div class="kpi-value">${mp.urgentes}</div>
        <div class="kpi-sub">marcados como urgente</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">✅ Concluídos</div>
        <div class="kpi-value">${mp.concluidos}</div>
        <div class="kpi-sub">entregues</div>
      </div>
    </div>`;

  const listaHtml = mp.lista.length ? mp.lista.map(p => {
    const badges = tagsBadges(p);
    return `
      <div class="fila-card${p.urgente ? ' fila-card-urgente' : ''}" onclick="navigate('pedidos', {open: ${p.id}})" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--accent)">${p.codigo}</span>
          ${tagTipo(p.tipo)}
          ${tagEtapa(p.etapa_atual)}
          ${badges}
        </div>
        <div style="margin-top:4px;font-size:13px;color:var(--text2)">${p.cliente_nome || '—'}</div>
        ${p.prazo ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">Prazo: ${formatDate(p.prazo)}</div>` : ''}
      </div>`;
  }).join('') : `<div class="empty-state" style="padding:32px"><div class="empty-icon">📋</div><div class="empty-text">Nenhum pedido ativo</div></div>`;

  document.getElementById('topbar-actions').innerHTML =
    `<button class="btn btn-primary btn-sm" onclick="modalNovoPedido()">+ Novo Pedido</button>`;

  document.getElementById('content').innerHTML = `
    <div style="margin-bottom:8px">
      <div style="font-size:20px;font-weight:700;color:var(--text1)">Olá, ${currentUser.nome?.split(' ')[0] || 'Vendedor'} 👋</div>
      <div style="font-size:13px;color:var(--text3);margin-top:2px">Acompanhe seus pedidos e crie novos</div>
    </div>
    ${kpis}
    <div class="card">
      <div class="card-header">
        <div class="card-title">Meus Pedidos Ativos</div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('pedidos')">Ver todos →</button>
      </div>
      <div style="padding:8px 12px 12px;display:flex;flex-direction:column;gap:8px">${listaHtml}</div>
    </div>`;
}

// ── PRODUÇÃO / DESIGNER / MOLDES ─────────────────────────────────────────────
function _renderDashboardProducao(data) {
  const perfil = currentUser.perfil;
  const mf = data.minhaFila || { total: 0, urgentes: 0, etapas: [], lista: [] };
  const isDesigner = ['designer', 'moldes'].includes(perfil);

  const PERFIL_LABEL = {
    impressao: 'Impressão', corte: 'Corte', costura: 'Costura',
    motor: 'Motor', expedicao: 'Expedição', designer: 'Design', moldes: 'Moldes',
  };
  const setorLabel = PERFIL_LABEL[perfil] || perfil;

  // Hero stat
  const heroBg = mf.urgentes > 0 ? 'var(--red-dim)' : mf.total > 0 ? 'var(--yellow-dim)' : 'var(--bg2)';
  const heroColor = mf.urgentes > 0 ? 'var(--red)' : mf.total > 0 ? 'var(--yellow)' : 'var(--text3)';

  const hero = `
    <div style="background:${heroBg};border:1px solid ${heroColor};border-radius:12px;padding:28px 32px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div>
        <div style="font-size:13px;color:var(--text3);margin-bottom:4px">Setor: <strong style="color:var(--accent)">${setorLabel}</strong></div>
        <div style="font-size:48px;font-weight:800;color:${heroColor};line-height:1">${mf.total}</div>
        <div style="font-size:15px;color:var(--text2);margin-top:4px">pedido${mf.total !== 1 ? 's' : ''} na sua fila</div>
        ${mf.urgentes > 0 ? `<div style="margin-top:8px;font-size:13px;font-weight:700;color:var(--red)">🔴 ${mf.urgentes} urgente${mf.urgentes > 1 ? 's' : ''}</div>` : ''}
      </div>
      <button class="btn btn-primary" style="font-size:15px;padding:12px 28px" onclick="navigate('fila')">
        Ver Minha Fila →
      </button>
    </div>`;

  // Etapas visíveis
  const etapasHtml = mf.etapas.length ? `
    <div style="margin-bottom:20px">
      <div class="section-label">Minhas Etapas</div>
      <div class="pipeline">${mf.etapas.map(e => `
        <div class="pipeline-step" onclick="navigate('fila')">
          <div class="pipeline-step-num">${e.etapa}</div>
          <div class="pipeline-step-count">${e.total}</div>
          <div class="pipeline-step-name">${e.nome}</div>
        </div>`).join('')}
      </div>
    </div>` : '';

  const listaHtml = mf.lista.length ? mf.lista.map(p => {
    const badges = tagsBadges(p);
    return `
      <div class="fila-card${p.urgente ? ' fila-card-urgente' : ''}" onclick="navigate('pedidos', {open: ${p.id}})" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--accent)">${p.codigo}</span>
          ${tagTipo(p.tipo)}
          ${tagEtapa(p.etapa_atual)}
          ${badges}
        </div>
        <div style="margin-top:4px;font-size:13px;color:var(--text2)">${p.cliente_nome || '—'}</div>
        ${p.prazo ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">Prazo: ${formatDate(p.prazo)}</div>` : ''}
      </div>`;
  }).join('') : `<div class="empty-state" style="padding:32px"><div class="empty-icon">✅</div><div class="empty-text">Fila vazia — nenhum pedido aguardando</div></div>`;

  // Fila por impressora — só para designer/moldes
  const impressorasHtml = isDesigner && (data.filaImpressoras || []).length ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:20px">
      ${data.filaImpressoras.map(imp => {
        const semImp = imp.impressora === 'Sem impressora';
        const cor = semImp ? 'var(--text3)' : imp.urgentes > 0 ? 'var(--red)' : 'var(--accent)';
        return `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:18px 20px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:6px">🖨️ IMPRESSORA</div>
          <div style="font-size:14px;font-weight:700;color:${cor};margin-bottom:10px">${imp.impressora}</div>
          <div style="font-size:36px;font-weight:800;color:${cor};line-height:1">${imp.total}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:4px">pedido${imp.total !== 1 ? 's' : ''} na fila</div>
          ${imp.urgentes > 0 ? `<div style="margin-top:8px;font-size:12px;font-weight:700;color:var(--red)">🔴 ${imp.urgentes} urgente${imp.urgentes > 1 ? 's' : ''}</div>` : ''}
        </div>`;
      }).join('')}
    </div>` : isDesigner ? `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:20px;text-align:center;color:var(--text3);font-size:13px">
      🖨️ Nenhum pedido nas impressoras no momento
    </div>` : '';

  document.getElementById('topbar-actions').innerHTML =
    `<button class="btn btn-ghost btn-sm" onclick="renderDashboard()">↻ Atualizar</button>`;

  document.getElementById('content').innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:20px;font-weight:700;color:var(--text1)">Olá, ${currentUser.nome?.split(' ')[0] || setorLabel} 👋</div>
      <div style="font-size:13px;color:var(--text3);margin-top:2px">Painel do setor de ${setorLabel}</div>
    </div>
    ${hero}
    ${isDesigner ? `<div class="section-label" style="margin-bottom:10px">🖨️ Fila das Impressoras</div>${impressorasHtml}` : ''}
    ${etapasHtml}
    <div class="card">
      <div class="card-header">
        <div class="card-title">Próximos na Fila</div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('fila')">Ver fila completa →</button>
      </div>
      <div style="padding:8px 12px 12px;display:flex;flex-direction:column;gap:8px">${listaHtml}</div>
    </div>`;
}
