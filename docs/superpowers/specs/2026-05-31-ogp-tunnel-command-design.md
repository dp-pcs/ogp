# `ogp tunnel` — design spec

**Date:** 2026-05-31
**Status:** Approved design, pending implementation plan

## Problem

OGP federation depends on the local daemon being reachable at a public URL. The
most common way operators achieve that is a **cloudflared** or **ngrok** tunnel.

Today the only tunnel tooling is `ogp expose` / `ogp expose-stop`, which:

- Only *starts* tunnels; there is no way to *see* what is running.
- Only tracks tunnels that `ogp` itself spawned (via `~/.ogp/tunnel.pid`). A
  tunnel started by hand, by a LaunchAgent, or by `cloudflared` directly is
  invisible to `ogp`.
- Gives no help reconciling a running tunnel's public URL against the
  `gatewayUrl` in config, which is the actual failure mode in federation setup.

Operators (and agents helping them) need a single command to answer "is a tunnel
up, what URL does it serve, and does that match my gateway config?" — without
memorizing the differing native CLIs of two tools.

## Goals

- Add `ogp tunnel list [cloudflared|ngrok]` that surfaces tunnels by delegating
  to each tool's **native** capability and rendering an organized, unified view.
- Add `ogp tunnel start <cloudflared|ngrok>` (idempotent) and `ogp tunnel stop`.
- Make `ogp tunnel` the canonical namespace; keep `expose` / `expose-stop`
  working as hidden, deprecated aliases.
- Annotate each resolvable public URL against config `gatewayUrl`.

## Non-goals (YAGNI)

- Creating/configuring named Cloudflare tunnels (already covered by the
  `ogp-expose` skill and `docs/cloudflare-named-tunnel-setup.md`).
- Auto-rewriting `gatewayUrl` — `list` *flags* mismatches; it never edits config.
- Windows process detection — degrade with a clear "unsupported on this platform"
  note rather than crashing. macOS/Linux are first-class (matches the repo's
  macOS-first posture: LaunchAgent install, Homebrew install docs).
- A general passthrough to arbitrary native subcommands (e.g. mirroring every
  `cloudflared tunnel *` verb). Scope is `list` / `start` / `stop`.

## Design philosophy

`ogp tunnel` is a **thin aggregator over the native CLIs**, not a reimplementation
of process scraping. Each tool already knows its own truth; we shell out to it,
parse structured output, and present it cleanly. This is less code and more
robust than scanning `ps` and guessing.

## Command surface

```
ogp tunnel list [cloudflared|ngrok]    # no arg → both panes; `show` is an alias
ogp tunnel start <cloudflared|ngrok> [-b/--background]
ogp tunnel stop
```

All inherit `--for <framework>` automatically: the existing top-level `preAction`
hook sets `OGP_HOME` before the command runs, and `getConfigDir()` reads it. No
per-command framework handling is needed.

Implemented with the `new Command('tunnel')` + subcommand pattern, registered via
`program.addCommand(tunnelCommand)` — mirroring the existing `configCommand` in
`src/cli/config.ts`.

### `expose` / `expose-stop` deprecation

`expose` and `expose-stop` remain registered but **hidden** (Commander
`{ hidden: true }`). They call straight through to the new tunnel functions and
print a single-line pointer, e.g.:

```
[deprecated] 'ogp expose' is now 'ogp tunnel start'. Forwarding…
```

No behavior changes for anyone scripting against the old names. `shutdown`
continues to call the same stop logic.

## `ogp tunnel list` — data sources & rendering

### cloudflared pane

Source: `cloudflared tunnel list --output json`.

The JSON is an array of named tunnels:

```json
[
  {
    "id": "1aa71419-...",
    "name": "sarcastek-backend",
    "created_at": "2025-12-17T20:53:16Z",
    "deleted_at": "0001-01-01T00:00:00Z",
    "connections": [
      { "colo_name": "den01", "origin_ip": "...", "opened_at": "2026-05-30T..." }
    ]
  }
]
```

Render per tunnel: **name**, short id, created date, and a **live/idle**
indicator derived from `connections` (non-empty active connections → live), with
the set of datacenter `colo_name`s for live tunnels. This faithfully mirrors
`cloudflared tunnel list`, just organized.

This pane represents **named tunnels registered to the Cloudflare account** — an
inventory view with liveness, *not* ephemeral `trycloudflare.com` quick tunnels
(which cloudflared does not register or list).

Error degradation:

- binary not found → "cloudflared not installed — `brew install cloudflared`".
- not logged in / no origin cert → surface the native error and suggest
  `cloudflared tunnel login`.
- non-zero exit / unparseable JSON → show the raw stderr, don't crash the other
  pane.

### ngrok pane

ngrok has no zero-cred symmetric `tunnel list`. Strategy (decision: "local agent,
then account"):

1. **Always** query the local agent API `http://127.0.0.1:4040/api/tunnels`
   (also probe 4041/4042 for multiple agents). Zero creds. Returns currently
   running tunnels on **this machine**, including `public_url` and
   `config.addr` (local target). Render: public URL, local target, proto.
   - If unreachable → "no local ngrok agent running" (not an error).
2. **If** an ngrok API key is configured (env or ngrok config), **also** run
   `ngrok api tunnels list` and render an "account-wide online tunnels" section.
   - If no key → silently omit this section (no nagging).

This pane is labeled to make the axis explicit: the agent section is "running on
this machine"; the account section (when shown) is "online across your ngrok
account".

Error degradation: binary not found → "ngrok not installed — `brew install ngrok`".

### Unified `ogp tunnel list` (no arg)

Run both panes. Print under clear section headers, each labeled with what it
represents. The two tools are NOT forced onto one axis — cloudflared = account
named-tunnel inventory; ngrok = locally-running (+ optional account). Honest
labeling over false symmetry.

### `gatewayUrl` reconcile annotation (default on)

After rendering, compare resolvable public hostnames against config `gatewayUrl`:

- ngrok agent `public_url` → direct host comparison.
- cloudflared named tunnel → resolve hostname via `~/.cloudflared/config.yml`
  ingress mapping (best effort; skip silently if absent).

Emit one verdict line:

- ✓ `gatewayUrl <host>` is served by a live tunnel.
- ✗ a tunnel is live but serves a different host than `gatewayUrl`.
- ⚠ `gatewayUrl` is set but no live tunnel serves it (stale / down).

This is best-effort: where no public URL is resolvable, the annotation is omitted
silently. It never edits config.

## `ogp tunnel start` / `stop`

- `start <tool> [-b]`: **idempotent**. First run detection for that tool; if a
  tunnel is already up (cloudflared process serving the daemon port, or live
  ngrok agent), print the `list` output for it and exit 0 instead of spawning a
  duplicate. Otherwise reuse the existing quick-tunnel spawn logic
  (`cloudflared tunnel --url http://localhost:<port>` / `ngrok http <port>`),
  including the `-b/--background` PID-file + log-file behavior.
- `stop`: kills the ogp-managed tunnel via `~/.ogp/tunnel.pid` (current
  `stopExpose` behavior). Note in output that it only stops ogp-managed tunnels,
  not externally-started ones.

## Code structure

New `src/cli/tunnel.ts` with small, independently testable units:

- `TunnelInfo` type — `{ tool, name?, id?, pid?, targetPort?, publicUrl?,
  live, source, raw? }`.
- `listCloudflaredTunnels(): Promise<...>` — runs the native command, parses
  JSON. Accepts an injectable command-runner so tests feed canned JSON / errors.
- `listNgrokTunnels(): Promise<...>` — queries `:4040` (+ account API when keyed).
  Accepts injectable fetch/runner for tests.
- `reconcileGatewayUrl(infos, config)` — pure function returning the verdict.
- `renderTunnels(...)` — formatting only (pure; takes resolved data).
- `tunnelList(tool?)`, `tunnelStart(tool, { background })`, `tunnelStop()` —
  orchestration + the spawn helpers moved here from `expose.ts`.

`src/cli/expose.ts` shrinks to thin deprecated shims (`expose`, `stopExpose`)
that forward to `tunnel.ts`, so existing `cli.ts` imports still compile during
the transition. `shutdown` keeps calling the stop path.

## Testing (vitest)

Unit tests with injected inputs — no live tunnels required:

- cloudflared parse: real JSON sample → live vs idle classification; deleted
  tunnels filtered; multiple connections → datacenter set.
- cloudflared errors: not-installed, not-logged-in, garbage output → graceful
  messages, no throw.
- ngrok agent: canned `:4040` JSON → public_url + target rendered; agent
  unreachable → "no local agent" (not an error).
- ngrok account: key present → account section rendered; key absent → omitted.
- reconcile: all three verdicts (✓ / ✗ / ⚠) plus the "no resolvable URL → omit"
  path.
- start idempotency: detection returns a live tunnel → no spawn, prints status.

## Risks / open questions

- cloudflared named-tunnel → hostname reconcile depends on a local
  `~/.cloudflared/config.yml` ingress block; remote-only configs won't resolve a
  hostname. Acceptable: reconcile is best-effort and silent when absent.
- ngrok account API output shape (`ngrok api tunnels list`) should be confirmed
  against the installed ngrok version during implementation; parsing is isolated
  so a shape change is contained.
