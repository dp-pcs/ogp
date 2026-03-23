---
skill_name: ogp-expose
version: 0.2.1
description: Expose OGP daemon via public tunnel (cloudflared/ngrok). Automates tunnel setup so federated peers can reach your gateway from anywhere on the internet, without exposing your real IP address.
trigger: Use when the user wants to expose their OGP daemon to the internet, get a public URL for federation, or set up a tunnel for peer discovery.
requires:
  bins:
    - ogp
  optional_bins:
    - cloudflared
    - ngrok
  state_paths:
    - ~/.ogp/config.json
    - ~/.ogp/tunnel.pid
    - ~/.ogp/tunnel.log
  install: npm install -g @dp-pcs/ogp
  docs: https://github.com/dp-pcs/ogp
---

## Security Note

**Tunnels are optional — and often more private than alternatives.**

`ogp expose` uses cloudflared or ngrok to create a secure public URL for your OGP daemon. This is one approach, not the only approach. You can expose your gateway however you prefer:

- **Cloudflared/ngrok tunnel** (default) — your real IP is never exposed; traffic routes through the tunnel provider's infrastructure
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
```

Full documentation: https://github.com/dp-pcs/ogp



# OGP Expose - Public Tunnel Setup

This skill helps expose the OGP daemon to the internet using cloudflared or ngrok tunnels.

## When to Use

Use this skill when:
- User wants to make their OGP daemon publicly accessible
- User needs a public URL for federation
- User wants to set up tunneling for OGP
- User is testing OGP federation remotely

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

## Usage

### Expose with Cloudflared (Default)

```bash
ogp expose
```

This will:
1. Start a cloudflared tunnel on the daemon port
2. Display a public URL (e.g., `https://abc-def-123.trycloudflare.com`)
3. Keep the tunnel running until you stop it (Ctrl+C)

**Update your config:**
```bash
# Edit ~/.ogp/config.json
# Set "gatewayUrl" to the URL shown by cloudflared
```

### Expose with ngrok

```bash
ogp expose --method ngrok
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

## Complete Setup Workflow

### First-time Setup

1. **Run OGP setup:**
   ```bash
   ogp setup
   ```
   - Enter temporary gateway URL (you'll update this)

2. **Start the daemon:**
   ```bash
   ogp start
   ```

3. **In a new terminal, expose the daemon:**
   ```bash
   ogp expose
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
   ogp start
   ```

7. **Verify the setup:**
   ```bash
   # In another terminal or browser, test:
   curl https://your-tunnel-url/.well-known/ogp
   ```

### Permanent Setup with Cloudflared Named Tunnel

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
  - service: http_status:404
EOF

# Run tunnel
cloudflared tunnel run ogp-daemon
```

## Comparison: Cloudflared vs ngrok

### Cloudflared
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
- **Port already in use:** Stop other services on port 18790

### Can't access public URL
- Check firewall settings
- Verify daemon is running (`ogp status`)
- Test locally first: `curl http://localhost:18790/.well-known/ogp`

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
