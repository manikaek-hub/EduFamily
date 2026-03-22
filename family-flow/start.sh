#!/bin/bash
# ═══════════════════════════════════════════
#  Family Flow — Script de lancement
# ═══════════════════════════════════════════

set -e

echo ""
echo "🦊 Family Flow — Démarrage..."
echo "═══════════════════════════════════════════"

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Répertoire du script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Vérifications ───
echo -e "${YELLOW}Vérification des dépendances...${NC}"

if ! command -v node &> /dev/null; then
  echo "❌ Node.js n'est pas installé. Installe-le d'abord : https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node --version | cut -d. -f1 | tr -d 'v')
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js >= 18 requis (trouvé: $(node --version))"
  exit 1
fi

echo -e "  ✅ Node.js $(node --version)"

# ─── Installation des dépendances si nécessaire ───
if [ ! -d "$SCRIPT_DIR/backend/node_modules" ]; then
  echo -e "${YELLOW}Installation des dépendances backend...${NC}"
  cd "$SCRIPT_DIR/backend" && npm install
fi

if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
  echo -e "${YELLOW}Installation des dépendances frontend...${NC}"
  cd "$SCRIPT_DIR/frontend" && npm install
fi

# ─── Vérification .env ───
if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
  echo -e "${YELLOW}Création du fichier .env backend...${NC}"
  cat > "$SCRIPT_DIR/backend/.env" << 'EOF'
ANTHROPIC_API_KEY=
PORT=3002
HEYGEN_API_KEY=
EOF
  echo "⚠️  Configure backend/.env avec tes clés API avant de continuer."
  exit 1
fi

# ─── Seed de la base de données ───
echo -e "${YELLOW}Initialisation de la base de données...${NC}"
cd "$SCRIPT_DIR/backend" && node src/db/seed.js 2>/dev/null || true

# ─── Lancement des tests ───
echo ""
echo -e "${YELLOW}Lancement des tests...${NC}"
cd "$SCRIPT_DIR/backend"
node tests/test-agents.js 2>/dev/null && \
node tests/test-chat-flow.js 2>/dev/null && \
node tests/test-engagement.js 2>/dev/null && \
echo -e "  ${GREEN}✅ Tous les tests passent !${NC}" || \
echo -e "  ⚠️  Certains tests ont échoué (voir ci-dessus)"

# ─── Démarrage du backend ───
echo ""
echo -e "${BLUE}Démarrage du backend (port 3002)...${NC}"
cd "$SCRIPT_DIR/backend" && node src/index.js &
BACKEND_PID=$!
sleep 2

# Vérifier que le backend est up
if curl -s http://localhost:3002/api/health > /dev/null 2>&1; then
  echo -e "  ${GREEN}✅ Backend démarré (PID: $BACKEND_PID)${NC}"
else
  echo "  ⚠️  Backend en cours de démarrage..."
fi

# ─── Démarrage du frontend ───
echo -e "${BLUE}Démarrage du frontend (port 3000)...${NC}"
cd "$SCRIPT_DIR/frontend" && PORT=3000 npm start &
FRONTEND_PID=$!

echo ""
echo -e "═══════════════════════════════════════════"
echo -e "${GREEN}🦊 Family Flow est prêt !${NC}"
echo ""
echo -e "  🌐 App :     ${BLUE}http://localhost:3000${NC}"
echo -e "  🔧 API :     ${BLUE}http://localhost:3002${NC}"
echo -e "  📱 Mobile :  regarde l'IP affichée par le backend"
echo ""
echo -e "  Pour arrêter : ${YELLOW}Ctrl+C${NC}"
echo -e "═══════════════════════════════════════════"

# ─── Cleanup on exit ───
cleanup() {
  echo ""
  echo "🛑 Arrêt de Family Flow..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  echo "👋 À bientôt !"
}
trap cleanup EXIT INT TERM

# Attendre
wait
