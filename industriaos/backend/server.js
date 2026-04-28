const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { initDb } = require('./db');
const { authMiddleware, requireAdmin, requireGerente, podeVerEtapa, podeOperarEtapa, podeDevolverEtapa, JWT_SECRET, PERFIL_ETAPAS } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Init DB
const db = initDb();

// Uploads
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// 8 etapas: Corte e Impressão ocorrem em PARALELO na etapa 5
const ETAPAS = {
  1: { nome: 'Contato',           setor: 'Comercial' },
  2: { nome: 'Layout',            setor: 'Arte' },
  3: { nome: 'Aprovação',         setor: 'Comercial' },
  4: { nome: 'Arte',              setor: 'Arte' },
  5: { nome: 'Impressão / Corte', setor: 'Produção' },
  6: { nome: 'Costura',           setor: 'Costura' },
  7: { nome: 'Motor',             setor: 'Montagem' },
  8: { nome: 'Expedição',         setor: 'Expedição' },
};

// ── AUTH ──────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha obrigatórios' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND ativo = 1').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ erro: 'Usuário não encontrado ou inativo' });

  if (!bcrypt.compareSync(senha, user.senha_hash)) return res.status(401).json({ erro: 'Senha incorreta' });

  db.prepare('UPDATE users SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  db.prepare('INSERT INTO auditoria (user_id, acao, detalhes) VALUES (?, ?, ?)').run(user.id, 'login', `Login: ${email}`);

  const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, setor: user.setor }, JWT_SECRET, { expiresIn: '12h' });

  res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, setor: user.setor } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, nome, email, perfil, setor, ultimo_acesso FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });

  const etapasVisiveis = [], etapasOperar = [], etapasDevolver = [];
  for (let e = 1; e <= 8; e++) {
    if (podeVerEtapa(req.user, e, db)) etapasVisiveis.push(e);
    if (podeOperarEtapa(req.user, e, db)) etapasOperar.push(e);
    if (podeDevolverEtapa(req.user, e, db)) etapasDevolver.push(e);
  }
  res.json({ ...user, etapasVisiveis, etapasOperar, etapasDevolver });
});

// ── CLIENTES ──────────────────────────────────────────────────────
app.get('/api/clientes', authMiddleware, (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';
  const clientes = db.prepare(`SELECT * FROM clientes WHERE (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj_cpf LIKE ?) ORDER BY razao_social`).all(q, q, q);
  res.json(clientes);
});

app.get('/api/clientes/:id', authMiddleware, (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado' });
  const pedidos = db.prepare('SELECT id, codigo, tipo, descricao, etapa_atual, status, criado_em FROM pedidos WHERE cliente_id = ? ORDER BY criado_em DESC').all(cliente.id);
  res.json({ ...cliente, pedidos });
});

app.post('/api/clientes', authMiddleware, (req, res) => {
  const { razao_social, nome_fantasia, cnpj_cpf, ie, im, telefone, email, cidade, estado, endereco, observacoes } = req.body;
  if (!razao_social) return res.status(400).json({ erro: 'Razão social obrigatória' });
  const r = db.prepare(`INSERT INTO clientes (razao_social, nome_fantasia, cnpj_cpf, ie, im, telefone, email, cidade, estado, endereco, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(razao_social, nome_fantasia, cnpj_cpf, ie, im, telefone, email, cidade, estado, endereco, observacoes);
  res.json({ id: r.lastInsertRowid, mensagem: 'Cliente cadastrado' });
});

app.put('/api/clientes/:id', authMiddleware, (req, res) => {
  const { razao_social, nome_fantasia, cnpj_cpf, ie, im, telefone, email, cidade, estado, endereco, observacoes, status } = req.body;
  db.prepare(`UPDATE clientes SET razao_social=?, nome_fantasia=?, cnpj_cpf=?, ie=?, im=?, telefone=?, email=?, cidade=?, estado=?, endereco=?, observacoes=?, status=? WHERE id=?`).run(razao_social, nome_fantasia, cnpj_cpf, ie, im, telefone, email, cidade, estado, endereco, observacoes, status, req.params.id);
  res.json({ mensagem: 'Cliente atualizado' });
});

// ── PEDIDOS ───────────────────────────────────────────────────────
function gerarCodigo(tipo) {
  const ano = new Date().getFullYear();
  const seq = db.prepare('SELECT COUNT(*) as c FROM pedidos').get().c + 1;
  return `${tipo}-${ano}-${String(seq).padStart(4, '0')}`;
}

app.get('/api/pedidos', authMiddleware, (req, res) => {
  const { etapa, status, tipo, q } = req.query;
  let where = 'WHERE 1=1';
  const params = [];

  if (etapa) { where += ' AND p.etapa_atual = ?'; params.push(parseInt(etapa)); }
  if (status) { where += ' AND p.status = ?'; params.push(status); }
  if (tipo) { where += ' AND p.tipo = ?'; params.push(tipo); }
  if (q) { where += ' AND (p.codigo LIKE ? OR p.descricao LIKE ? OR c.razao_social LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }

  // Vendedor: vê APENAS os próprios pedidos (isolamento total entre vendedores)
  if (req.user.perfil === 'vendedor') {
    where += ' AND p.vendedor_id = ?';
    params.push(req.user.id);
  } else if (!['admin', 'gerente_geral'].includes(req.user.perfil)) {
    // Produção/Designer: filtra por etapas visíveis
    const etapasVisiveis = [];
    for (let e = 1; e <= 8; e++) {
      if (podeVerEtapa(req.user, e, db)) etapasVisiveis.push(e);
    }
    if (etapasVisiveis.length === 0) return res.json([]);
    where += ` AND p.etapa_atual IN (${etapasVisiveis.join(',')})`;
  }

  const pedidos = db.prepare(`
    SELECT p.*, c.razao_social as cliente_nome, u.nome as vendedor_nome,
           h_entry.criado_em as entrou_etapa_em
    FROM pedidos p
    LEFT JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN users u ON p.vendedor_id = u.id
    LEFT JOIN (
      SELECT pedido_id, etapa_para, MAX(criado_em) as criado_em
      FROM historico WHERE tipo IN ('avanco','criacao')
      GROUP BY pedido_id, etapa_para
    ) h_entry ON h_entry.pedido_id = p.id AND h_entry.etapa_para = p.etapa_atual
    ${where}
    ORDER BY p.urgente DESC, h_entry.criado_em ASC, p.atualizado_em ASC
  `).all(...params);

  res.json(pedidos);
});

app.get('/api/pedidos/:id', authMiddleware, (req, res) => {
  const pedido = db.prepare(`
    SELECT p.*, c.razao_social as cliente_nome, c.telefone as cliente_telefone, c.email as cliente_email,
           u.nome as vendedor_nome
    FROM pedidos p
    LEFT JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN users u ON p.vendedor_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

  // Vendedor só pode ver pedidos próprios
  if (req.user.perfil === 'vendedor' && pedido.vendedor_id !== req.user.id) {
    return res.status(403).json({ erro: 'Sem permissão para ver este pedido' });
  }

  // Produção/Designer: verifica etapa visível
  if (!podeVerEtapa(req.user, pedido.etapa_atual, db) && !['admin', 'gerente_geral'].includes(req.user.perfil) && req.user.perfil !== 'vendedor') {
    return res.status(403).json({ erro: 'Sem permissão para ver este pedido' });
  }

  const historico = db.prepare(`
    SELECT h.*, u.nome as user_nome FROM historico h
    LEFT JOIN users u ON h.user_id = u.id
    WHERE h.pedido_id = ? ORDER BY h.criado_em DESC
  `).all(pedido.id);

  const arquivos = db.prepare('SELECT * FROM arquivos WHERE pedido_id = ? ORDER BY criado_em DESC').all(pedido.id);

  res.json({ ...pedido, historico, arquivos });
});

app.post('/api/pedidos', authMiddleware, (req, res) => {
  if (!podeOperarEtapa(req.user, 1, db)) return res.status(403).json({ erro: 'Sem permissão para criar pedidos' });

  const { tipo, cliente_id, descricao, dimensoes, material, cores, prazo, valor_orcamento, precisa_solvente, precisa_uv, categoria } = req.body;
  if (!tipo || !descricao) return res.status(400).json({ erro: 'Tipo e descrição obrigatórios' });

  const codigo = gerarCodigo(tipo);
  const r = db.prepare(`
    INSERT INTO pedidos (codigo, tipo, cliente_id, descricao, dimensoes, material, cores, prazo, valor_orcamento, precisa_solvente, precisa_uv, categoria, vendedor_id, etapa_atual)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(codigo, tipo, cliente_id || null, descricao, dimensoes, material, cores, prazo, valor_orcamento || null, precisa_solvente ? 1 : 0, precisa_uv ? 1 : 0, categoria || null, req.user.id);

  db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(r.lastInsertRowid, req.user.id, 'criacao', null, 1, `Pedido criado por ${req.user.nome}`);

  res.json({ id: r.lastInsertRowid, codigo, mensagem: 'Pedido criado' });
});

// Avançar etapa
app.post('/api/pedidos/:id/avancar', authMiddleware, (req, res) => {
  const { observacao, fila, precisa_solvente, precisa_uv, transportadora, codigo_rastreio, impressora } = req.body;
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

  if (!podeOperarEtapa(req.user, pedido.etapa_atual, db)) {
    return res.status(403).json({ erro: 'Sem permissão para operar esta etapa' });
  }

  // ── ETAPA 8: EXPEDIÇÃO → CONCLUIR pedido ─────────────────────────
  if (pedido.etapa_atual === 8) {
    db.prepare(`UPDATE pedidos SET status = 'concluido', transportadora = ?, codigo_rastreio = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(transportadora || null, codigo_rastreio || null, pedido.id);
    db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(
      pedido.id, req.user.id, 'avanco', 8, 8,
      `Pedido expedido e CONCLUÍDO por ${req.user.nome}${transportadora ? ` — Transportadora: ${transportadora}` : ''}${codigo_rastreio ? ` — Rastreio: ${codigo_rastreio}` : ''}${observacao ? ' — ' + observacao : ''}`
    );
    return res.json({ mensagem: 'Pedido expedido e concluído!', status: 'concluido' });
  }

  // ── ARTE (4): designer define impressora e tipo de impressão ──────
  if (pedido.etapa_atual === 4) {
    if (!impressora) return res.status(400).json({ erro: 'Selecione a impressora antes de avançar.' });
    db.prepare('UPDATE pedidos SET precisa_solvente = ?, precisa_uv = ?, impressora = ?, corte_ok = 0, impressao_ok = 0, impressao_solvente_ok = 0, impressao_uv_ok = 0 WHERE id = ?')
      .run(precisa_solvente ? 1 : 0, precisa_uv ? 1 : 0, impressora, pedido.id);
    // Avança normalmente para etapa 5 abaixo
  }

  // ── ETAPA 5: Impressão / Corte em PARALELO ────────────────────────
  if (pedido.etapa_atual === 5) {
    const helper = (msg) => res.json({ mensagem: msg });

    if (fila === 'corte') {
      db.prepare('UPDATE pedidos SET corte_ok = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(pedido.id);
      db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(pedido.id, req.user.id, 'parcial', 5, 5, `Corte concluído por ${req.user.nome}`);
      const upd = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
      if (!upd.impressao_ok) return helper('Corte registrado! ✓ Aguardando conclusão da Impressão.');

    } else if (fila === 'solvente') {
      db.prepare('UPDATE pedidos SET impressao_solvente_ok = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(pedido.id);
      db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(pedido.id, req.user.id, 'parcial', 5, 5, `Impressão Solvente concluída por ${req.user.nome}`);
      const upd = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
      if (upd.precisa_uv && !upd.impressao_uv_ok) return helper('Solvente registrada! ✓ Aguardando UV.');
      db.prepare('UPDATE pedidos SET impressao_ok = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(pedido.id);
      const upd2 = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
      if (!upd2.corte_ok) return helper('Impressão concluída! ✓ Aguardando Corte.');

    } else if (fila === 'uv') {
      db.prepare('UPDATE pedidos SET impressao_uv_ok = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(pedido.id);
      db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(pedido.id, req.user.id, 'parcial', 5, 5, `Impressão UV concluída por ${req.user.nome}`);
      const upd = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
      if (upd.precisa_solvente && !upd.impressao_solvente_ok) return helper('UV registrada! ✓ Aguardando Solvente.');
      db.prepare('UPDATE pedidos SET impressao_ok = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(pedido.id);
      const upd2 = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
      if (!upd2.corte_ok) return helper('Impressão concluída! ✓ Aguardando Corte.');

    } else {
      // Impressão simples (sem solvente/UV separado)
      db.prepare('UPDATE pedidos SET impressao_ok = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(pedido.id);
      db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(pedido.id, req.user.id, 'parcial', 5, 5, `Impressão concluída por ${req.user.nome}`);
      const upd = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
      if (!upd.corte_ok) return helper('Impressão registrada! ✓ Aguardando Corte.');
    }

    // AMBOS prontos: avança EXPLICITAMENTE para etapa 6 (Costura)
    db.prepare('UPDATE pedidos SET etapa_atual = 6, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(pedido.id);
    db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(
      pedido.id, req.user.id, 'avanco', 5, 6,
      `Impressão e Corte concluídos — Avançado para Costura por ${req.user.nome}`
    );
    return res.json({ mensagem: 'Impressão e Corte concluídos! Pedido avançado para Costura.', etapa: 6, etapa_nome: 'Costura' });
  }

  // ── AVANÇAR etapa genérico (etapas 1–4 e 6–7) ────────────────────
  let proximaEtapa = pedido.etapa_atual + 1;

  // Pula Motor (7) para tipos que não precisam de montagem
  if (proximaEtapa === 7 && pedido.tipo !== 'INF') {
    proximaEtapa = 8;
  }

  db.prepare('UPDATE pedidos SET etapa_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(proximaEtapa, pedido.id);
  db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(
    pedido.id, req.user.id, 'avanco',
    pedido.etapa_atual, proximaEtapa,
    `Avançado de "${ETAPAS[pedido.etapa_atual]?.nome}" para "${ETAPAS[proximaEtapa]?.nome}"${observacao ? ': ' + observacao : ''} — por ${req.user.nome}`
  );
  res.json({ mensagem: `Pedido avançado para ${ETAPAS[proximaEtapa]?.nome}`, etapa: proximaEtapa, etapa_nome: ETAPAS[proximaEtapa]?.nome });
});

// Devolver etapa
app.post('/api/pedidos/:id/devolver', authMiddleware, (req, res) => {
  const { etapa_destino, motivo } = req.body;
  if (!etapa_destino || !motivo) return res.status(400).json({ erro: 'Etapa destino e motivo são obrigatórios' });

  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

  if (!podeDevolverEtapa(req.user, pedido.etapa_atual, db)) {
    return res.status(403).json({ erro: 'Sem permissão para devolver nesta etapa' });
  }

  const etapaDe = pedido.etapa_atual;
  db.prepare('UPDATE pedidos SET etapa_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(etapa_destino, pedido.id);
  db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(
    pedido.id, req.user.id, 'devolucao', etapaDe, etapa_destino,
    `DEVOLVIDO de "${ETAPAS[etapaDe]?.nome}" para "${ETAPAS[etapa_destino]?.nome}" — Motivo: ${motivo} — por ${req.user.nome}`
  );

  res.json({ mensagem: 'Pedido devolvido', etapa: etapa_destino });
});

// Atualizar dados do pedido
app.put('/api/pedidos/:id', authMiddleware, (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

  const { descricao, dimensoes, material, cores, prazo, valor_orcamento, precisa_solvente, precisa_uv, corte_paralelo, status } = req.body;
  db.prepare(`UPDATE pedidos SET descricao=?, dimensoes=?, material=?, cores=?, prazo=?, valor_orcamento=?, precisa_solvente=?, precisa_uv=?, corte_paralelo=?, status=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?`).run(
    descricao, dimensoes, material, cores, prazo, valor_orcamento,
    precisa_solvente ? 1 : 0, precisa_uv ? 1 : 0, corte_paralelo ? 1 : 0,
    status || 'ativo', req.params.id
  );
  db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(pedido.id, req.user.id, 'edicao', pedido.etapa_atual, pedido.etapa_atual, `Dados do pedido editados por ${req.user.nome}`);
  res.json({ mensagem: 'Pedido atualizado' });
});

// Marcar/desmarcar urgente
app.post('/api/pedidos/:id/urgente', authMiddleware, (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

  const podeMarcar = ['admin','gerente_geral','vendedor'].includes(req.user.perfil);
  if (!podeMarcar) return res.status(403).json({ erro: 'Sem permissão' });

  const novoValor = pedido.urgente ? 0 : 1;
  db.prepare('UPDATE pedidos SET urgente = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(novoValor, pedido.id);
  db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(
    pedido.id, req.user.id, 'edicao', pedido.etapa_atual, pedido.etapa_atual,
    novoValor ? `🔴 Pedido marcado como URGENTE por ${req.user.nome}` : `Urgência removida por ${req.user.nome}`
  );
  res.json({ urgente: novoValor, mensagem: novoValor ? 'Marcado como urgente' : 'Urgência removida' });
});

// Cancelar pedido
app.post('/api/pedidos/:id/cancelar', authMiddleware, (req, res) => {
  const { motivo } = req.body;
  if (!motivo) return res.status(400).json({ erro: 'Informe o motivo do cancelamento' });

  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

  const podeCanc = ['admin','gerente_geral'].includes(req.user.perfil) ||
    (req.user.perfil === 'vendedor' && pedido.etapa_atual <= 3);
  if (!podeCanc) return res.status(403).json({ erro: 'Sem permissão para cancelar este pedido' });

  db.prepare(`UPDATE pedidos SET status = 'cancelado', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`).run(pedido.id);
  db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(
    pedido.id, req.user.id, 'edicao', pedido.etapa_atual, pedido.etapa_atual,
    `PEDIDO CANCELADO por ${req.user.nome} — Motivo: ${motivo}`
  );
  db.prepare('INSERT INTO auditoria (user_id, acao, detalhes) VALUES (?, ?, ?)').run(req.user.id, 'cancelar_pedido', `Pedido ${pedido.codigo} cancelado`);
  res.json({ mensagem: 'Pedido cancelado' });
});

// Excluir pedido (admin only)
app.delete('/api/pedidos/:id', authMiddleware, requireAdmin, (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

  db.prepare('DELETE FROM historico WHERE pedido_id = ?').run(pedido.id);
  db.prepare('DELETE FROM arquivos WHERE pedido_id = ?').run(pedido.id);
  db.prepare('DELETE FROM pedidos WHERE id = ?').run(pedido.id);
  db.prepare('INSERT INTO auditoria (user_id, acao, detalhes) VALUES (?, ?, ?)').run(req.user.id, 'excluir_pedido', `Pedido ${pedido.codigo} excluído permanentemente`);
  res.json({ mensagem: 'Pedido excluído' });
});

// ── DASHBOARD / MÉTRICAS ──────────────────────────────────────────
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const hoje = new Date().toISOString().split('T')[0];
  const em3dias = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

  // ── Pipeline por etapa ──
  const porEtapa = [];
  for (let e = 1; e <= 8; e++) {
    if (!podeVerEtapa(req.user, e, db)) continue;
    const count = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE etapa_atual = ? AND status = 'ativo'`).get(e);
    porEtapa.push({ etapa: e, nome: ETAPAS[e]?.nome, total: count.c });
  }

  // ── Contadores globais ──
  const totalAtivos    = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE status = 'ativo'`).get().c;
  const totalClientes  = db.prepare(`SELECT COUNT(*) as c FROM clientes WHERE status = 'ativo'`).get().c;
  const totalUsuarios  = db.prepare('SELECT COUNT(*) as c FROM users WHERE ativo = 1').get().c;
  const totalUrgentes  = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE urgente = 1 AND status = 'ativo'`).get().c;
  const totalVencidos  = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE prazo < ? AND status = 'ativo'`).get(hoje).c;
  const totalPrazoProx = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE prazo BETWEEN ? AND ? AND status = 'ativo'`).get(hoje, em3dias).c;
  const supPendentes   = db.prepare(`SELECT COUNT(*) as c FROM suprimentos WHERE status = 'pendente'`).get().c;

  // ── Listas de alertas (admin/gerente) ──
  const urgentes = db.prepare(`
    SELECT p.id, p.codigo, p.tipo, p.etapa_atual, p.prazo, c.razao_social as cliente_nome
    FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id
    WHERE p.urgente = 1 AND p.status = 'ativo'
    ORDER BY p.prazo ASC LIMIT 6
  `).all();

  const prazoProximo = db.prepare(`
    SELECT p.id, p.codigo, p.tipo, p.etapa_atual, p.prazo, p.urgente, c.razao_social as cliente_nome
    FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id
    WHERE p.prazo BETWEEN ? AND ? AND p.status = 'ativo'
    ORDER BY p.prazo ASC LIMIT 6
  `).all(hoje, em3dias);

  // ── Recentes (com id e urgente) ──
  const recentes = db.prepare(`
    SELECT p.id, p.codigo, p.tipo, p.etapa_atual, p.atualizado_em, p.urgente, p.prazo,
           c.razao_social as cliente_nome
    FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id
    WHERE p.status = 'ativo' ORDER BY p.atualizado_em DESC LIMIT 8
  `).all();

  // ── Meus pedidos (vendedor) ──
  let meusPedidos = null;
  if (req.user.perfil === 'vendedor') {
    const total = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE vendedor_id = ? AND status = 'ativo'`).get(req.user.id).c;
    const aguardando = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE vendedor_id = ? AND etapa_atual = 3 AND status = 'ativo'`).get(req.user.id).c;
    const urgs = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE vendedor_id = ? AND urgente = 1 AND status = 'ativo'`).get(req.user.id).c;
    const concluidos = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE vendedor_id = ? AND status = 'concluido'`).get(req.user.id).c;
    const lista = db.prepare(`
      SELECT p.id, p.codigo, p.tipo, p.etapa_atual, p.prazo, p.urgente, c.razao_social as cliente_nome
      FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id
      WHERE p.vendedor_id = ? AND p.status = 'ativo'
      ORDER BY p.urgente DESC, CASE WHEN p.prazo IS NULL THEN 1 ELSE 0 END, p.prazo ASC
      LIMIT 10
    `).all(req.user.id);
    meusPedidos = { total, aguardando, urgentes: urgs, concluidos, lista };
  }

  // ── Minha fila (produção / designer) ──
  let minhaFila = null;
  const perfisProd = ['impressao','corte','costura','motor','expedicao','designer','moldes'];
  if (perfisProd.includes(req.user.perfil)) {
    const etapasOperar = [];
    for (let e = 1; e <= 8; e++) {
      if (podeOperarEtapa(req.user, e, db)) etapasOperar.push(e);
    }
    if (etapasOperar.length > 0) {
      const inCl = etapasOperar.join(',');
      const total = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE etapa_atual IN (${inCl}) AND status = 'ativo'`).get().c;
      const urgs  = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE etapa_atual IN (${inCl}) AND urgente = 1 AND status = 'ativo'`).get().c;
      const lista = db.prepare(`
        SELECT p.id, p.codigo, p.tipo, p.etapa_atual, p.prazo, p.urgente,
               p.corte_ok, p.impressao_ok, c.razao_social as cliente_nome
        FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.etapa_atual IN (${inCl}) AND p.status = 'ativo'
        ORDER BY p.urgente DESC, CASE WHEN p.prazo IS NULL THEN 1 ELSE 0 END, p.prazo ASC
        LIMIT 8
      `).all();
      const etapasObjs = etapasOperar.map(e => {
        const cnt = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE etapa_atual = ? AND status = 'ativo'`).get(e);
        return { etapa: e, nome: ETAPAS[e]?.nome, total: cnt.c };
      });
      minhaFila = { total, urgentes: urgs, etapas: etapasObjs, lista };
    }
  }

  // ── Fila por impressora (para designer/moldes visualizarem) ──
  const filaImpressoras = db.prepare(`
    SELECT
      COALESCE(impressora, 'Sem impressora') as impressora,
      COUNT(*) as total,
      SUM(CASE WHEN urgente = 1 THEN 1 ELSE 0 END) as urgentes
    FROM pedidos
    WHERE etapa_atual = 5 AND status = 'ativo'
    GROUP BY impressora
    ORDER BY impressora
  `).all();

  res.json({
    porEtapa, recentes, totalAtivos, totalClientes, totalUsuarios,
    totalUrgentes, totalVencidos, totalPrazoProx, supPendentes,
    urgentes, prazoProximo, meusPedidos, minhaFila, filaImpressoras, etapas: ETAPAS
  });
});

// ── RELATÓRIOS ────────────────────────────────────────────────────
app.get('/api/relatorios', authMiddleware, (req, res) => {
  if (!['admin','gerente_geral'].includes(req.user.perfil))
    return res.status(403).json({ erro: 'Acesso negado' });

  const dias = parseInt(req.query.dias || '30');
  const dataInicio = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

  // Resumo financeiro
  const financeiro = db.prepare(`
    SELECT
      COUNT(*) as total_pedidos,
      COUNT(valor_orcamento) as com_valor,
      ROUND(SUM(COALESCE(valor_orcamento, 0)), 2) as valor_total,
      ROUND(AVG(CASE WHEN valor_orcamento IS NOT NULL THEN valor_orcamento END), 2) as valor_medio
    FROM pedidos WHERE date(criado_em) >= ?
  `).get(dataInicio);

  // Por tipo de produto
  const porTipo = db.prepare(`
    SELECT tipo, COUNT(*) as qtd,
           ROUND(SUM(COALESCE(valor_orcamento, 0)), 2) as valor_total
    FROM pedidos WHERE date(criado_em) >= ?
    GROUP BY tipo ORDER BY qtd DESC
  `).all(dataInicio);

  // Por status
  const porStatus = db.prepare(`
    SELECT status, COUNT(*) as qtd FROM pedidos
    WHERE date(criado_em) >= ? GROUP BY status
  `).all(dataInicio);

  // Por mês (últimos 12 meses sempre)
  const porMes = db.prepare(`
    SELECT strftime('%Y-%m', criado_em) as mes,
           COUNT(*) as qtd,
           ROUND(SUM(COALESCE(valor_orcamento, 0)), 2) as valor_total
    FROM pedidos WHERE date(criado_em) >= date('now', '-365 days')
    GROUP BY mes ORDER BY mes
  `).all();

  // Eficiência: tempo médio em horas por etapa
  const eficiencia = db.prepare(`
    SELECT
      h1.etapa_para as etapa,
      COUNT(*) as passagens,
      ROUND(AVG((julianday(h2.criado_em) - julianday(h1.criado_em)) * 24), 1) as media_horas
    FROM historico h1
    JOIN historico h2 ON h2.pedido_id = h1.pedido_id
      AND h2.etapa_de = h1.etapa_para
      AND h2.tipo = 'avanco'
      AND h2.criado_em > h1.criado_em
    WHERE h1.tipo IN ('avanco','criacao')
    GROUP BY h1.etapa_para
    ORDER BY etapa
  `).all();

  // Top 5 clientes
  const topClientes = db.prepare(`
    SELECT c.razao_social as nome, COUNT(p.id) as qtd,
           ROUND(SUM(COALESCE(p.valor_orcamento, 0)), 2) as valor_total
    FROM pedidos p JOIN clientes c ON p.cliente_id = c.id
    WHERE date(p.criado_em) >= ?
    GROUP BY p.cliente_id ORDER BY qtd DESC LIMIT 5
  `).all(dataInicio);

  // Top 5 vendedores
  const topVendedores = db.prepare(`
    SELECT u.nome, COUNT(p.id) as qtd,
           ROUND(SUM(COALESCE(p.valor_orcamento, 0)), 2) as valor_total
    FROM pedidos p JOIN users u ON p.vendedor_id = u.id
    WHERE date(p.criado_em) >= ?
    GROUP BY p.vendedor_id ORDER BY qtd DESC LIMIT 5
  `).all(dataInicio);

  res.json({ periodo: dias, financeiro, porTipo, porStatus, porMes, eficiencia, topClientes, topVendedores });
});

// ── USUÁRIOS (admin) ──────────────────────────────────────────────
app.get('/api/usuarios', authMiddleware, requireAdmin, (req, res) => {
  const usuarios = db.prepare('SELECT id, nome, email, perfil, setor, ativo, criado_em, ultimo_acesso FROM users ORDER BY nome').all();
  res.json(usuarios);
});

app.post('/api/usuarios', authMiddleware, requireAdmin, (req, res) => {
  const { nome, email, senha, perfil, setor } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Nome, e-mail e senha obrigatórios' });
  const existe = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existe) return res.status(400).json({ erro: 'E-mail já cadastrado' });
  const hash = bcrypt.hashSync(senha, 10);
  const r = db.prepare('INSERT INTO users (nome, email, senha_hash, perfil, setor) VALUES (?, ?, ?, ?, ?)').run(nome, email.toLowerCase(), hash, perfil || 'operador', setor);
  res.json({ id: r.lastInsertRowid, mensagem: 'Usuário criado' });
});

app.put('/api/usuarios/:id', authMiddleware, requireAdmin, (req, res) => {
  const { nome, email, perfil, setor, ativo, senha } = req.body;
  if (senha) {
    const hash = bcrypt.hashSync(senha, 10);
    db.prepare('UPDATE users SET nome=?, email=?, perfil=?, setor=?, ativo=?, senha_hash=? WHERE id=?').run(nome, email, perfil, setor, ativo ? 1 : 0, hash, req.params.id);
  } else {
    db.prepare('UPDATE users SET nome=?, email=?, perfil=?, setor=?, ativo=? WHERE id=?').run(nome, email, perfil, setor, ativo ? 1 : 0, req.params.id);
  }
  res.json({ mensagem: 'Usuário atualizado' });
});

app.get('/api/usuarios/:id/permissoes', authMiddleware, requireAdmin, (req, res) => {
  const perms = db.prepare('SELECT * FROM permissoes WHERE user_id = ?').all(req.params.id);
  const user = db.prepare('SELECT id, nome, perfil FROM users WHERE id = ?').get(req.params.id);
  res.json({ user, permissoes: perms, perfil_padrao: PERFIL_ETAPAS[user?.perfil] || null });
});

app.post('/api/usuarios/:id/permissoes', authMiddleware, requireAdmin, (req, res) => {
  const { permissoes } = req.body; // array de { etapa, pode_ver, pode_operar, pode_devolver }
  db.prepare('DELETE FROM permissoes WHERE user_id = ?').run(req.params.id);
  const insert = db.prepare('INSERT INTO permissoes (user_id, etapa, pode_ver, pode_operar, pode_devolver) VALUES (?, ?, ?, ?, ?)');
  for (const p of permissoes) {
    insert.run(req.params.id, p.etapa, p.pode_ver ? 1 : 0, p.pode_operar ? 1 : 0, p.pode_devolver ? 1 : 0);
  }
  res.json({ mensagem: 'Permissões salvas' });
});

// ── AUDITORIA ─────────────────────────────────────────────────────
app.get('/api/auditoria', authMiddleware, requireAdmin, (req, res) => {
  const logs = db.prepare(`
    SELECT a.*, u.nome as user_nome FROM auditoria a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.criado_em DESC LIMIT 200
  `).all();
  res.json(logs);
});

// ── ARQUIVOS ──────────────────────────────────────────────────────
app.post('/api/pedidos/:id/arquivos', authMiddleware, upload.single('arquivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
  const destino = req.query.destino || null; // 'impressao', 'corte_costura', ou null
  const r = db.prepare(`INSERT INTO arquivos (pedido_id, nome, caminho, tipo, etapa, destino, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(pedido.id, req.file.originalname, req.file.filename, req.file.mimetype, pedido.etapa_atual, destino, req.user.id);
  const destinoLabel = destino === 'impressao' ? ' [Impressão]' : destino === 'corte_costura' ? ' [Corte/Costura]' : '';
  db.prepare(`INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(pedido.id, req.user.id, 'arquivo', pedido.etapa_atual, pedido.etapa_atual, `Arquivo "${req.file.originalname}"${destinoLabel} anexado por ${req.user.nome}`);
  res.json({ id: r.lastInsertRowid, nome: req.file.originalname });
});

// Abrir arquivo inline no browser
app.get('/api/arquivos/:id', authMiddleware, (req, res) => {
  const arquivo = db.prepare('SELECT * FROM arquivos WHERE id = ?').get(req.params.id);
  if (!arquivo) return res.status(404).json({ erro: 'Arquivo não encontrado' });
  const filePath = path.join(UPLOADS_DIR, arquivo.caminho);
  if (!fs.existsSync(filePath)) return res.status(404).json({ erro: 'Arquivo não encontrado no servidor' });
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(arquivo.nome)}"`);
  res.setHeader('Content-Type', arquivo.tipo || 'application/octet-stream');
  res.sendFile(filePath);
});

// Baixar arquivo (forçar download)
app.get('/api/arquivos/:id/download', authMiddleware, (req, res) => {
  const arquivo = db.prepare('SELECT * FROM arquivos WHERE id = ?').get(req.params.id);
  if (!arquivo) return res.status(404).json({ erro: 'Arquivo não encontrado' });
  const filePath = path.join(UPLOADS_DIR, arquivo.caminho);
  if (!fs.existsSync(filePath)) return res.status(404).json({ erro: 'Arquivo não encontrado no servidor' });
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(arquivo.nome)}"`);
  res.setHeader('Content-Type', arquivo.tipo || 'application/octet-stream');
  res.sendFile(filePath);
});

// ── SUPRIMENTOS ───────────────────────────────────────────────────
app.get('/api/suprimentos', authMiddleware, (req, res) => {
  const isGerente = ['admin','gerente_geral'].includes(req.user.perfil);
  const rows = isGerente
    ? db.prepare(`SELECT s.*, u.nome as solicitante_nome, u2.nome as respondido_nome
        FROM suprimentos s
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN users u2 ON s.respondido_por = u2.id
        ORDER BY s.criado_em DESC`).all()
    : db.prepare(`SELECT s.*, u.nome as solicitante_nome, u2.nome as respondido_nome
        FROM suprimentos s
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN users u2 ON s.respondido_por = u2.id
        WHERE s.user_id = ?
        ORDER BY s.criado_em DESC`).all(req.user.id);
  res.json(rows);
});

app.post('/api/suprimentos', authMiddleware, (req, res) => {
  const { etapa, perfil, categoria, descricao, quantidade } = req.body;
  if (!categoria || !descricao) return res.status(400).json({ erro: 'Categoria e descrição obrigatórias' });
  const r = db.prepare(`INSERT INTO suprimentos (etapa, perfil, categoria, descricao, quantidade, user_id) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(etapa || req.user.etapa || 0, perfil || req.user.perfil, categoria, descricao, quantidade || null, req.user.id);
  res.json({ id: r.lastInsertRowid, mensagem: 'Pedido de suprimento registrado' });
});

app.patch('/api/suprimentos/:id', authMiddleware, requireGerente, (req, res) => {
  const { status, resposta } = req.body;
  db.prepare(`UPDATE suprimentos SET status = ?, resposta = ?, respondido_por = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(status, resposta || null, req.user.id, req.params.id);
  res.json({ mensagem: 'Suprimento atualizado' });
});

// ── ETAPAS INFO ───────────────────────────────────────────────────
app.get('/api/etapas', authMiddleware, (req, res) => {
  res.json(ETAPAS);
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🏭 IndustriaOS rodando em http://localhost:${PORT}`);
  console.log(`📋 Acesse no navegador: http://localhost:${PORT}\n`);
});
