async function renderDashboard() {
  try {
    const data = await api.dashboard();

    const kpis = `
      <div class="kpi-grid">
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
        <div class="kpi-card orange">
          <div class="kpi-label">Etapas</div>
          <div class="kpi-value">${data.porEtapa.length}</div>
          <div class="kpi-sub">visíveis para você</div>
        </div>
      </div>
    `;

    const pipelineSteps = data.porEtapa.map(e => `
      <div class="pipeline-step" onclick="navigate('pedidos', {etapa: ${e.etapa}})">
        <div class="pipeline-step-num">${e.etapa}</div>
        <div class="pipeline-step-count">${e.total}</div>
        <div class="pipeline-step-name">${e.nome}</div>
      </div>
    `).join('');

    const recentRows = data.recentes.map(p => `
      <tr onclick="abrirFichaPedido(${p.id || 0})" style="cursor:pointer">
        <td><span style="font-family:var(--font-mono);font-size:12px">${p.codigo}</span></td>
        <td>${tagTipo(p.tipo)}</td>
        <td>${p.cliente_nome || '—'}</td>
        <td>${tagEtapa(p.etapa_atual)}</td>
        <td style="font-family:var(--font-mono);font-size:11px">${formatDate(p.atualizado_em)}</td>
      </tr>
    `).join('');

    document.getElementById('content').innerHTML = `
      ${kpis}
      <div style="margin-bottom:20px">
        <div class="section-label">Pipeline de Produção — clique para filtrar</div>
        <div class="pipeline">${pipelineSteps}</div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Movimentações Recentes</div>
          <button class="btn btn-ghost btn-sm" onclick="navigate('pedidos')">Ver todos →</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Tipo</th><th>Cliente</th><th>Etapa Atual</th><th>Atualizado</th></tr></thead>
            <tbody>${recentRows || '<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Nenhum pedido ainda</div></div></td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;

    // Busca IDs para o click da tabela
    const pedidos = data.recentes;
    document.querySelectorAll('#content tbody tr').forEach((row, i) => {
      if (pedidos[i]) {
        row.onclick = () => navigate('pedidos', { open: pedidos[i].codigo });
      }
    });

  } catch (e) {
    document.getElementById('content').innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><div class="empty-text">Erro ao carregar dashboard: ${e.message}</div></div>`;
  }
}
