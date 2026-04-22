const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'industriaos_secret_2026_troque_em_producao';

// Perfis padrão e suas etapas visíveis
const PERFIL_ETAPAS = {
  vendedor:       { ver: [1,2,3,4], operar: [1,2,3,4], devolver: [] },
  designer:       { ver: [5,6], operar: [5], devolver: [5] },
  moldes:         { ver: [5,6], operar: [6], devolver: [6] },
  impressao:      { ver: [7], operar: [7], devolver: [7] },
  corte:          { ver: [7,8], operar: [8], devolver: [8] },
  costura:        { ver: [8,9], operar: [9], devolver: [9] },
  motor:          { ver: [9,10], operar: [10], devolver: [10] },
  expedicao:      { ver: [10,11], operar: [11], devolver: [11] },
  gerente_geral:  { ver: [1,2,3,4,5,6,7,8,9,10,11], operar: [1,2,3,4,5,6,7,8,9,10,11], devolver: [1,2,3,4,5,6,7,8,9,10,11] },
  admin:          { ver: [1,2,3,4,5,6,7,8,9,10,11], operar: [1,2,3,4,5,6,7,8,9,10,11], devolver: [1,2,3,4,5,6,7,8,9,10,11] },
};

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  const token = header ? header.replace('Bearer ', '') : req.query.token;
  if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.perfil !== 'admin') return res.status(403).json({ erro: 'Acesso restrito ao administrador' });
  next();
}

function requireGerente(req, res, next) {
  if (!['admin', 'gerente_geral'].includes(req.user.perfil)) return res.status(403).json({ erro: 'Acesso restrito a gerentes' });
  next();
}

function podeVerEtapa(user, etapa, db) {
  if (['admin', 'gerente_geral'].includes(user.perfil)) return true;
  // Verifica permissão granular
  const perm = db.prepare('SELECT pode_ver FROM permissoes WHERE user_id = ? AND etapa = ?').get(user.id, etapa);
  if (perm) return perm.pode_ver === 1;
  // Fallback para perfil padrão
  const padrao = PERFIL_ETAPAS[user.perfil];
  return padrao ? padrao.ver.includes(etapa) : false;
}

function podeOperarEtapa(user, etapa, db) {
  if (['admin', 'gerente_geral'].includes(user.perfil)) return true;
  const perm = db.prepare('SELECT pode_operar FROM permissoes WHERE user_id = ? AND etapa = ?').get(user.id, etapa);
  if (perm) return perm.pode_operar === 1;
  const padrao = PERFIL_ETAPAS[user.perfil];
  return padrao ? padrao.operar.includes(etapa) : false;
}

function podeDevolverEtapa(user, etapa, db) {
  if (['admin', 'gerente_geral'].includes(user.perfil)) return true;
  const perm = db.prepare('SELECT pode_devolver FROM permissoes WHERE user_id = ? AND etapa = ?').get(user.id, etapa);
  if (perm) return perm.pode_devolver === 1;
  const padrao = PERFIL_ETAPAS[user.perfil];
  return padrao ? padrao.devolver.includes(etapa) : false;
}

module.exports = { authMiddleware, requireAdmin, requireGerente, podeVerEtapa, podeOperarEtapa, podeDevolverEtapa, JWT_SECRET, PERFIL_ETAPAS };
