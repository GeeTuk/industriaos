const API_BASE = '/api';

function getToken() { return localStorage.getItem('industriaos_token'); }
function setToken(t) { localStorage.setItem('industriaos_token', t); }
function removeToken() { localStorage.removeItem('industriaos_token'); }

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers };
  const res = await fetch(API_BASE + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`);
  return data;
}

const api = {
  login: (login, senha) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ login, senha }) }),
  me: () => apiFetch('/auth/me'),
  etapas: () => apiFetch('/etapas'),

  clientes: {
    listar: (q) => apiFetch(`/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    get: (id) => apiFetch(`/clientes/${id}`),
    criar: (d) => apiFetch('/clientes', { method: 'POST', body: JSON.stringify(d) }),
    atualizar: (id, d) => apiFetch(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    deletar: (id) => apiFetch(`/clientes/${id}`, { method: 'DELETE' }),
  },

  pedidos: {
    listar: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v !== undefined && v !== '')).toString();
      return apiFetch(`/pedidos${qs ? '?' + qs : ''}`);
    },
    get: (id) => apiFetch(`/pedidos/${id}`),
    criar: (d) => apiFetch('/pedidos', { method: 'POST', body: JSON.stringify(d) }),
    atualizar: (id, d) => apiFetch(`/pedidos/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    avancar: (id, data) => apiFetch(`/pedidos/${id}/avancar`, { method: 'POST', body: JSON.stringify(data) }),
    devolver: (id, data) => apiFetch(`/pedidos/${id}/devolver`, { method: 'POST', body: JSON.stringify(data) }),
    cancelar: (id, motivo) => apiFetch(`/pedidos/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) }),
    deletar: (id) => apiFetch(`/pedidos/${id}`, { method: 'DELETE' }),
    toggleUrgente: (id) => apiFetch(`/pedidos/${id}/urgente`, { method: 'POST' }),
    // Itens individuais
    adicionarItem: (pedidoId, d) => apiFetch(`/pedidos/${pedidoId}/itens`, { method: 'POST', body: JSON.stringify(d) }),
    editarItem: (pedidoId, iid, d) => apiFetch(`/pedidos/${pedidoId}/itens/${iid}`, { method: 'PUT', body: JSON.stringify(d) }),
    removerItem: (pedidoId, iid) => apiFetch(`/pedidos/${pedidoId}/itens/${iid}`, { method: 'DELETE' }),
    avancarItem: (pedidoId, iid, data) => apiFetch(`/pedidos/${pedidoId}/itens/${iid}/avancar`, { method: 'POST', body: JSON.stringify(data) }),
  },

  suprimentos: {
    listar: () => apiFetch('/suprimentos'),
    criar: (d) => apiFetch('/suprimentos', { method: 'POST', body: JSON.stringify(d) }),
    atualizar: (id, d) => apiFetch(`/suprimentos/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  },

  dashboard: () => apiFetch('/dashboard'),
  relatorios: (dias = 30) => apiFetch(`/relatorios?dias=${dias}`),
  config: () => apiFetch('/config'),

  admin: {
    impressoras: {
      listar: () => apiFetch('/admin/impressoras'),
      criar: (nome) => apiFetch('/admin/impressoras', { method: 'POST', body: JSON.stringify({ nome }) }),
      apagar: (id) => apiFetch(`/admin/impressoras/${id}`, { method: 'DELETE' }),
    },
    supCategorias: {
      listar: () => apiFetch('/admin/sup-categorias'),
      criar: (d) => apiFetch('/admin/sup-categorias', { method: 'POST', body: JSON.stringify(d) }),
      apagar: (id) => apiFetch(`/admin/sup-categorias/${id}`, { method: 'DELETE' }),
    },
    produtoCategorias: {
      listar: () => apiFetch('/admin/produto-categorias'),
      criar: (d) => apiFetch('/admin/produto-categorias', { method: 'POST', body: JSON.stringify(d) }),
      apagar: (id) => apiFetch(`/admin/produto-categorias/${id}`, { method: 'DELETE' }),
    },
    produtoMateriais: {
      listar: () => apiFetch('/admin/produto-materiais'),
      criar: (d) => apiFetch('/admin/produto-materiais', { method: 'POST', body: JSON.stringify(d) }),
      apagar: (id) => apiFetch(`/admin/produto-materiais/${id}`, { method: 'DELETE' }),
    },
    produtoCores: {
      listar: () => apiFetch('/admin/produto-cores'),
      criar: (nome) => apiFetch('/admin/produto-cores', { method: 'POST', body: JSON.stringify({ nome }) }),
      apagar: (id) => apiFetch(`/admin/produto-cores/${id}`, { method: 'DELETE' }),
    },
    produtoDimensoes: {
      listar: () => apiFetch('/admin/produto-dimensoes'),
      criar: (nome) => apiFetch('/admin/produto-dimensoes', { method: 'POST', body: JSON.stringify({ nome }) }),
      apagar: (id) => apiFetch(`/admin/produto-dimensoes/${id}`, { method: 'DELETE' }),
    },
  },

  usuarios: {
    listar: () => apiFetch('/usuarios'),
    criar: (d) => apiFetch('/usuarios', { method: 'POST', body: JSON.stringify(d) }),
    atualizar: (id, d) => apiFetch(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    permissoes: (id) => apiFetch(`/usuarios/${id}/permissoes`),
    salvarPermissoes: (id, p) => apiFetch(`/usuarios/${id}/permissoes`, { method: 'POST', body: JSON.stringify({ permissoes: p }) }),
  },

  auditoria: () => apiFetch('/auditoria'),

  arquivos: {
    upload: async (pedidoId, formData, destino = null) => {
      const token = getToken();
      const qs = destino ? `?destino=${encodeURIComponent(destino)}` : '';
      const res = await fetch(API_BASE + `/pedidos/${pedidoId}/arquivos${qs}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`);
      return data;
    },
    url: (id) => `${API_BASE}/arquivos/${id}?token=${getToken()}`,
    downloadUrl: (id) => `${API_BASE}/arquivos/${id}/download?token=${getToken()}`,
  },
};
