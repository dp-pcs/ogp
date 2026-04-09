# Rendezvous — Optional Discovery And Invite Layer

> Available in v0.2.14+

OGP's rendezvous service is an optional convenience layer for pubkey lookup and invite codes. It helps peers find each other more easily once each gateway is already publicly reachable.

## What It Solves

For two OGP gateways to federate, both still need to be publicly reachable. Rendezvous helps by reducing coordination overhead:

- peer discovery by public key
- invite-code UX
- avoiding manual URL/pubkey exchange when a peer is already advertising a reachable endpoint

Rendezvous does **not** provide NAT traversal, UDP hole punching, or relay delivery.

## How It Works

1. Your OGP daemon starts and auto-registers with the rendezvous server (`POST /register`) using your public key and connection hints
2. A 30-second heartbeat keeps your registration alive (90-second TTL on the server)
3. When you want to connect to a peer, your daemon looks them up by public key (`GET /peer/:pubkey`) and connects directly
4. On shutdown, your daemon deregisters (`DELETE /peer/:pubkey`)

The rendezvous server **never touches message content** — it only stores connection hints. All OGP messages remain end-to-end signed between peers.

## Configuration

Add the `rendezvous` block to `~/.ogp/config.json`:

```json
{
  "daemonPort": 18790,
  "openclawUrl": "http://localhost:18789",
  "openclawToken": "your-token",
  "rendezvous": {
    "enabled": true,
    "url": "https://rendezvous.elelem.expert"
  }
}
```

Rendezvous is optional. If you already have stable public URLs or are happy sharing them directly, you do not need it.

## Federation Invite Flow (v0.2.15+)

The invite flow removes the need to manually exchange public keys. One command generates a short-lived code; your peer uses it to connect directly.

### Generate an invite

```bash
ogp federation invite
```

Output:
```
Your invite code: a3f7k2  (expires in 10 minutes)
Share this with your peer — they run: ogp federation accept a3f7k2
```

### Accept an invite

```bash
ogp federation accept a3f7k2
```

Output:
```
Connected to a3f7k2... via rendezvous ✅
```

That's the full flow. No pubkey exchange and less coordination overhead, but the peer still needs a reachable gateway endpoint behind the lookup.

### How invite codes work

- `ogp federation invite` POSTs to the rendezvous server, which generates a 6-char alphanumeric token and stores it alongside your pubkey + connection hints with a 10-minute TTL
- `ogp federation accept <token>` fetches the token from rendezvous, resolves it to a pubkey + address, and auto-connects using the standard federation connect flow
- Tokens are non-consuming (multiple peers can accept the same invite within the TTL window)

## Commands Reference

| Command | Description |
|---------|-------------|
| `ogp federation invite` | Generate a short-lived invite code (10 min TTL) |
| `ogp federation accept <token>` | Accept an invite and auto-connect to the peer |
| `ogp federation connect <pubkey>` | Connect to a peer by public key (rendezvous lookup) |

## Rendezvous Server API

The OGP rendezvous server is open source and self-hostable (source in `packages/rendezvous/`).

Public instance: `https://rendezvous.elelem.expert`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check: `{ ok: true, peers: <count> }` |
| `/register` | POST | Register/heartbeat: `{ pubkey, port, timestamp }` |
| `/peer/:pubkey` | GET | Look up peer connection hints |
| `/peer/:pubkey` | DELETE | Deregister on shutdown |
| `/invite` | POST | Generate invite token: `{ pubkey, port }` → `{ token, expiresIn }` |
| `/invite/:token` | GET | Resolve invite: → `{ pubkey, ip, port }` |

## Privacy & Trust

- The rendezvous server stores only: public key, connection hints, and last-seen timestamp
- No message content ever passes through rendezvous
- Registrations expire after 90 seconds without a heartbeat
- The server is open source — you can self-host if you prefer

## Self-Hosting

```bash
cd packages/rendezvous
npm install
npm run build
node dist/index.js
```

Set `PORT` environment variable (default: 3000). Update your `rendezvous.url` config to point to your instance.
