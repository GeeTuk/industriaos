const PERFIS_LISTA = [
  { value: 'admin', label: 'Administrador' },
  { value: 'gerente_geral', label: 'Gerente Geral' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'designer', label: 'Designer / Arte' },
  { value: 'moldes', label: 'Técnico de Moldes' },
  { value: 'impressao', label: 'Operador Impressão' },
  { value: 'corte', label: 'Operador Corte' },
  { value: 'costura', label: 'Operador Costura' },
  { value: 'motor', label: 'Operador Motor' },
  { value: 'expedicao', label: 'Expedição' },
  { value: 'operador', label: 'Operador Geral' },
];

async function renderUsuarios() {
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-primary btn-sm" onclick="modalNovoUsuario()">+ Novo Usuário</button>
  `;

  document.getElementById('content').innerHTML = `
    <div id="usuarios-lista">
      <div style="padding:40px;text-align:center;color:var(--text3)">Carregando...</div>
    </div>
  `;

  await carregarUsuarios();
}

async function carregarUsuarios() {
  try {
    const usuarios = await api.usuarios.listar();
    const rows = usuarios.map(u => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="avatar" style="width:28px;height:28px;font-size:11px">${u.nome.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()}</div>
            <div>
              <div style="font-weight:600">${u.nome}</div>
              <div style="font-size:11px;color:var(--text3)">${u.email}</div>
            </div>
          </div>
        </td>
        <td><span class="tag tag-blue">${PERFIL_LABELS[u.perfil] || u.perfil}</span></td>
        <td>${u.setor || '—'}</td>
        <td>${u.ativo ? '<span class="tag tag-green">Ativo</span>' : '<span class="tag tag-red">Inativo</span>'}</td>
        <td style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">${u.ultimo_acesso ? formatDate(u.ultimo_acesso) : 'Nunca'}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="modalEditarUsuario(${u.id})">✎ Editar</button>
            <button class="btn btn-orange btn-sm" onclick="modalPermissoes(${u.id})">🔑 Permissões</button>
          </div>
        </td>
      </tr>
    `).join('');

    document.getElementById('usuarios-lista').innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">${usuarios.length} usuário(s)</div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Usuário</th><th>Perfil</th><th>Setor</th><th>Status</th><th>Último Acesso</th><th>Ações</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="6"><div class="empty-state"><div class="empty-text">Nenhum usuário</div></div></td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    document.getElementById('usuarios-lista').innerHTML = `<div class="empty-state"><div class="empty-text">Erro: ${e.message}</div></div>`;
  }
}

function modalNovoUsuario() {
  const perfilOpts = PERFIS_LISTA.map(p => `<option value="${p.value}">${p.label}</option>`).join('');
  const body = `
    <div class="form-grid">
      <div class="form-group"><label>Nome Completo *</label><input type="text" id="nu-nome"></div>
      <div class="form-group"><label>E-mail *</label><input type="email" id="nu-email"></div>
      <div class="form-group"><label>Senha *</label><input type="password" id="nu-senha" placeholder="mínimo 6 caracteres"></div>
      <div class="form-group"><label>Perfil *</label><select id="nu-perfil">${perfilOpts}</select></div>
      <div class="form-group"><label>Setor</label><input type="text" id="nu-setor" placeholder="ex: Impressão, Arte..."></div>
    </div>
    <div style="margin-top:12px;padding:12px;background:var(--surface2);border-radius:8px;font-size:12px;color:var(--text2)">
      💡 O perfil define as permissões padrão. Após criar, use "Permissões" para customizar individualmente.
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-primary" onclick="confirmarNovoUsuario()">Criar Usuário</button>
  `;
  abrirModal('Novo Usuário', body, footer);
}

async function confirmarNovoUsuario() {
  const dados = {
    nome: document.getElementById('nu-nome').value.trim(),
    email: document.getElementById('nu-email').value.trim(),
    senha: document.getElementById('nu-senha').value,
    perfil: document.getElementById('nu-perfil').value,
    setor: document.getElementById('nu-setor').value,
  };
  if (!dados.nome || !dados.email || !dados.senha) { toast('Preencha todos os campos obrigatórios', 'error'); return; }
  if (dados.senha.length < 6) { toast('Senha deve ter pelo menos 6 caracteres', 'error'); return; }
  try {
    await api.usuarios.criar(dados);
    toast('Usuário criado!', 'success');
    fecharModalForce();
    carregarUsuarios();
  } catch (e) { toast(e.message, 'error'); }
}

async function modalEditarUsuario(id) {
  const usuarios = await api.usuarios.listar();
  const u = usuarios.find(x => x.id === id);
  if (!u) return;

  const perfilOpts = PERFIS_LISTA.map(p => `<option value="${p.value}" ${u.perfil===p.value?'selected':''}>${p.label}</option>`).join('');
  const body = `
    <div class="form-grid">
      <div class="form-group"><label>Nome Completo *</label><input type="text" id="eu-nome" value="${u.nome}"></div>
      <div class="form-group"><label>E-mail *</label><input type="email" id="eu-email" value="${u.email}"></div>
      <div class="form-group"><label>Nova Senha (deixe em branco para não alterar)</label><input type="password" id="eu-senha" placeholder="•••••••"></div>
      <div class="form-group"><label>Perfil *</label><select id="eu-perfil">${perfilOpts}</select></div>
      <div class="form-group"><label>Setor</label><input type="text" id="eu-setor" value="${u.setor || ''}"></div>
      <div class="form-group">
        <label>Status</label>
        <select id="eu-ativo">
          <option value="1" ${u.ativo?'selected':''}>Ativo</option>
          <option value="0" ${!u.ativo?'selected':''}>Inativo</option>
        </select>
      </div>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-primary" onclick="confirmarEditarUsuario(${id})">Salvar</button>
  `;
  abrirModal('Editar Usuário', body, footer);
}

async function confirmarEditarUsuario(id) {
  const dados = {
    nome: document.getElementById('eu-nome').value.trim(),
    email: document.getElementById('eu-email').value.trim(),
    perfil: document.getElementById('eu-perfil').value,
    setor: document.getElementById('eu-setor').value,
    ativo: document.getElementById('eu-ativo').value === '1',
  };
  const senha = document.getElementById('eu-senha').value;
  if (senha) dados.senha = senha;
  try {
    await api.usuarios.atualizar(id, dados);
    toast('Usuário atualizado!', 'success');
    fecharModalForce();
    carregarUsuarios();
  } catch (e) { toast(e.message, 'error'); }
}

// ── PERMISSÕES ────────────────────────────────────────────────────
async function modalPermissoes(id) {
  try {
    const data = await api.usuarios.permissoes(id);
    const { user, permissoes, perfil_padrao } = data;

    // Monta grid de permissões
    const etapas = Object.entries(ETAPAS_NOMES);

    // Verifica se tem permissão granular salva, senão usa padrão do perfil
    function getVal(etapa, campo) {
      const perm = permissoes.find(p => p.etapa === etapa);
      if (perm) return perm[campo] === 1;
      if (perfil_padrao) {
        if (campo === 'pode_ver') return perfil_padrao.ver?.includes(etapa);
        if (campo === 'pode_operar') return perfil_padrao.operar?.includes(etapa);
        if (campo === 'pode_devolver') return perfil_padrao.devolver?.includes(etapa);
      }
      return false;
    }

    const rows = etapas.map(([num, nome]) => {
      const e = parseInt(num);
      return `
        <tr>
          <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">${num}</span> ${nome}</td>
          <td><input type="checkbox" class="perm-check" data-etapa="${e}" data-campo="pode_ver" ${getVal(e,'pode_ver')?'checked':''}></td>
          <td><input type="checkbox" class="perm-check" data-etapa="${e}" data-campo="pode_operar" ${getVal(e,'pode_operar')?'checked':''}></td>
          <td><input type="checkbox" class="perm-check" data-etapa="${e}" data-campo="pode_devolver" ${getVal(e,'pode_devolver')?'checked':''}></td>
        </tr>
      `;
    }).join('');

    const body = `
      <div style="margin-bottom:14px">
        <div style="font-size:13px;font-weight:600">${user.nome}</div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">${PERFIL_LABELS[user.perfil] || user.perfil} — permissões abaixo sobrescrevem o perfil padrão</div>
      </div>
      <div style="overflow-x:auto">
        <table class="perm-grid">
          <thead>
            <tr>
              <th style="width:180px">Etapa</th>
              <th>👁 Ver</th>
              <th>⚙ Operar</th>
              <th>↩ Devolver</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:12px;padding:10px;background:var(--surface2);border-radius:8px;font-size:12px;color:var(--text2)">
        💡 As permissões marcadas aqui substituem completamente o perfil padrão para este usuário.
      </div>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarPermissoes(${id})">Salvar Permissões</button>
    `;
    abrirModal(`Permissões — ${user.nome}`, body, footer, 'modal-lg');
  } catch (e) { toast(e.message, 'error'); }
}

async function salvarPermissoes(userId) {
  const checks = document.querySelectorAll('.perm-check');
  const byEtapa = {};
  checks.forEach(c => {
    const e = parseInt(c.dataset.etapa);
    if (!byEtapa[e]) byEtapa[e] = { etapa: e, pode_ver: false, pode_operar: false, pode_devolver: false };
    byEtapa[e][c.dataset.campo] = c.checked;
  });
  const permissoes = Object.values(byEtapa);
  try {
    await api.usuarios.salvarPermissoes(userId, permissoes);
    toast('Permissões salvas!', 'success');
    fecharModalForce();
  } catch (e) { toast(e.message, 'error'); }
}
