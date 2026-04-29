async function renderClientes() {
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-primary btn-sm" onclick="modalNovoCliente()">+ Novo Cliente</button>
  `;

  document.getElementById('content').innerHTML = `
    <div class="search-bar">
      <div class="search-wrap" style="flex:1">
        <span class="search-icon">🔍</span>
        <input type="text" id="cliente-search" placeholder="Buscar por nome, CNPJ..." oninput="buscarClientes(this.value)">
      </div>
    </div>
    <div id="clientes-lista">
      <div style="padding:40px;text-align:center;color:var(--text3)">Carregando...</div>
    </div>
  `;

  await carregarClientes();
}

async function carregarClientes(q = '') {
  try {
    const clientes = await api.clientes.listar(q);
    const rows = clientes.map(c => `
      <tr onclick="abrirFichaCliente(${c.id})">
        <td><span style="font-weight:600">${c.razao_social}</span>${c.nome_fantasia ? `<br><span style="font-size:11px;color:var(--text3)">${c.nome_fantasia}</span>` : ''}</td>
        <td style="font-family:var(--font-mono);font-size:11px">${c.cnpj_cpf || '—'}</td>
        <td>${c.telefone || '—'}</td>
        <td>${c.email || '—'}</td>
        <td>${c.cidade || '—'}${c.estado ? '/' + c.estado : ''}</td>
        <td>${tagStatus(c.status)}</td>
      </tr>
    `).join('');

    document.getElementById('clientes-lista').innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">${clientes.length} cliente(s)</div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Razão Social</th><th>CNPJ/CPF</th><th>Telefone</th><th>E-mail</th><th>Cidade</th><th>Status</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">Nenhum cliente cadastrado</div></div></td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    document.getElementById('clientes-lista').innerHTML = `<div class="empty-state"><div class="empty-text">Erro: ${e.message}</div></div>`;
  }
}

function buscarClientes(q) {
  clearTimeout(buscarClientes._t);
  buscarClientes._t = setTimeout(() => carregarClientes(q), 300);
}

async function abrirFichaCliente(id) {
  try {
    const c = await api.clientes.get(id);
    const pedidosRows = c.pedidos?.map(p => `
      <tr onclick="fecharModalForce(); setTimeout(()=>abrirFichaPedido(${p.id}),100)" style="cursor:pointer">
        <td><span style="font-family:var(--font-mono);font-size:12px;color:var(--accent)">${p.codigo}</span></td>
        <td>${tagTipo(p.tipo)}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.descricao}</td>
        <td>${tagEtapa(p.etapa_atual)}</td>
        <td style="font-family:var(--font-mono);font-size:11px">${formatDateShort(p.criado_em)}</td>
      </tr>
    `).join('') || '<tr><td colspan="5"><div style="padding:12px;text-align:center;color:var(--text3);font-size:13px">Nenhum pedido</div></td></tr>';

    const body = `
      <div class="info-row">
        <div class="info-item"><div class="info-label">Razão Social</div><div class="info-value" style="font-size:16px;font-weight:700">${c.razao_social}</div></div>
        ${c.nome_fantasia ? `<div class="info-item"><div class="info-label">Nome Fantasia</div><div class="info-value">${c.nome_fantasia}</div></div>` : ''}
      </div>
      <div class="info-row">
        <div class="info-item"><div class="info-label">CNPJ/CPF</div><div class="info-value">${c.cnpj_cpf || '—'}</div></div>
        <div class="info-item"><div class="info-label">Telefone</div><div class="info-value">${c.telefone || '—'}</div></div>
        <div class="info-item"><div class="info-label">E-mail</div><div class="info-value">${c.email || '—'}</div></div>
      </div>
      <div class="info-row">
        <div class="info-item"><div class="info-label">Cidade/UF</div><div class="info-value">${c.cidade || '—'}${c.estado ? '/' + c.estado : ''}</div></div>
        <div class="info-item"><div class="info-label">Endereço</div><div class="info-value">${c.endereco || '—'}</div></div>
      </div>
      ${c.observacoes ? `<div class="form-group" style="margin-bottom:16px"><div class="info-label">Observações</div><div style="font-size:13px;color:var(--text2);margin-top:4px">${c.observacoes}</div></div>` : ''}
      <hr class="divider">
      <div class="section-label">Pedidos (${c.pedidos?.length || 0})</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Código</th><th>Tipo</th><th>Descrição</th><th>Etapa</th><th>Data</th></tr></thead>
          <tbody>${pedidosRows}</tbody>
        </table>
      </div>
    `;
    const isAdmin = ['admin','gerente_geral'].includes(currentUser.perfil);
    const footer = `
      <button class="btn btn-ghost" onclick="fecharModalForce()">Fechar</button>
      ${isAdmin && !c.pedidos?.length ? `<button class="btn btn-danger" onclick="modalApagarCliente(${c.id}, '${c.razao_social.replace(/'/g,"\\'")}')">🗑 Apagar</button>` : ''}
      <button class="btn btn-primary" onclick="modalEditarCliente(${c.id})">✎ Editar</button>
    `;
    abrirModal(c.razao_social, body, footer, 'modal-lg');
  } catch (e) { toast(e.message, 'error'); }
}

function modalNovoCliente() {
  const body = `
    <div class="form-grid">
      <div class="form-group span2"><label>Razão Social *</label><input type="text" id="nc-razao" placeholder="Empresa Ltda"></div>
      <div class="form-group"><label>Nome Fantasia</label><input type="text" id="nc-fantasia"></div>
      <div class="form-group"><label>CNPJ / CPF</label><input type="text" id="nc-cnpj" placeholder="00.000.000/0001-00"></div>
      <div class="form-group"><label>Telefone</label><input type="text" id="nc-tel" placeholder="(00) 00000-0000"></div>
      <div class="form-group"><label>E-mail</label><input type="email" id="nc-email"></div>
      <div class="form-group"><label>Cidade</label><input type="text" id="nc-cidade"></div>
      <div class="form-group"><label>Estado (UF)</label><input type="text" id="nc-estado" maxlength="2" placeholder="SP"></div>
      <div class="form-group span2"><label>Endereço</label><input type="text" id="nc-endereco"></div>
      <div class="form-group span2"><label>Observações</label><textarea id="nc-obs"></textarea></div>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-primary" onclick="confirmarNovoCliente()">Cadastrar</button>
  `;
  abrirModal('Novo Cliente', body, footer);
}

async function confirmarNovoCliente() {
  const dados = {
    razao_social: document.getElementById('nc-razao').value.trim(),
    nome_fantasia: document.getElementById('nc-fantasia').value,
    cnpj_cpf: document.getElementById('nc-cnpj').value,
    telefone: document.getElementById('nc-tel').value,
    email: document.getElementById('nc-email').value,
    cidade: document.getElementById('nc-cidade').value,
    estado: document.getElementById('nc-estado').value.toUpperCase(),
    endereco: document.getElementById('nc-endereco').value,
    observacoes: document.getElementById('nc-obs').value,
  };
  if (!dados.razao_social) { toast('Razão social obrigatória', 'error'); return; }
  try {
    await api.clientes.criar(dados);
    toast('Cliente cadastrado!', 'success');
    fecharModalForce();
    carregarClientes();
  } catch (e) { toast(e.message, 'error'); }
}

async function modalEditarCliente(id) {
  const c = await api.clientes.get(id);
  const body = `
    <div class="form-grid">
      <div class="form-group span2"><label>Razão Social *</label><input type="text" id="ec-razao" value="${c.razao_social || ''}"></div>
      <div class="form-group"><label>Nome Fantasia</label><input type="text" id="ec-fantasia" value="${c.nome_fantasia || ''}"></div>
      <div class="form-group"><label>CNPJ / CPF</label><input type="text" id="ec-cnpj" value="${c.cnpj_cpf || ''}"></div>
      <div class="form-group"><label>Telefone</label><input type="text" id="ec-tel" value="${c.telefone || ''}"></div>
      <div class="form-group"><label>E-mail</label><input type="email" id="ec-email" value="${c.email || ''}"></div>
      <div class="form-group"><label>Cidade</label><input type="text" id="ec-cidade" value="${c.cidade || ''}"></div>
      <div class="form-group"><label>Estado</label><input type="text" id="ec-estado" value="${c.estado || ''}" maxlength="2"></div>
      <div class="form-group span2"><label>Endereço</label><input type="text" id="ec-endereco" value="${c.endereco || ''}"></div>
      <div class="form-group span2"><label>Observações</label><textarea id="ec-obs">${c.observacoes || ''}</textarea></div>
      <div class="form-group"><label>Status</label>
        <select id="ec-status">
          <option value="ativo" ${c.status==='ativo'?'selected':''}>Ativo</option>
          <option value="inativo" ${c.status==='inativo'?'selected':''}>Inativo</option>
        </select>
      </div>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-primary" onclick="confirmarEditarCliente(${id})">Salvar</button>
  `;
  abrirModal('Editar Cliente', body, footer);
}

function modalApagarCliente(id, nome) {
  const body = `
    <div style="text-align:center;padding:8px 0">
      <div style="font-size:40px;margin-bottom:12px">⚠️</div>
      <p style="color:var(--text1);font-size:15px;font-weight:600">Apagar cliente permanentemente?</p>
      <p style="color:var(--text2);font-size:13px;margin-top:8px"><strong>${nome}</strong> será removido do sistema. Esta ação não pode ser desfeita.</p>
    </div>
  `;
  const footer = `
    <button class="btn btn-ghost" onclick="fecharModalForce()">Cancelar</button>
    <button class="btn btn-danger" onclick="confirmarApagarCliente(${id})">🗑 Apagar Definitivamente</button>
  `;
  abrirModal('Apagar Cliente', body, footer);
}

async function confirmarApagarCliente(id) {
  try {
    await api.clientes.deletar(id);
    toast('Cliente removido', 'success');
    fecharModalForce();
    carregarClientes();
  } catch (e) { toast(e.message, 'error'); }
}

async function confirmarEditarCliente(id) {
  const dados = {
    razao_social: document.getElementById('ec-razao').value.trim(),
    nome_fantasia: document.getElementById('ec-fantasia').value,
    cnpj_cpf: document.getElementById('ec-cnpj').value,
    telefone: document.getElementById('ec-tel').value,
    email: document.getElementById('ec-email').value,
    cidade: document.getElementById('ec-cidade').value,
    estado: document.getElementById('ec-estado').value.toUpperCase(),
    endereco: document.getElementById('ec-endereco').value,
    observacoes: document.getElementById('ec-obs').value,
    status: document.getElementById('ec-status').value,
  };
  try {
    await api.clientes.atualizar(id, dados);
    toast('Cliente atualizado!', 'success');
    fecharModalForce();
    carregarClientes();
  } catch (e) { toast(e.message, 'error'); }
}
