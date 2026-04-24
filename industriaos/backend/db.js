const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'industriaos.db');

function initDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    -- Usuários
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      perfil TEXT NOT NULL DEFAULT 'operador',
      setor TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now')),
      ultimo_acesso TEXT
    );

    -- Permissões granulares por usuário
    CREATE TABLE IF NOT EXISTS permissoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      etapa INTEGER NOT NULL,
      pode_ver INTEGER DEFAULT 0,
      pode_operar INTEGER DEFAULT 0,
      pode_devolver INTEGER DEFAULT 0
    );

    -- Clientes
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      razao_social TEXT NOT NULL,
      nome_fantasia TEXT,
      cnpj_cpf TEXT,
      telefone TEXT,
      email TEXT,
      cidade TEXT,
      estado TEXT,
      endereco TEXT,
      observacoes TEXT,
      status TEXT DEFAULT 'ativo',
      criado_em TEXT DEFAULT (datetime('now'))
    );

    -- Pedidos
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('INF','LON','ADH','PLC','BAQ')),
      cliente_id INTEGER REFERENCES clientes(id),
      descricao TEXT NOT NULL,
      dimensoes TEXT,
      material TEXT,
      cores TEXT,
      prazo TEXT,
      valor_orcamento REAL,
      etapa_atual INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'ativo',
      precisa_solvente INTEGER DEFAULT 0,
      precisa_uv INTEGER DEFAULT 0,
      impressao_solvente_ok INTEGER DEFAULT 0,
      impressao_uv_ok INTEGER DEFAULT 0,
      corte_paralelo INTEGER DEFAULT 0,
      corte_ok INTEGER DEFAULT 0,
      impressao_ok INTEGER DEFAULT 0,
      categoria TEXT,
      vendedor_id INTEGER REFERENCES users(id),
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now'))
    );

    -- Histórico / Movimentações do pedido
    CREATE TABLE IF NOT EXISTS historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      tipo TEXT NOT NULL,
      etapa_de INTEGER,
      etapa_para INTEGER,
      descricao TEXT NOT NULL,
      criado_em TEXT DEFAULT (datetime('now'))
    );

    -- Arquivos anexados
    CREATE TABLE IF NOT EXISTS arquivos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      caminho TEXT NOT NULL,
      tipo TEXT,
      etapa INTEGER,
      user_id INTEGER REFERENCES users(id),
      criado_em TEXT DEFAULT (datetime('now'))
    );

    -- Log de auditoria
    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      acao TEXT NOT NULL,
      detalhes TEXT,
      ip TEXT,
      criado_em TEXT DEFAULT (datetime('now'))
    );
  `);

  // Usuário admin padrão
  const adminExiste = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@industriaos.com');
  if (!adminExiste) {
    const hash = bcrypt.hashSync('admin123', 10);
    const insertUser = db.prepare(`
      INSERT INTO users (nome, email, senha_hash, perfil, setor, ativo)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    insertUser.run('Administrador', 'admin@industriaos.com', hash, 'admin', 'Administração');

    // Seed: alguns usuários de exemplo
    const usuarios = [
      { nome: 'Carlos Vendedor', email: 'vendedor@industriaos.com', perfil: 'vendedor', setor: 'Comercial' },
      { nome: 'Ana Designer', email: 'arte@industriaos.com', perfil: 'designer', setor: 'Arte' },
      { nome: 'João Impressão', email: 'impressao@industriaos.com', perfil: 'impressao', setor: 'Impressão' },
      { nome: 'Pedro Corte', email: 'corte@industriaos.com', perfil: 'corte', setor: 'Corte' },
      { nome: 'Maria Costura', email: 'costura@industriaos.com', perfil: 'costura', setor: 'Costura' },
      { nome: 'Roberto Motor', email: 'motor@industriaos.com', perfil: 'motor', setor: 'Montagem' },
      { nome: 'Lucas Expedição', email: 'expedicao@industriaos.com', perfil: 'expedicao', setor: 'Expedição' },
      { nome: 'Gerente Geral', email: 'gerente@industriaos.com', perfil: 'gerente_geral', setor: 'Gerência' },
    ];

    const senhaHash = bcrypt.hashSync('senha123', 10);
    for (const u of usuarios) {
      insertUser.run(u.nome, u.email, senhaHash, u.perfil, u.setor);
    }

    // Seed: alguns clientes
    const insertCliente = db.prepare(`
      INSERT INTO clientes (razao_social, nome_fantasia, cnpj_cpf, telefone, email, cidade, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertCliente.run('Eventos Brasil Ltda', 'Eventos Brasil', '12.345.678/0001-90', '(11) 99999-0001', 'contato@eventosbrasil.com.br', 'São Paulo', 'SP');
    insertCliente.run('Parques & Festas S/A', 'Parques & Festas', '98.765.432/0001-11', '(21) 98888-0002', 'compras@parquesfestas.com.br', 'Rio de Janeiro', 'RJ');
    insertCliente.run('Promo Ação Marketing', 'PromoAção', '45.678.901/0001-22', '(31) 97777-0003', 'pedidos@promoacao.com.br', 'Belo Horizonte', 'MG');

    console.log('✅ Banco de dados inicializado com dados de exemplo.');
    console.log('👤 Admin: admin@industriaos.com / admin123');
    console.log('👤 Demais usuários: [email acima] / senha123');
  }

  // Migrações: adicionar colunas que podem não existir em instâncias antigas
  const migrations = [
    'ALTER TABLE pedidos ADD COLUMN corte_ok INTEGER DEFAULT 0',
    'ALTER TABLE pedidos ADD COLUMN impressao_ok INTEGER DEFAULT 0',
    'ALTER TABLE pedidos ADD COLUMN categoria TEXT',
  ];
  for (const m of migrations) {
    try { db.exec(m); } catch (_) { /* coluna já existe */ }
  }

  return db;
}

module.exports = { initDb, DB_PATH };
