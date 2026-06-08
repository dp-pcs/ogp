# Transport Modes Design

**Status:** 🚧 Proposed — under review. The rendezvous registration schema change is adjacent to the Ed25519 trust model and should be reviewed carefully before merge.

**Date:** 2026-06-08

## Problem

OGP's biggest adoption deterrent is the tunnel requirement. Today peers deliver
Ed25519-signed envelopes by **direct HTTP POST to each other's public
`gatewayUrl`**, and the rendezvous server is a pubkey→address directory that
hands back a raw `ip:port`. Even *with* rendezvous, a peer must be publicly
reachable — which is exactly the job the cloudflared/ngrok tunnel does.

The tunnel is **not a transport requirement — it's a reachability hack.** We want
to make reachability a *user choice*, so people who don't want to run a tunnel can
opt into a relay instead, without forcing anyone already on tunnels to change.

## Key insight that makes this safe

**OGP messages are already Ed25519-signed end-to-end.** Any relay/transport in the
middle is *untrusted by design* — it can see envelope metadata but cannot forge,
alter, or impersonate. This radically lowers the security bar for the transport
layer and makes "route through a relay" perfectly acceptable. This single fact is
what makes a pluggable transport possible without weakening the trust model.

## Goal

A per-user, per-daemon `transport` setting that lets each operator choose how their
daemon is reached, defaulting to **today's behavior** so no existing setup breaks:

- **`direct`** (default) — public `gatewayUrl` via tunnel / public IP / port-forward. Exactly what works today. Zero change for current users.
- **`relay`** — daemon holds a persistent outbound WebSocket to a relay; messages route peer→relay→peer. No inbound port, no tunnel. User picks *which* relay (ours by default, or a self-hosted one).
- **`iroh`** — daemon uses Iroh (QUIC). ~90% of pairs get a direct P2P connection; the rest fall back through a relay. E2E-encrypted regardless. Self-hostable relay. The deliberate pilot.

## User experience

```bash
# Default — nothing changes for existing users
ogp config get transport.mode          # => direct

# Opt into relay (no tunnel needed)
ogp config set transport.mode relay
ogp config set transport.relay.url wss://relay.example.com/relay   # default if omitted

# Power user / privacy: self-hosted relay
ogp config set transport.relay.url wss://relay.mycorp.internal

# Pilot iroh
ogp config set transport.mode iroh
ogp config set transport.iroh.relayUrl https://my-dedicated-relay   # omit = public dev relays
```

A mixed fleet works: each peer advertises *how* to reach it, and senders branch on
the **receiver's** advertised transport (see schema change below).

## Config shape

Add a `transport` block to `OGPConfig` (`src/shared/config.ts`). Absent ⇒ `direct`.

```ts
export type TransportMode = 'direct' | 'relay' | 'iroh';

export interface TransportConfig {
  mode: TransportMode;            // default 'direct'
  relay?: {
    url: string;                  // websocket relay endpoint; default wss://<rendezvous>/relay
  };
  iroh?: {
    relayUrl?: string;            // dedicated/self-hosted iroh relay; omit = public dev relays
  };
}

// OGPConfig:
//   transport?: TransportConfig;
```

## The keystone change — rendezvous advertises *how*, not just *where*

This is the one structural change everything else depends on, and the part that
**must be reviewed carefully before merge** (it sits next to the signed
registration / trust model).

Today the rendezvous `/register` stores `{ pubkey, ip, port, lastSeen }` and
`/peer/:pubkey` returns `{ pubkey, ip, port, lastSeen }`. We extend the registered
record with a **transport descriptor** so a sender knows which path to use:

```jsonc
// direct (default / backward compatible — missing descriptor ⇒ direct)
{ "transport": "direct", "gatewayUrl": "https://peer.example.com" }

// relay
{ "transport": "relay", "relayUrl": "wss://relay.example.com/relay" }

// iroh
{ "transport": "iroh", "nodeId": "<iroh-node-id>", "relayUrl": "https://..." }
```

Rules:
- **Additive & backward compatible.** A registration with no descriptor is treated
  as `direct` with the existing `ip:port` / `gatewayUrl`. Old daemons keep working.
- The descriptor rides **inside the existing signed registration envelope**
  (`signCanonical` over the inner payload) so the rendezvous can't be tricked into
  advertising a transport the keyholder didn't choose. **This is the trust-model
  touchpoint — review carefully before merge.**
- Senders branch delivery on the peer's advertised `transport`, not their own.

## Relay server (mode = `relay`)

Extends the existing rendezvous service (Node/Express on ECS Fargate). No new box.

- New `wss://<rendezvous>/relay` endpoint. Each daemon opens a **persistent
  outbound** WebSocket and authenticates by signing a challenge with its Ed25519
  key (proving pubkey ownership, same property as `/register`).
- Routing table: `pubkey → live socket`. To deliver, sender pushes
  `{ to: pubkeyB, envelope }`; server forwards down B's socket. Optional
  store-and-forward queue for offline peers, flushed on reconnect.
- **ECS/ALB gotcha (confirmed):** ALB idle timeout defaults to 60s, max 4000s. We
  **must** send app-level WS ping/heartbeat (~30–50s) or idle sockets get dropped.
- **Horizontal scale:** one Node process handles tens of thousands of idle
  sockets; past one Fargate task we need a shared routing table (Redis pub/sub) so
  a message arriving on task-1 reaches a socket on task-2.
- Server stays **untrusted** — it sees envelopes but can't forge them (E2E Ed25519).

## Iroh (mode = `iroh`) — pilot notes

- QUIC, node-ID addressing. Relays do (1) NAT-traversal coordination and (2)
  encrypted fallback; **relays cannot read traffic** (E2E). ~9/10 pairs get a
  direct connection; traversal is deterministic once it works for a pair.
- Relays are **stateless/disposable** (no DB, no state migration, reconnect to any).
- **Cost/effort caveats:** Iroh is Rust; OGP is Node. Official **NAPI Node bindings**
  exist (`iroh` npm), so it's a native-addon dependency with per-platform prebuilds,
  not a full rewrite — but it *is* a new native dep for a daemon that ships daily.
  Public relays are **dev/test only** (rate-limited, no SLA); production = dedicated
  relays (self-hosted open-source binary from n0-computer, or n0's paid Iroh
  Services). Addressing changes from URL → node ID, so the delivery path is rewired.
- Treat as **opt-in pilot**, not default. Once the transport descriptor exists,
  iroh is "just another transport value," not a rewrite-or-nothing bet.

Sources: https://docs.iroh.computer/concepts/relays ,
https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html

## Phased build plan

1. **Transport descriptor in register/lookup** (additive, backward compatible;
   missing ⇒ `direct`). Unblocks everything, low risk. **Schema/trust touchpoint —
   review carefully before merge.**
2. **`relay` mode** — WebSocket through rendezvous + signed-challenge auth +
   ALB heartbeat. Lowest code; kills the tunnel requirement; opt-in dogfooding.
3. **`iroh` mode pilot** — once relay is proven, add iroh as another descriptor
   value behind a dedicated/self-hosted relay.

## Hard rules / guardrails

- **Default stays `direct`** — never silently change how existing users' traffic moves.
- **No auto-deploy** of the rendezvous/relay server — changes are proposed and reviewed, not shipped automatically.
- **Registration-schema + relay-auth code requires careful review before merge** — it's adjacent to the Ed25519 trust model, which is the product.
- E2E Ed25519 signing is preserved in **every** mode; the relay is always untrusted.

## Non-goals (for now)

- Replacing direct mode. It stays as the privacy/no-third-party path.
- Picking iroh vs websocket-relay as the *single* answer. The point is choice +
  real-world dogfooding before committing a default beyond `direct`.
