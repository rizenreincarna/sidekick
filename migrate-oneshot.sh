#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# MIGRATION ONESHOT — Marie + Sidekick App
# Run this on the NEW VPS after setup.
# ============================================================

NEW_VPS_IP="${1:-}"
if [ -z "$NEW_VPS_IP" ]; then
  echo "Usage: $0 <NEW_VPS_IP>"
  echo "Example: $0 123.456.789.0"
  exit 1
fi

OLD_VPS_IP=""  # Fill in old VPS IP

echo "========================================"
echo "STEP 1/9 — Clone sidekick code"
echo "========================================"
cd /root
git clone https://github.com/rizenreincarna/sidekick.git my-app
cd /root/my-app
git checkout main
git pull origin main

echo ""
echo "========================================"
echo "STEP 2/9 — Install dependencies & build"
echo "========================================"
cd /root/my-app
npx bun install
npx prisma generate
npx next build

echo ""
echo "========================================"
echo "STEP 3/9 — Copy data from old VPS"
echo "========================================"
rsync -avz root@$OLD_VPS_IP:/root/my-app/.env /root/my-app/.env
rsync -avz root@$OLD_VPS_IP:/root/my-app/db/ /root/my-app/db/
rsync -avz root@$OLD_VPS_IP:/root/my-app/secrets/ /root/my-app/secrets/
rsync -avz root@$OLD_VPS_IP:/root/my-app/pickup-payments/ /root/my-app/pickup-payments/
rsync -avz root@$OLD_VPS_IP:/root/my-app/expenses/ /root/my-app/expenses/
rsync -avz root@$OLD_VPS_IP:/etc/ntfy/server.yml /etc/ntfy/server.yml

echo ""
echo "========================================"
echo "STEP 4/9 — Set up PM2"
echo "========================================"
PORT=3001 pm2 start /root/my-app/.next/standalone/server.js --name sidekick-app
pm2 save

echo ""
echo "========================================"
echo "STEP 5/9 — Set up Caddy"
echo "========================================"
# Append erthsidekick.xyz block to /etc/caddy/Caddyfile
cat >> /etc/caddy/Caddyfile << 'CADDY'

erthsidekick.xyz {
	reverse_proxy 127.0.0.1:3001
}

app.erthsidekick.xyz {
	reverse_proxy 127.0.0.1:3001
}
CADDY
caddy reload --config /etc/caddy/Caddyfile

echo ""
echo "========================================"
echo "STEP 6/9 — Set up ntfy"
echo "========================================"
systemctl restart ntfy

echo ""
echo "========================================"
echo "STEP 7/9 — Set up LLM Wiki"
echo "========================================"
cd /root
git clone https://github.com/rizenreincarna/sidekick.git llm-wiki-project
cd /root/llm-wiki-project
git checkout wiki
git pull origin wiki
npm install

# Start wiki API server
pm2 start "npm run dev" --name llm-wiki
pm2 save

echo ""
echo "========================================"
echo "STEP 8/9 — Create Marie profile on Hermes"
echo "========================================"
hermes profile create marie
hermes profile switch marie
hermes skill install sidekick-db-ops
hermes skill install hero-daily-route-briefing
hermes skill install hero-daily-closeout
hermes skill install bills_tracker
hermes skill install llm-wiki
hermes skill install wiki-audit

# Set Telegram bot token (EDIT THIS)
hermes config set telegram.bot_token "YOUR_MARIE_BOT_TOKEN_HERE"

echo ""
echo "========================================"
echo "STEP 9/9 — Import Marie's knowledge into Mnemosyne"
echo "========================================"
# If Mnemosyne has a CLI:
# mnemosyne import /root/marie-knowledge-export-2026-07-15.md
#
# If Mnemosyne has an API:
# curl -X POST http://localhost:8888/memories/bulk \
#   -H "Content-Type: application/json" \
#   -d @/root/marie-knowledge-export-2026-07-15.json
#
# Otherwise, manually seed Marie's first conversation with the file.

echo ""
echo "========================================"
echo "✅ MIGRATION COMPLETE"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Point DNS: erthsidekick.xyz → $NEW_VPS_IP"
echo "  2. Build & install APK:"
echo "     cd /root/my-app/android-app"
echo "     ./gradlew assembleRelease"
echo "  3. Install the APK on your phone"
echo "  4. Test everything at https://erthsidekick.xyz"
echo "  5. Keep old VPS running 48h for rollback"
echo ""
