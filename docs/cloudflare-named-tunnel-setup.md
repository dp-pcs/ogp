# Cloudflare Named Tunnel Setup for OGP

Use this when you already have a domain managed in Cloudflare and want a stable public OGP URL like `ogp.example.com`.

This guide assumes:
- OGP is running locally on port `18790`
- You already control the domain in Cloudflare
- You are setting up a locally managed named tunnel with `cloudflared`

## What this does

It creates a stable public hostname such as `https://ogp.example.com` and forwards it to your local OGP daemon at `http://localhost:18790`.

After this is working, set your OGP `gatewayUrl` to the same public URL.

## Copy-paste setup

Replace `ogp.yourdomain.com` below with your real hostname.

```bash
# 1. Install cloudflared if needed
brew install cloudflared

# 2. Login to Cloudflare in the browser
cloudflared tunnel login

# 3. Create a named tunnel called "ogp"
cloudflared tunnel create ogp

# 4. Route a public hostname to the tunnel
cloudflared tunnel route dns ogp ogp.yourdomain.com

# 5. Create the config directory if needed
mkdir -p ~/.cloudflared

# 6. List tunnels so you can copy the UUID for "ogp"
cloudflared tunnel list
```

Create `~/.cloudflared/config.yml` and replace `TUNNEL_UUID_HERE` with the real UUID from `cloudflared tunnel list`.

```yaml
tunnel: TUNNEL_UUID_HERE
credentials-file: /Users/YOUR_USERNAME/.cloudflared/TUNNEL_UUID_HERE.json

ingress:
  - hostname: ogp.yourdomain.com
    service: http://localhost:18790
  - service: http_status:404
```

Then start OGP and test the tunnel:

```bash
# 7. Start OGP
ogp start --background

# 8. Run the tunnel in the foreground once to test
cloudflared tunnel run ogp
```

In a second terminal:

```bash
# 9. Verify the public OGP card is reachable
curl -s https://ogp.yourdomain.com/.well-known/ogp
```

## Set gatewayUrl

Edit `~/.ogp/config.json` and make sure it includes:

```json
{
  "gatewayUrl": "https://ogp.yourdomain.com"
}
```

Then restart OGP:

```bash
ogp stop
ogp start --background
curl -s https://ogp.yourdomain.com/.well-known/ogp
```

The returned JSON should show the same `gatewayUrl`.

## Make the tunnel persistent

Once the foreground test works:

```bash
cloudflared service install
```

Then start the service using your system service manager.

## Common problems

If `cloudflared tunnel route dns` fails:
- The hostname may already have an existing DNS record
- The domain may not actually be managed by Cloudflare yet

If `curl https://ogp.yourdomain.com/.well-known/ogp` fails:
- OGP may not be running on port `18790`
- The hostname in `config.yml` may be wrong
- `gatewayUrl` in `~/.ogp/config.json` may still be blank or stale
- The tunnel may not be running yet

## Minimal success check

These both need to be true:

```bash
curl -s http://localhost:18790/.well-known/ogp
curl -s https://ogp.yourdomain.com/.well-known/ogp
```

And the public card should contain:

```json
{
  "gatewayUrl": "https://ogp.yourdomain.com"
}
```
