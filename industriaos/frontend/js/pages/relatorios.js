// ── RELATÓRIOS ─────────────────────────────────────────────────────
let _relDias = 30;

async function renderRelatorios() {
  document.getElementById('topbar-actions').innerHTML =
    `<button class="btn btn-ghost btn-sm" onclick="renderRelatorios()">↻ Atualizar</button>`;

  const filtros = [
    { d: 7,   label: 'Últimos 7 dias' },
    { d: 30,  label: 'Últimos 30 dias' },
    { d: 90,  label: 'Últimos 90 dias' },
    { d: 365, label: 'Último ano' },
  ];

  document.getElementById('content').innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
      ${filtros.map(f => `
        <button class="btn ${_relDias === f.d ? 'btn-primary' : 'btn-ghost'} btn-sm"
          onclick="_relSetDias(${f.d})">${f.label}</button>`).join('')}
    </div>
    <div id="rel-content">
      <div style="padding:48px;text-align:center;color:var(--text3)">Carregando relatório...</div>
    </div>`;

  try {
    const data = await api.relatorios(_relDias);
    _renderRelatoriosContent(data);
  } catch (e) {
    document.getElementById('rel-content').innerHTML =
      `<div class="empty-state"><div class="empty-icon">⚠</div><div class="empty-text">Erro: ${e.message}</div></div>`;
  }
}

function _relSetDias(d) {
  _relDias = d;
  renderRelatorios();
}

const TIPO_META = {
  INF: { label: 'Inflável',  cor: 'blue'   },
  LON: { label: 'Lona',      cor: 'orange' },
  ADH: { label: 'Adesivo',   cor: 'green'  },
  PLC: { label: 'Placa',     cor: 'yellow' },
  BAQ: { label: 'Banquinho', cor: 'gray'   },
};

const ETAPAS_REL = {
  1:'Contato', 2:'Layout', 3:'Aprovação', 4:'Arte',
  5:'Impressão/Corte', 6:'Costura', 7:'Motor', 8:'Expedição',
};

function _fmtMoeda(v) {
  if (!v || v === 0) return '—';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _renderRelatoriosContent(data) {
  const f = data.financeiro || {};

  // ── KPIs financeiros ───────────────────────────────────────────
  const kpisHtml = `
    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card blue">
        <div class="kpi-label">Total de Pedidos</div>
        <div class="kpi-value">${f.total_pedidos ?? 0}</div>
        <div class="kpi-sub">no período</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Valor Total</div>
        <div class="kpi-value" style="font-size:20px">${_fmtMoeda(f.valor_total)}</div>
        <div class="kpi-sub">${f.com_valor ?? 0} com orçamento</div>
      </div>
      <div class="kpi-card yellow">
        <div class="kpi-label">Ticket Médio</div>
        <div class="kpi-value" style="font-size:20px">${_fmtMoeda(f.valor_medio)}</div>
        <div class="kpi-sub">por pedido orçado</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">Sem Orçamento</div>
        <div class="kpi-value">${(f.total_pedidos ?? 0) - (f.com_valor ?? 0)}</div>
        <div class="kpi-sub">pedidos sem valor</div>
      </div>
    </div>`;

  // ── Produção por tipo (barra CSS) ──────────────────────────────
  const maxQtd = Math.max(...(data.porTipo || []).map(t => t.qtd), 1);
  const tipoHtml = (data.porTipo || []).length
    ? data.porTipo.map(t => {
        const meta = TIPO_META[t.tipo] || { label: t.tipo, cor: 'gray' };
        const pct  = Math.max(Math.round((t.qtd / maxQtd) * 100), 4);
        return `
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
            <div style="width:100px;font-size:13px;font-weight:600;color:var(--text1)">${meta.label}</div>
            <div style="flex:1;background:var(--bg2);border-radius:6px;height:30px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:var(--${meta.cor});border-radius:6px;
                   display:flex;align-items:center;padding-left:10px;min-width:36px;transition:width .4s ease">
                <span style="font-size:13px;font-weight:700;color:#fff">${t.qtd}</span>
              </div>
            </div>
            <div style="width:130px;text-align:right;font-size:12px;color:var(--text2)">${_fmtMoeda(t.valor_total)}</div>
          </div>`;
      }).join('')
    : '<div style="color:var(--text3);font-size:13px;padding:8px 0">Nenhum pedido no período</div>';

  // ── Eficiência por etapa ───────────────────────────────────────
  const maxHoras = Math.max(...(data.eficiencia || []).map(e => e.media_horas || 0), 1);
  const eficHtml = (data.eficiencia || []).length
    ? `<table>
        <thead>
          <tr><th>Etapa</th><th>Setor</th><th>Pedidos</th><th>Tempo Médio</th><th style="min-width:100px">Indicador</th></tr>
        </thead>
        <tbody>
          ${data.eficiencia.map(e => {
            const h    = e.media_horas || 0;
            const pct  = Math.max(Math.round((h / maxHoras) * 100), 4);
            const cor  = h > 48 ? 'var(--red)' : h > 24 ? 'var(--orange)' : 'var(--green)';
            const txt  = h < 1 ? `${Math.round(h * 60)}min` : h < 24 ? `${h}h` : `${(h / 24).toFixed(1)}d`;
            return `<tr>
              <td><span class="tag tag-gray" style="font-family:var(--font-mono)">${e.etapa}</span></td>
              <td style="font-size:13px">${ETAPAS_REL[e.etapa] || '—'}</td>
              <td style="font-family:var(--font-mono);font-size:12px">${e.passagens}</td>
              <td style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:${cor}">${txt}</td>
              <td>
                <div style="background:var(--bg2);border-radius:4px;height:8px">
                  <div style="width:${pct}%;height:8px;background:${cor};border-radius:4px;transition:width .4s"></div>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`
    : '<div style="color:var(--text3);font-size:13px;padding:12px 0">Ainda não há histórico de movimentação suficiente</div>';

  // ── Top Clientes ───────────────────────────────────────────────
  const topCliHtml = (data.topClientes || []).length
    ? data.topClientes.map((c, i) => `
        <div class="alert-item">
          <span style="font-size:16px;font-weight:800;color:var(--text3);min-width:20px">${i + 1}</span>
          <span style="flex:1;font-size:13px;color:var(--text1)">${c.nome}</span>
          <span style="font-weight:600;color:var(--accent);font-size:12px">${c.qtd} pedido${c.qtd > 1 ? 's' : ''}</span>
          <span style="color:var(--text3);font-size:12px;min-width:100px;text-align:right">${_fmtMoeda(c.valor_total)}</span>
        </div>`).join('')
    : '<div style="color:var(--text3);font-size:13px;padding:12px 0">Nenhum dado disponível</div>';

  // ── Top Vendedores ─────────────────────────────────────────────
  const topVenHtml = (data.topVendedores || []).length
    ? data.topVendedores.map((v, i) => `
        <div class="alert-item">
          <span style="font-size:16px;font-weight:800;color:var(--text3);min-width:20px">${i + 1}</span>
          <span style="flex:1;font-size:13px;color:var(--text1)">${v.nome}</span>
          <span style="font-weight:600;color:var(--accent);font-size:12px">${v.qtd} pedido${v.qtd > 1 ? 's' : ''}</span>
          <span style="color:var(--text3);font-size:12px;min-width:100px;text-align:right">${_fmtMoeda(v.valor_total)}</span>
        </div>`).join('')
    : '<div style="color:var(--text3);font-size:13px;padding:12px 0">Nenhum dado disponível</div>';

  document.getElementById('rel-content').innerHTML = `
    ${kpisHtml}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div class="card">
        <div class="card-header"><div class="card-title">📦 Produção por Tipo</div></div>
        <div style="padding:16px 20px">${tipoHtml}</div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">⏱ Eficiência por Setor</div>
          <span style="font-size:11px;color:var(--text3)">🟢 &lt;24h · 🟠 &lt;48h · 🔴 +48h</span>
        </div>
        <div class="table-wrap">${eficHtml}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-header"><div class="card-title">👥 Top Clientes</div></div>
        <div style="padding:0 16px 8px">${topCliHtml}</div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">🏆 Top Vendedores</div></div>
        <div style="padding:0 16px 8px">${topVenHtml}</div>
      </div>
    </div>`;
}
