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

const ETAPAS = {
  1: { nome: 'Contato',   setor: 'Comercial' },
  2: { nome: 'Layout',    setor: 'Arte' },
  3: { nome: 'Aprovação', setor: 'Comercial' },
  4: { nome: 'Arte',      setor: 'Arte' },
  5: { nome: 'Impressão', setor: 'Impressão' },
  6: { nome: 'Corte',     setor: 'Corte' },
  7: { nome: 'Costura',   setor: 'Costura' },
  8: { nome: 'Motor',     setor: 'Montagem' },
  9: { nome: 'Expedição', setor: 'Expedição' },
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
  for (let e = 1; e <= 9; e++) {
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
  const { razao_social, nome_fantasia, cnpj_cpf, telefone, email, cidade, estado, endereco, observacoes } = req.body;
  if (!razao_social) return res.status(400).json({ erro: 'Razão social obrigatória' });
  const r = db.prepare(`INSERT INTO clientes (razao_social, nome_fantasia, cnpj_cpf, telefone, email, cidade, estado, endereco, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(razao_social, nome_fantasia, cnpj_cpf, telefone, email, cidade, estado, endereco, observacoes);
  res.json({ id: r.lastInsertRowid, mensagem: 'Cliente cadastrado' });
});

app.put('/api/clientes/:id', authMiddleware, (req, res) => {
  const { razao_social, nome_fantasia, cnpj_cpf, telefone, email, cidade, estado, endereco, observacoes, status } = req.body;
  db.prepare(`UPDATE clientes SET razao_social=?, nome_fantasia=?, cnpj_cpf=?, telefone=?, email=?, cidade=?, estado=?, endereco=?, observacoes=?, status=? WHERE id=?`).run(razao_social, nome_fantasia, cnpj_cpf, telefone, email, cidade, estado, endereco, observacoes, status, req.params.id);
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

  // Filtro por etapas visíveis
  if (!['admin', 'gerente_geral'].includes(req.user.perfil)) {
    const etapasVisiveis = [];
    for (let e = 1; e <= 9; e++) {
      if (podeVerEtapa(req.user, e, db)) etapasVisiveis.push(e);
    }
    if (etapasVisiveis.length === 0) return res.json([]);
    where += ` AND p.etapa_atual IN (${etapasVisiveis.join(',')})`;
  }

  const pedidos = db.prepare(`
    SELECT p.*, c.razao_social as cliente_nome, u.nome as vendedor_nome
    FROM pedidos p
    LEFT JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN users u ON p.vendedor_id = u.id
    ${where}
    ORDER BY p.atualizado_em DESC
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

  // Verifica se pode ver a etapa atual
  if (!podeVerEtapa(req.user, pedido.etapa_atual, db) && !['admin', 'gerente_geral'].includes(req.user.perfil)) {
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

  const { tipo, cliente_id, descricao, dimensoes, material, cores, prazo, valor_orcamento, precisa_solvente, precisa_uv } = req.body;
  if (!tipo || !descricao) return res.status(400).json({ erro: 'Tipo e descrição obrigatórios' });

  const codigo = gerarCodigo(tipo);
  const r = db.prepare(`
    INSERT INTO pedidos (codigo, tipo, cliente_id, descricao, dimensoes, material, cores, prazo, valor_orcamento, precisa_solvente, precisa_uv, vendedor_id, etapa_atual)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(codigo, tipo, cliente_id || null, descricao, dimensoes, material, cores, prazo, valor_orcamento || null, precisa_solvente ? 1 : 0, precisa_uv ? 1 : 0, req.user.id);

  db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(r.lastInsertRowid, req.user.id, 'criacao', null, 1, `Pedido criado por ${req.user.nome}`);

  res.json({ id: r.lastInsertRowid, codigo, mensagem: 'Pedido criado' });
});

// Avançar etapa
app.post('/api/pedidos/:id/avancar', authMiddleware, (req, res) => {
  const { observacao } = req.body;
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

  if (!podeOperarEtapa(req.user, pedido.etapa_atual, db)) {
    return res.status(403).json({ erro: 'Sem permissão para operar esta etapa' });
  }

  const { observacao, fila, precisa_solvente, precisa_uv } = req.body;

  // Designer define impressora na etapa Arte (4)
  if (pedido.etapa_atual === 4 && (precisa_solvente !== undefined || precisa_uv !== undefined)) {
    db.prepare('UPDATE pedidos SET precisa_solvente = ?, precisa_uv = ? WHERE id = ?')
      .run(precisa_solvente ? 1 : 0, precisa_uv ? 1 : 0, pedido.id);
  }

  // Impressão: duas filas (solvente e UV)
  if (pedido.etapa_atual === 5) {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
    if (p.precisa_solvente && p.precisa_uv) {
      if (fila === 'solvente') {
        db.prepare('UPDATE pedidos SET impressao_solvente_ok = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(pedido.id);
        db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(pedido.id, req.user.id, 'parcial', 5, 5, `Impressão Solvente concluída por ${req.user.nome}`);
        const atual = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
        if (!atual.impressao_uv_ok) return res.json({ mensagem: 'Solvente registrada. Aguardando UV.' });
      } else if (fila === 'uv') {
        db.prepare('UPDATE pedidos SET impressao_uv_ok = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(pedido.id);
        db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(pedido.id, req.user.id, 'parcial', 5, 5, `Impressão UV concluída por ${req.user.nome}`);
        const atual = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
        if (!atual.impressao_solvente_ok) return res.json({ mensagem: 'UV registrada. Aguardando Solvente.' });
      }
    }
  }

  // Calcular próxima etapa
  let proximaEtapa = pedido.etapa_atual + 1;

  // Pula Motor (8) para tipos que não precisam
  if (proximaEtapa === 8 && !['INF', 'BAQ'].includes(pedido.tipo)) {
    proximaEtapa = 9;
  }

  db.prepare('UPDATE pedidos SET etapa_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(proximaEtapa, pedido.id);
  db.prepare('INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)').run(
    pedido.id, req.user.id, 'avanco',
    pedido.etapa_atual, proximaEtapa,
    `Avançado de "${ETAPAS[pedido.etapa_atual]?.nome}" para "${ETAPAS[proximaEtapa]?.nome}"${observacao ? ': ' + observacao : ''} — por ${req.user.nome}`
  );

  res.json({ mensagem: `Pedido avançado para etapa ${proximaEtapa}`, etapa: proximaEtapa, etapa_nome: ETAPAS[proximaEtapa]?.nome });
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

// ── DASHBOARD / MÉTRICAS ──────────────────────────────────────────
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const porEtapa = [];
  for (let e = 1; e <= 9; e++) {
    if (!podeVerEtapa(req.user, e, db)) continue;
    const count = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE etapa_atual = ? AND status = 'ativo'`).get(e);
    porEtapa.push({ etapa: e, nome: ETAPAS[e]?.nome, total: count.c });
  }

  const recentes = db.prepare(`
    SELECT p.codigo, p.tipo, p.etapa_atual, p.atualizado_em, c.razao_social as cliente_nome
    FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id
    WHERE p.status = 'ativo' ORDER BY p.atualizado_em DESC LIMIT 8
  `).all();

  const totalAtivos = db.prepare(`SELECT COUNT(*) as c FROM pedidos WHERE status = 'ativo'`).get().c;
  const totalClientes = db.prepare(`SELECT COUNT(*) as c FROM clientes WHERE status = 'ativo'`).get().c;
  const totalUsuarios = db.prepare('SELECT COUNT(*) as c FROM users WHERE ativo = 1').get().c;

  res.json({ porEtapa, recentes, totalAtivos, totalClientes, totalUsuarios, etapas: ETAPAS });
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
  const r = db.prepare(`INSERT INTO arquivos (pedido_id, nome, caminho, tipo, etapa, user_id) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(pedido.id, req.file.originalname, req.file.filename, req.file.mimetype, pedido.etapa_atual, req.user.id);
  db.prepare(`INSERT INTO historico (pedido_id, user_id, tipo, etapa_de, etapa_para, descricao) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(pedido.id, req.user.id, 'arquivo', pedido.etapa_atual, pedido.etapa_atual, `Arquivo "${req.file.originalname}" anexado por ${req.user.nome}`);
  res.json({ id: r.lastInsertRowid, nome: req.file.originalname });
});

app.get('/api/arquivos/:id', authMiddleware, (req, res) => {
  const arquivo = db.prepare('SELECT * FROM arquivos WHERE id = ?').get(req.params.id);
  if (!arquivo) return res.status(404).json({ erro: 'Arquivo não encontrado' });
  const filePath = path.join(UPLOADS_DIR, arquivo.caminho);
  if (!fs.existsSync(filePath)) return res.status(404).json({ erro: 'Arquivo não encontrado no servidor' });
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(arquivo.nome)}"`);
  res.setHeader('Content-Type', arquivo.tipo || 'application/octet-stream');
  res.sendFile(filePath);
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
