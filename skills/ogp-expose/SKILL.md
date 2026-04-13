---
skill_name: ogp-expose
version: 0.4.0
description: Expose OGP via a public HTTPS endpoint, usually a stable Cloudflare hostname or named tunnel. Use when the user wants to verify or fix gateway reachability, align `gatewayUrl` with the real public endpoint, or set up temporary cloudflared/ngrok exposure for testing.
trigger: Use when the user wants to expose their OGP daemon to the internet, get a public URL for federation, or set up a tunnel for peer discovery.
requires:
  bins:
    - ogp
  optional_bins:
    - cloudflared
    - ngrok
  state_paths:
    - ~/.ogp-meta/config.json
    - ~/.ogp/config.json
    - ~/.ogp-hermes/config.json
    - ~/.ogp/tunnel.pid
    - ~/.ogp/tunnel.log
    - ~/.cloudflared/config.yml
  install: npm install -g @dp-pcs/ogp
  docs: https://github.com/dp-pcs/ogp
---

## Security Note

**Tunnels are optional — and often more private than alternatives.**

`ogp expose` can create a temporary public URL for your OGP daemon. This is one approach, not the only approach. You can expose your gateway however you prefer:

- **Named Cloudflare tunnel / stable HTTPS hostname** (preferred) — long-lived canonical URL for federation
- **Cloudflared/ngrok temporary tunnel** — useful for ad hoc testing
- **Reverse proxy** (nginx, Caddy, etc.) — if you have a server with a static IP
- **VPN/Tailscale** — federate only with peers on the same network
- **Any publicly reachable URL** — update `gatewayUrl` in `~/.ogp/config.json` manually

The tunnel approach is provided as a zero-config convenience. It installs no persistent services unless you explicitly run `ogp install` (which creates a LaunchAgent/systemd service and asks for confirmation first).

## Prerequisites

The OGP daemon must be installed. If you see errors like 'ogp: command not found', install it first:

```bash
npm install -g @dp-pcs/ogp
ogp-install-skills
ogp setup
ogp config show
```

Full documentation: https://github.com/dp-pcs/ogp



# OGP Expose - Public Tunnel Setup

This skill helps expose the OGP daemon to the internet and, more importantly, confirm that the public discovery endpoint matches the intended framework identity.

## When to Use

Use this skill when:
- User wants to make their OGP daemon publicly accessible
- User needs a public URL for federation
- User wants to set up or verify a stable Cloudflare route
- User is testing OGP federation remotely
- User suspects `gatewayUrl` or tunnel config is stale or mismatched

## Framework Selection

If multiple frameworks are enabled, choose the framework first:

```bash
ogp config show
ogp --for openclaw status
ogp --for hermes status
```

Use `--for <framework>` on all exposure and verification commands when the target is not obvious.

## Guided Wizard

Follow this decision order every time:

1. **Cloudflare named tunnel + stable hostname** if the user has a domain on Cloudflare or wants a durable production URL.
2. **ngrok** if they need a stable-enough ad hoc URL and already have ngrok/auth configured.
3. **Temporary Cloudflare quick tunnel** only for fast testing when the URL can change on restart.

Ask or determine these three facts first:

1. Which framework is being exposed (`openclaw`, `hermes`, or another configured framework)?
2. Does the user want a **stable long-lived URL** or just a **temporary test URL**?
3. Do they already have **Cloudflare DNS/domain control** or **ngrok auth** available?

Then route them through exactly one branch below instead of mixing options.

## Branch 1: Stable Cloudflare Named Tunnel

Choose this when the user wants the recommended path.

Checklist:

1. Confirm the framework and its daemon port.
2. Choose the canonical hostname that should become `gatewayUrl`.
3. Create or verify the named tunnel.
4. Route DNS to the tunnel.
5. Point ingress at the correct local daemon port.
6. Set `gatewayUrl` to the same public hostname.
7. Verify local card, public card, and config all agree.

Primary repo doc:

- `docs/cloudflare-named-tunnel-setup.md`

Use that doc as the copy-paste path instead of rewriting the steps from scratch.

Success criteria:

- The public `/.well-known/ogp` card loads.
- Its `gatewayUrl` matches the intended hostname.
- Its public key matches the local daemon card.

## Branch 2: ngrok

Choose this when the user wants something faster than named Cloudflare but more intentional than a throwaway quick tunnel.

Checklist:

1. Confirm ngrok is installed and authenticated.
2. Start the tunnel against the correct local daemon port.
3. Capture the HTTPS URL.
4. Update `gatewayUrl` to that URL only if it is the intended endpoint for current federation.
5. Verify the public `/.well-known/ogp` card.

Use this command path:

```bash
ogp --for openclaw expose --method ngrok
```

## Branch 3: Temporary Cloudflare Quick Tunnel

Choose this only for short-lived testing.

Checklist:

1. Start the quick tunnel on the correct daemon port.
2. Copy the temporary HTTPS URL.
3. Warn that it changes on restart.
4. Update `gatewayUrl` only if the user is intentionally federating against this temporary URL.
5. Verify the public `/.well-known/ogp` card before testing federation.

Use this command path:

```bash
ogp --for openclaw expose
```

## Verification Flow

Always end with this verification sequence:

```bash
curl -s http://127.0.0.1:<daemon-port>/.well-known/ogp
curl -s https://your-public-hostname/.well-known/ogp
```

Confirm:

1. Public key matches local.
2. Public `gatewayUrl` matches config `gatewayUrl`.
3. The framework/port behind the hostname is the one the user intended.

If any of those disagree, do not treat the gateway as ready for federation.

## Recommended Production Baseline

Prefer one stable HTTPS hostname per framework:

- OpenClaw: `https://ogp.example.com`
- Hermes: `https://hermes.example.com`

Those hostnames should terminate at a named Cloudflare tunnel or equivalent reverse proxy and forward to the local daemon port for that framework.

After any tunnel or routing change, verify all three values agree:

1. Local daemon discovery card
2. Public discovery card
3. `gatewayUrl` in the framework config

```bash
curl -s http://127.0.0.1:18790/.well-known/ogp
curl -s https://ogp.example.com/.well-known/ogp
```

The public key and `gatewayUrl` should match. If they do not, do not federate yet.

## Prerequisites

### For Cloudflared (Recommended)

Install cloudflared:

```bash
# macOS (Homebrew)
brew install cloudflared

# Linux
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

# Windows
# Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

### For ngrok

Install ngrok:

```bash
# macOS (Homebrew)
brew install ngrok/ngrok/ngrok

# Linux/Windows
# Download from: https://ngrok.com/download
```

Sign up at https://ngrok.com and get your auth token:

```bash
ngrok config add-authtoken <your-token>
```

## Command Reference

### Temporary Cloudflare Quick Tunnel

```bash
ogp --for openclaw expose
```

This will:
1. Start a cloudflared tunnel on the daemon port
2. Display a public URL (e.g., `https://abc-def-123.trycloudflare.com`)
3. Keep the tunnel running until you stop it (Ctrl+C)

**Update your config:**
```bash
# Edit the correct framework config
# Set "gatewayUrl" to the URL shown by cloudflared only if this temporary URL is the intended canonical endpoint
```

### ngrok Tunnel

```bash
ogp --for openclaw expose --method ngrok
```

This will:
1. Start an ngrok tunnel on the daemon port
2. Display a public URL (e.g., `https://abc123.ngrok-free.app`)
3. Open ngrok web interface at http://127.0.0.1:4040

**Update your config:**
```bash
# Edit ~/.ogp/config.json
# Set "gatewayUrl" to the ngrok URL
```

## Worked Flows

### Temporary Exposure Flow

1. **Run OGP setup:**
   ```bash
   ogp setup
   ```
   - Enter temporary gateway URL (you'll update this)

2. **Start the daemon:**
   ```bash
   ogp --for openclaw start
   ```

3. **In a new terminal, expose the daemon:**
   ```bash
   ogp --for openclaw expose
   ```

4. **Copy the public URL** shown by cloudflared/ngrok

5. **Update the config:**
   ```bash
   # Edit ~/.ogp/config.json
   # Update "gatewayUrl": "https://your-tunnel-url"
   ```

6. **Restart the daemon:**
   ```bash
   # Stop with Ctrl+C in the daemon terminal
   ogp --for openclaw start
   ```

7. **Verify the setup:**
   ```bash
   # In another terminal or browser, test:
   curl https://your-tunnel-url/.well-known/ogp
   ```

### Stable Named Tunnel Flow

For production use, create a permanent cloudflared tunnel:

```bash
# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create ogp-daemon

# Note the tunnel ID shown

# Create config file: ~/.cloudflared/config.yml
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <tunnel-id>
credentials-file: ~/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: ogp.yourdomain.com
    service: http://localhost:18790
  - hostname: hermes.yourdomain.com
    service: http://localhost:18793
  - service: http_status:404
EOF

# Run tunnel
cloudflared tunnel run sarcastek-backend
```

Then make sure each framework config uses its own canonical hostname:

```json
{
  "gatewayUrl": "https://ogp.yourdomain.com"
}
```

```json
{
  "gatewayUrl": "https://hermes.yourdomain.com"
}
```

## Selection Notes

### Cloudflared / Stable Hostname
**Pros:**
- Free, unlimited usage
- No signup required for temporary tunnels
- Fast and reliable
- Can create permanent tunnels with custom domains

**Cons:**
- URL changes on each restart (unless using named tunnel)
- Requires Cloudflare account for permanent tunnels

### ngrok
**Pros:**
- Web interface at http://127.0.0.1:4040
- Request inspection and replay
- Custom domains on paid plans
- Stable URLs on paid plans

**Cons:**
- Free tier has limitations
- Requires signup
- URL changes on free tier
- Usage limits on free tier

## Troubleshooting

### Tunnel won't start
- **Cloudflared not found:** Install cloudflared
- **ngrok not found:** Install ngrok and configure auth token
- **Port already in use:** Verify the framework's daemon port and stop stale listeners

### Public URL resolves but serves the wrong framework
- Check `ogp config show`
- Check the relevant framework config's `gatewayUrl`
- Verify local discovery card on the framework port
- Verify Cloudflare ingress routes the hostname to the expected local port
- If you recently switched from a temporary tunnel, remove stale fields like old temporary `gateway.publicUrl` overrides and keep only the canonical `gatewayUrl`

### Can't access public URL
- Check firewall settings
- Verify daemon is running (`ogp --for <framework> status`)
- Test locally first: `curl http://localhost:<port>/.well-known/ogp`

### Tunnel disconnects frequently
- Check internet connection
- Use permanent tunnel instead of temporary
- Consider running tunnel as a system service

## Running as a System Service

### macOS (launchd)

Create `~/Library/LaunchAgents/com.ogp.tunnel.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ogp.tunnel</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/cloudflared</string>
        <string>tunnel</string>
        <string>--url</string>
        <string>http://localhost:18790</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Load the service:
```bash
launchctl load ~/Library/LaunchAgents/com.ogp.tunnel.plist
```

### Linux (systemd)

Create `/etc/systemd/system/ogp-tunnel.service`:

```ini
[Unit]
Description=OGP Cloudflared Tunnel
After=network.target

[Service]
Type=simple
User=youruser
ExecStart=/usr/local/bin/cloudflared tunnel --url http://localhost:18790
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable ogp-tunnel
sudo systemctl start ogp-tunnel
```

## Security Notes

- Tunnel exposes your OGP daemon to the internet
- Only approved peers can send messages (signature verification)
- All messages are cryptographically signed
- Consider IP allowlisting for production use
- Use HTTPS tunnels only (cloudflared/ngrok handle this)
