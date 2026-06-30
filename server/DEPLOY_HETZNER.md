# Deploying the Multiplayer Relay to Hetzner Cloud

This replaces the free Render relay (`wss://dungeon-crawler-waht.onrender.com`)
with an always-on VPS close to Lithuania, eliminating cold-starts and cutting
relay latency to ~10-30ms.

## 1. Create the server

1. Sign up at https://www.hetzner.com/cloud
2. **New Server** →
   - **Location**: Helsinki (or Falkenstein, Germany — both are good for
     Lithuania, Helsinki is usually a bit closer).
   - **Image**: Ubuntu 24.04
   - **Type**: CX22 (cheapest, ~€4/month) — plenty for a JSON relay.
   - **SSH key**: add your public key (or use the password Hetzner emails
     you, then SSH in and change it).
3. Once created, note the server's **public IPv4 address**.

## 2. Run the setup script

SSH in as root:

```bash
ssh root@<server-ip>
```

Download and run the setup script (it installs Node.js, clones this repo,
sets up a systemd service, and opens the firewall port):

```bash
curl -fsSL https://raw.githubusercontent.com/DeDaux/dungeon-crawler/master/server/deploy/setup.sh -o setup.sh
chmod +x setup.sh
./setup.sh https://github.com/DeDaux/dungeon-crawler.git
```

This starts the relay on `ws://<server-ip>:8742`, running as the
`dungeon-relay` systemd service (auto-restarts on crash, starts on boot).

## 3. Update the game's default relay URL

In `src/screens/mpLobby.js`, change:

```js
const DEFAULT_SERVER = 'wss://dungeon-crawler-waht.onrender.com';
```

to:

```js
const DEFAULT_SERVER = 'ws://<server-ip>:8742';
```

(Use `ws://`, not `wss://` — there's no TLS cert on a plain IP. If you later
point a domain name at the server, you can add TLS via a reverse proxy like
Caddy/nginx and switch to `wss://`.)

## 4. Redeploying after future code changes

```bash
ssh root@<server-ip>
cd /opt/dungeon-crawler
git pull
npm install --omit=dev
systemctl restart dungeon-relay
```

## 5. Useful commands

```bash
systemctl status dungeon-relay   # check it's running
journalctl -u dungeon-relay -f   # tail logs (connect/disconnect messages)
systemctl restart dungeon-relay  # restart after a crash/update
```

## Notes

- Port `8742` is opened via `ufw`. If `ufw` isn't enabled at all (default on
  some Hetzner images), the port is open by default — no extra step needed.
- The service runs as an unprivileged `dungeon` system user, not root.
- `Restart=on-failure` in the systemd unit means a relay crash auto-restarts
  within 3 seconds.
