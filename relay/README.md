# Peep Relay — Raspberry Pi 5 setup

Turns a fresh Raspberry Pi 5 into a **Peep SRT relay node**:

```
Provider SRT → Raspberry Pi (FFmpeg, stream-copy) → Cloudflare Stream Live Input → HLS → Peep
```

The Pi runs a small authenticated API that the Peep admin controls **through a Supabase Edge Function over a Cloudflare Tunnel** — the browser never talks to the Pi directly, and no public port is exposed.

---

## 0. OS

**Raspberry Pi OS Lite (64-bit), Bookworm.** Headless, no desktop. Wired Ethernet recommended.

Flash with Raspberry Pi Imager → in the gear/settings: set hostname (e.g. `peep-relay`), **enable SSH**, set username/password, configure Wi-Fi if not using Ethernet.

SSH in:
```bash
ssh <you>@peep-relay.local
```

---

## 1. System update + FFmpeg

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y ffmpeg git curl
ffmpeg -version   # confirm it's installed
```

## 2. Node.js 20 (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
```

## 3. Install the relay

```bash
# dedicated unprivileged user + install dir
sudo useradd --system --create-home --shell /usr/sbin/nologin peep || true
sudo mkdir -p /opt/peep-relay
# copy the relay/ folder here (scp, git clone, or a USB stick). Example with git:
# sudo git clone <your-repo> /tmp/peep && sudo cp -r /tmp/peep/relay/* /opt/peep-relay/
sudo chown -R peep:peep /opt/peep-relay
cd /opt/peep-relay
sudo -u peep npm install --omit=dev
```

## 4. Configure the token

```bash
# generate a strong shared secret
openssl rand -hex 32
# -> copy the output

sudo -u peep cp .env.example .env
sudo -u peep nano .env
#   RELAY_TOKEN=<paste the hex from above>
#   RELAY_PORT=8088
#   RELAY_STATE_FILE=/var/lib/peep-relay/relay-state.json
```

> Store this **same token** as a Supabase secret named `RELAY_TOKEN` (used by the `relay-control` edge function). It must never appear in the web frontend.

## 5. Run as a service (auto-starts on boot)

```bash
sudo cp /opt/peep-relay/peep-relay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now peep-relay
systemctl status peep-relay        # should be active (running)
```

Verify locally (needs the token):
```bash
curl -s http://localhost:8088/health -H "Authorization: Bearer <RELAY_TOKEN>"
# -> {"ok":true,"ffmpeg":"ffmpeg version ...","activeRelays":0,...}
```

## 6. Cloudflare Tunnel (secure remote access, no open ports)

```bash
# install cloudflared (arm64)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared
sudo mv cloudflared /usr/local/bin/ && sudo chmod +x /usr/local/bin/cloudflared

cloudflared tunnel login                      # opens a browser link; pick your Cloudflare zone
cloudflared tunnel create peep-relay          # note the Tunnel UUID it prints
```

Create `/etc/cloudflared/config.yml`:
```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /root/.cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: relay.watchpeep.tv       # a subdomain you control in Cloudflare
    service: http://localhost:8088
  - service: http_status:404
```

Route DNS + run as a service:
```bash
sudo cloudflared tunnel route dns peep-relay relay.watchpeep.tv
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Verify from anywhere:
```bash
curl -s https://relay.watchpeep.tv/health -H "Authorization: Bearer <RELAY_TOKEN>"
```

## 7. Reboot test

```bash
sudo reboot
# after it comes back:
systemctl status peep-relay cloudflared     # both active
```
Any feeds that were running are resumed automatically from `relay-state.json`.

---

## What Peep sends this API (control plane)

All authenticated with `Authorization: Bearer <RELAY_TOKEN>`:

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/health` | — | Pi + FFmpeg health, active relay count |
| POST | `/feeds/:id/test` | `{source}` | Probe the provider SRT (codec/res/fps/audio/bitrate or a specific error) |
| POST | `/feeds/:id/start` | `{source, destination}` | Start FFmpeg: provider SRT → Cloudflare |
| POST | `/feeds/:id/stop` | — | Stop the relay |
| POST | `/feeds/:id/restart` | — | Restart |
| GET | `/feeds/:id/status` | — | running / uptime / restarts / last error |

`source` = the provider SRT (`host, port, mode, stream_id, passphrase, latency`).
`destination` = the Cloudflare push target (`{ type: "rtmps"|"srt", url }`). FFmpeg uses `-c copy` (remux, no re-encode) unless a transcode is required.

## Security notes
- The relay refuses to start without a `RELAY_TOKEN` (≥24 chars).
- FFmpeg args are built from **validated fields** — no shell, no arbitrary commands.
- Passphrases are held in memory + a **root-only** state file (`0600`); never logged, never returned.
- No inbound ports are opened — all access is via the outbound Cloudflare Tunnel.
