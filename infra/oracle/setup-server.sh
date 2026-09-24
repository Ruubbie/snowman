#!/usr/bin/env bash
# One-time (and re-runnable) setup of the Snowman backbone on an Ubuntu 24.04 server.
# Usage: sudo bash setup-server.sh /path/to/uploaded.env
# Installs Node 22, clones/updates the repo into /opt/snowman, creates the MariaDB
# database + user, writes /opt/snowman/.env, runs migrations and installs a systemd
# service plus a nightly database backup. nginx/HTTPS is configured separately.
set -euo pipefail
UPLOADED_ENV="${1:?pass the uploaded .env path}"
APP_DIR=/opt/snowman
REPO=https://github.com/Ruubbie/snowman.git

echo "== node"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q nodejs >/dev/null
fi
node -v

echo "== user + code"
id snowman >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/snowman --shell /usr/sbin/nologin snowman
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull -q --ff-only
else
  git clone -q "$REPO" "$APP_DIR"
fi
chown -R snowman:snowman "$APP_DIR"
sudo -u snowman bash -c "cd $APP_DIR && npm ci --omit=dev --workspace @snowman/backbone --include-workspace-root --no-audit --no-fund --loglevel=error"

echo "== database"
ENV_FILE="$APP_DIR/.env"
if [ -f "$ENV_FILE" ] && grep -q '^DATABASE_URL=mysql://snowman:' "$ENV_FILE"; then
  DB_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
  echo "keeping existing database login"
else
  DB_PASS=$(openssl rand -hex 24)
  mariadb -e "CREATE DATABASE IF NOT EXISTS snowman CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER IF NOT EXISTS 'snowman'@'localhost' IDENTIFIED BY '$DB_PASS';
    ALTER USER 'snowman'@'localhost' IDENTIFIED BY '$DB_PASS';
    GRANT ALL PRIVILEGES ON snowman.* TO 'snowman'@'localhost'; FLUSH PRIVILEGES;"
  DB_URL="mysql://snowman:$DB_PASS@127.0.0.1:3306/snowman"
fi

echo "== .env (secrets copied from the uploaded file, never printed)"
{
  echo "PORT=4000"
  echo "HOST=127.0.0.1"
  echo "TZ_NAME=Europe/Amsterdam"
  echo "DATABASE_URL=$DB_URL"
  grep -E '^(ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID|OLAF_MODEL_FAST|OLAF_MODEL_SMART|AI_MONTHLY_BUDGET_USD)=' "$UPLOADED_ENV" || true
  echo "PERSONA_FILE=$APP_DIR/data/persona.md"
} > "$ENV_FILE"
chown snowman:snowman "$ENV_FILE"; chmod 600 "$ENV_FILE"
shred -u "$UPLOADED_ENV" 2>/dev/null || rm -f "$UPLOADED_ENV"
mkdir -p "$APP_DIR/data"; chown snowman:snowman "$APP_DIR/data"
echo "keys present: $(grep -c -E '^(ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID)=.+' "$ENV_FILE") of 2"

echo "== migrations"
sudo -u snowman bash -c "cd $APP_DIR/apps/backbone && node --env-file=$ENV_FILE scripts/migrate.js"

echo "== service"
cat > /etc/systemd/system/snowman.service <<UNIT
[Unit]
Description=Snowman backbone (Olaf)
After=network-online.target mariadb.service
Wants=network-online.target

[Service]
User=snowman
WorkingDirectory=$APP_DIR/apps/backbone
ExecStart=/usr/bin/node --env-file=$ENV_FILE src/server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now snowman >/dev/null 2>&1
systemctl restart snowman
sleep 3
systemctl is-active snowman
curl -fsS http://127.0.0.1:4000/v1/health; echo

echo "== nightly backup (03:15, keeps 14 days)"
mkdir -p /var/backups/snowman
cat > /etc/cron.d/snowman-backup <<'CRON'
15 3 * * * root mariadb-dump --single-transaction snowman | gzip > /var/backups/snowman/snowman-$(date +\%F).sql.gz && find /var/backups/snowman -name '*.sql.gz' -mtime +14 -delete
CRON
echo "done"
