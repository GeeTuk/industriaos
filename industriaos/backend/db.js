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
      ie TEXT,
      im TEXT,
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
      urgente INTEGER DEFAULT 0,
      transportadora TEXT,
      codigo_rastreio TEXT,
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
      destino TEXT,
      user_id INTEGER REFERENCES users(id),
      criado_em TEXT DEFAULT (datetime('now'))
    );

    -- Pedidos de Suprimentos
    CREATE TABLE IF NOT EXISTS suprimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etapa INTEGER NOT NULL,
      perfil TEXT NOT NULL,
      categoria TEXT NOT NULL,
      descricao TEXT NOT NULL,
      quantidade TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      user_id INTEGER REFERENCES users(id),
      respondido_por INTEGER REFERENCES users(id),
      resposta TEXT,
      criado_em TEXT DEFAULT (CURRENT_TIMESTAMP),
      atualizado_em TEXT DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Impressoras cadastradas
    CREATE TABLE IF NOT EXISTS impressoras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now'))
    );

    -- Categorias de suprimentos por setor (gerenciável pelo admin)
    CREATE TABLE IF NOT EXISTS sup_categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setor TEXT NOT NULL,
      nome TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now'))
    );

    -- Subcategorias de produto por tipo (ex: INF → Tenda Casa, Roof Top)
    CREATE TABLE IF NOT EXISTS produto_categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_tipo TEXT NOT NULL,
      nome TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now'))
    );

    -- Materiais de produto por tipo (ex: INF → Nylon, LON → Lona)
    CREATE TABLE IF NOT EXISTS produto_materiais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_tipo TEXT NOT NULL,
      nome TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now'))
    );

    -- Cores disponíveis para pedidos
    CREATE TABLE IF NOT EXISTS produto_cores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now'))
    );

    -- Dimensões padrão de produto
    CREATE TABLE IF NOT EXISTS produto_dimensoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now'))
    );

    -- Itens individuais de um pedido (produção por item)
    CREATE TABLE IF NOT EXISTS pedido_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      ordem INTEGER DEFAULT 0,
      tipo TEXT NOT NULL,
      categoria TEXT,
      descricao TEXT,
      material TEXT,
      cores TEXT,
      dimensoes TEXT,
      quantidade INTEGER DEFAULT 1,
      etapa_atual INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'pendente',
      impressora TEXT,
      precisa_solvente INTEGER DEFAULT 0,
      precisa_uv INTEGER DEFAULT 0,
      impressao_solvente_ok INTEGER DEFAULT 0,
      impressao_uv_ok INTEGER DEFAULT 0,
      corte_ok INTEGER DEFAULT 0,
      impressao_ok INTEGER DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now'))
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

  // Usuário admin padrão — usa OR IGNORE para nunca crashar em banco já populado
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (nome, email, senha_hash, perfil, setor, ativo)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const adminExiste = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@industriaos.com');
  if (!adminExiste) {
    const hash = bcrypt.hashSync('admin123', 10);
    insertUser.run('Administrador', 'admin@industriaos.com', hash, 'admin', 'Administração');
    console.log('✅ Banco de dados inicializado com dados de exemplo.');
    console.log('👤 Admin: admin@industriaos.com / admin123');
  }

  // Seed: usuários de exemplo (OR IGNORE: pula se já existir)
  {
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
  }

  // Seed: clientes de exemplo (OR IGNORE: pula se já existir)
  {
    const insertCliente = db.prepare(`
      INSERT OR IGNORE INTO clientes (razao_social, nome_fantasia, cnpj_cpf, telefone, email, cidade, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertCliente.run('Eventos Brasil Ltda', 'Eventos Brasil', '12.345.678/0001-90', '(11) 99999-0001', 'contato@eventosbrasil.com.br', 'São Paulo', 'SP');
    insertCliente.run('Parques & Festas S/A', 'Parques & Festas', '98.765.432/0001-11', '(21) 98888-0002', 'compras@parquesfestas.com.br', 'Rio de Janeiro', 'RJ');
    insertCliente.run('Promo Ação Marketing', 'PromoAção', '45.678.901/0001-22', '(31) 97777-0003', 'pedidos@promoacao.com.br', 'Belo Horizonte', 'MG');
  }

  // Seed: impressoras (se ainda não existirem)
  if (!db.prepare('SELECT id FROM impressoras LIMIT 1').get()) {
    ['Mimaki UV (100-160)', 'Mimaki Solvente (150-160)'].forEach(nome => {
      db.prepare('INSERT INTO impressoras (nome) VALUES (?)').run(nome);
    });
  }

  // Seed: categorias de suprimentos por setor
  if (!db.prepare('SELECT id FROM sup_categorias LIMIT 1').get()) {
    const cats = {
      impressao: ['Tinta Solvente','Tinta UV','Mídia / Vinil','Solvente de Limpeza','Cabeça de Impressão','Outros'],
      corte:     ['Lâmina de Corte','Estilete / Bisturi','Fita de Borda','Ferramenta de Corte','Outros'],
      costura:   ['Linha de Costura','Agulha','Velcro','Zíper','Fita de Borda','Elástico','Outros'],
      motor:     ['Componente de Motor','Cola / Adesivo','Ferramenta Elétrica','Cabo / Fio','Parafuso / Porca','Outros'],
      expedicao: ['Caixa de Embalagem','Fita Adesiva','Lacre / Selo','Etiqueta','Outros'],
      default:   ['Material de Escritório','EPI / Segurança','Produto de Limpeza','Ferramentas','Outros'],
    };
    for (const [setor, nomes] of Object.entries(cats)) {
      for (const nome of nomes) {
        db.prepare('INSERT INTO sup_categorias (setor, nome) VALUES (?, ?)').run(setor, nome);
      }
    }
  }

  // Seed: subcategorias de produto
  if (!db.prepare('SELECT id FROM produto_categorias LIMIT 1').get()) {
    const cats = [
      ['INF','Tenda Casa'],['INF','Tenda Padrão'],['INF','Tenda Aranha'],
      ['INF','Portal'],['INF','Roof Top'],['INF','3D'],['INF','Colchão'],['INF','Túnel'],
    ];
    for (const [tipo, nome] of cats) {
      db.prepare('INSERT INTO produto_categorias (produto_tipo, nome) VALUES (?, ?)').run(tipo, nome);
    }
  }

  // Seed: materiais de produto
  if (!db.prepare('SELECT id FROM produto_materiais LIMIT 1').get()) {
    const mats = [
      ['INF','Nylon'],
      ['LON','Lona'],
      ['ADH','Transparente'],['ADH','Branco'],['ADH','Lux'],
      ['PLC','2mm'],['PLC','1mm'],
    ];
    for (const [tipo, nome] of mats) {
      db.prepare('INSERT INTO produto_materiais (produto_tipo, nome) VALUES (?, ?)').run(tipo, nome);
    }
  }

  // Seed: cores
  if (!db.prepare('SELECT id FROM produto_cores LIMIT 1').get()) {
    for (const nome of ['Vermelho','Azul Omni','Azul 388C','Verde Maçã','Branco','Verde Bandeira','Laranja']) {
      db.prepare('INSERT INTO produto_cores (nome) VALUES (?)').run(nome);
    }
  }

  // Seed: dimensões padrão
  if (!db.prepare('SELECT id FROM produto_dimensoes LIMIT 1').get()) {
    const dims = [
      '1m × 1m','1m × 2m','1m × 3m','2m × 2m','2m × 3m','2m × 4m',
      '3m × 3m','3m × 4m','3m × 5m','4m × 4m','4m × 5m','4m × 6m',
      '5m × 5m','5m × 6m','5m × 8m','6m × 6m','6m × 8m','8m × 8m',
    ];
    for (const nome of dims) {
      db.prepare('INSERT INTO produto_dimensoes (nome) VALUES (?)').run(nome);
    }
  }

  // Migrações: adicionar colunas que podem não existir em instâncias antigas
  const migrations = [
    'ALTER TABLE users ADD COLUMN nickname TEXT',
    'ALTER TABLE pedidos ADD COLUMN corte_ok INTEGER DEFAULT 0',
    'ALTER TABLE pedidos ADD COLUMN impressao_ok INTEGER DEFAULT 0',
    'ALTER TABLE pedidos ADD COLUMN categoria TEXT',
    'ALTER TABLE pedidos ADD COLUMN transportadora TEXT',
    'ALTER TABLE pedidos ADD COLUMN codigo_rastreio TEXT',
    'ALTER TABLE pedidos ADD COLUMN urgente INTEGER DEFAULT 0',
    'ALTER TABLE clientes ADD COLUMN ie TEXT',
    'ALTER TABLE clientes ADD COLUMN im TEXT',
    'ALTER TABLE arquivos ADD COLUMN destino TEXT',
    'ALTER TABLE pedidos ADD COLUMN impressora TEXT',
    'ALTER TABLE pedidos ADD COLUMN tem_itens INTEGER DEFAULT 0',
  ];
  for (const m of migrations) {
    try { db.exec(m); } catch (_) { /* coluna já existe */ }
  }

  return db;
}

module.exports = { initDb, DB_PATH };
