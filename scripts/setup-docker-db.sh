#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> Project: $(pwd)"
echo "==> Starting Postgres (Docker)..."
docker compose up -d
echo "==> Waiting for Postgres..."
sleep 3
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi
if command -v nvm >/dev/null 2>&1; then
  nvm use 2>/dev/null || true
fi
echo "==> Prisma: create/update tables..."
npx prisma db push
echo "==> Done. Run: npm run dev"
echo "==> Then open: http://localhost:3000/api/health (or whatever port Next prints)"
