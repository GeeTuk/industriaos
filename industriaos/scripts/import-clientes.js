// ── Script de importação massiva de clientes ──────────────────────
// Uso: node scripts/import-clientes.js
// Deve ser rodado na raiz do projeto no VPS

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'industriaos.db');
const JSON_PATH = path.join(__dirname, 'clientes-import.json');

if (!fs.existsSync(JSON_PATH)) {
  console.error('❌ Arquivo clientes-import.json não encontrado em scripts/');
  process.exit(1);
}

const db = new Database(DB_PATH);
const clientes = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8').replace(/^﻿/, ''));

const insert = db.prepare(`
  INSERT INTO clientes (razao_social, nome_fantasia, cnpj_cpf, telefone, email, cidade, estado, endereco, observacoes, status)
  VALUES (@razao_social, @nome_fantasia, @cnpj_cpf, @telefone, @email, @cidade, @estado, @endereco, @observacoes, 'ativo')
`);

const checkExiste = db.prepare('SELECT id FROM clientes WHERE razao_social = ? OR (cnpj_cpf IS NOT NULL AND cnpj_cpf != "" AND cnpj_cpf = ?)');

let inseridos = 0;
let duplicados = 0;
let erros = 0;

const importar = db.transaction(() => {
  for (const c of clientes) {
    if (!c.razao_social) continue;
    try {
      const existe = checkExiste.get(c.razao_social, c.cnpj_cpf || '');
      if (existe) {
        duplicados++;
        continue;
      }
      insert.run(c);
      inseridos++;
    } catch (e) {
      erros++;
      console.warn(`  ⚠️  Erro ao inserir "${c.razao_social}": ${e.message}`);
    }
  }
});

console.log('\n🔄 Importando clientes...');
importar();

console.log('\n──────────────────────────────');
console.log(`✅ Inseridos:   ${inseridos}`);
console.log(`⏭️  Duplicados:  ${duplicados} (já existiam)`);
console.log(`❌ Erros:       ${erros}`);
console.log(`📋 Total:       ${clientes.length}`);
console.log('──────────────────────────────\n');

db.close();
