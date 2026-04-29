#!/bin/bash
# ── Script de atualização IndustriaOS ────────────────────────────
# Uso: ./update.sh  ou  bash update.sh

set -e

REPO_DIR="/opt/industriaos/industriaos"
APP_NAME="industriaos"

echo ""
echo "🔄 Atualizando IndustriaOS..."
echo "──────────────────────────────"

# Puxar últimas alterações do GitHub
cd "$REPO_DIR"
git pull origin main

# Instalar novas dependências (se houver)
cd "$REPO_DIR/backend"
npm install --omit=dev

# Reiniciar aplicação
pm2 restart "$APP_NAME"

echo ""
echo "✅ Atualização concluída!"
echo "──────────────────────────────"
pm2 status "$APP_NAME"
echo ""
