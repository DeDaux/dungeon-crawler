#!/usr/bin/env bash
# setup.sh — provisions the dungeon-crawler multiplayer relay on a fresh
# Ubuntu 22.04/24.04 Hetzner Cloud VPS. Run as root (or with sudo).
#
# Usage: ./setup.sh <git-repo-url>
# Example: ./setup.sh https://github.com/DeDaux/dungeon-crawler.git

set -euo pipefail

REPO_URL="${1:?Usage: setup.sh <git-repo-url>}"
INSTALL_DIR=/opt/dungeon-crawler

echo "==> Installing Node.js 20.x and git"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git

echo "==> Creating dedicated service user"
id -u dungeon &>/dev/null || useradd --system --create-home --shell /usr/sbin/nologin dungeon

echo "==> Cloning/updating repo into $INSTALL_DIR"
if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" pull
else
    git clone "$REPO_URL" "$INSTALL_DIR"
fi
chown -R dungeon:dungeon "$INSTALL_DIR"

echo "==> Installing dependencies"
cd "$INSTALL_DIR" && npm install --omit=dev

echo "==> Installing systemd service"
cp "$INSTALL_DIR/server/deploy/dungeon-relay.service" /etc/systemd/system/dungeon-relay.service
systemctl daemon-reload
systemctl enable --now dungeon-relay

echo "==> Opening firewall port 8742"
if command -v ufw &>/dev/null; then
    ufw allow 8742/tcp || true
fi

echo "==> Done. Relay status:"
systemctl status dungeon-relay --no-pager

echo ""
echo "Relay is listening on ws://<server-ip>:8742"
echo "To redeploy after a git push: ssh in and run:"
echo "  cd $INSTALL_DIR && sudo git pull && sudo npm install --omit=dev && sudo systemctl restart dungeon-relay"
