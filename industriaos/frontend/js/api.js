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
  login: (email, senha) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) }),
  me: () => apiFetch('/auth/me'),
  etapas: () => apiFetch('/etapas'),

  clientes: {
    listar: (q) => apiFetch(`/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    get: (id) => apiFetch(`/clientes/${id}`),
    criar: (d) => apiFetch('/clientes', { method: 'POST', body: JSON.stringify(d) }),
    atualizar: (id, d) => apiFetch(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
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
  },

  dashboard: () => apiFetch('/dashboard'),

  usuarios: {
    listar: () => apiFetch('/usuarios'),
    criar: (d) => apiFetch('/usuarios', { method: 'POST', body: JSON.stringify(d) }),
    atualizar: (id, d) => apiFetch(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    permissoes: (id) => apiFetch(`/usuarios/${id}/permissoes`),
    salvarPermissoes: (id, p) => apiFetch(`/usuarios/${id}/permissoes`, { method: 'POST', body: JSON.stringify({ permissoes: p }) }),
  },

  auditoria: () => apiFetch('/auditoria'),
};
