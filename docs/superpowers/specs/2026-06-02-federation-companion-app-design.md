# OGP Federation Companion App — Design (v1)

**Date:** 2026-06-02
**Bead:** bd-cn9
**Status:** Approved (brainstorming complete)

## Summary

Pivot the existing `macos-menubar-app` (SwiftUI `OGPMonitor`) into a federation
companion app with two flows:

1. **Add a gateway** — a guided wizard to establish a new federation with a peer.
2. **Check status** — a glanceable view of existing federations and tunnel health.

The app keeps its menu-bar presence for status and adds a dedicated window for the
wizard.

## Decisions (from brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Form factor** | Popover + Window (option A) | Status is glanceable → menu-bar popover. The add-gateway wizard needs room → dedicated resizable window. |
| **Drive mechanism** | Hybrid: read files for status, shell out to `ogp` for actions | Proven pattern (the app already does this). The CLI is the stable, supported contract carrying validation/identity/keychain/rendezvous logic; the daemon's internal HTTP API is not stable. Files for reads (instant, side-effect-free); CLI for writes. |
| **Agent allow-list** | Surface existing scopes/grants in v1; show personas read-only; per-agent primitive deferred to v2 | No per-agent outbound allow-list exists today (see bd memory `ogp-multiagent-authz`). Per-peer scopes/grants are real, enforced authorization. The wizard's authorization step is built behind a clean interface so the v2 primitive swaps in without touching wizard flow. |
| **v1 scope** | Standard v1 | Covers real daily usage without gating on the largest unknowns. |
| **Synapse** | Out of the app | Synapse is org-memory, not federation; surfacing it blurs the app's purpose. The *build* is still tracked as Synapse project work. |

## Scope

### In v1
- Outbound add-gateway wizard via **direct request-by-URL** (`ogp federation request <peer-url>`).
- Reachability ping during the wizard (`ogp federation ping <peer-url>`).
- Per-peer scope grants in the wizard's authorization step (`ogp federation request --grant` / `approve --grant` / `scopes/grant`), with the peer's advertised multi-agent personas shown **read-only**.
- Status popover: daemon status, tunnel health reconcile (`ogp tunnel list` → ✓/✗/⚠), federation list with per-peer ping + granted scopes.
- **Inbound** approve/reject of pending federation requests with scope grants (`ogp federation approve <peer-id> --grant` / `reject <peer-id>`).
- **Multi-framework switcher** (Hermes / OpenClaw) — `ogp --for <framework> …` and per-framework state directories.

### Out of v1 (deferred to v2, tracked as separate beads)
- Per-agent outbound allow-list (new daemon authorization primitive).
- Invite/accept rendezvous short-code flow (`ogp federation invite` / `accept <token>`).
- Starting a tunnel from inside the wizard (`ogp tunnel start`) — v1 assumes the tunnel is already up and only displays/reconciles its health.

## Architecture

The current `OGPService` is a single `ObservableObject` that mixes file reads,
process checks, and command execution. We refactor it into focused units with
clear interfaces. Each unit has one purpose and can be reasoned about in isolation.

### Components

- **`OGPService`** (state coordinator, `ObservableObject`)
  - Owns published state (`status`, `federations`, `selectedFramework`, wizard state).
  - Polls on a timer (~5s), delegates reads to `StateReader`, mutations to `OGPClient`.

- **`StateReader`** (read side, file-based)
  - Reads `~/.ogp/<framework>/{config,peers}.json` (or the framework's resolved state dir).
  - Returns typed `OGPStatus` / `[Peer]`. No subprocesses. No side effects.
  - Resolves the state directory per selected framework.

- **`OGPClient`** (write side, shells out to `ogp`)
  - Wraps `ogp [--for <framework>] <verb> … --json`, parses structured JSON.
  - Verbs used: `federation request`, `federation approve`, `federation reject`,
    `federation ping`, `federation list`, `federation status`, `tunnel list`.
  - Locates the `ogp` binary via the existing common-paths search (GUI apps don't
    inherit shell PATH).
  - Surfaces structured results + errors to the wizard for live progress display.

- **`TunnelManager`** (existing, retained)
  - Tunnel detection/health reconcile. Kept as-is for status; the wizard does NOT
    start tunnels in v1.

- **`FrameworkContext`**
  - Holds the selected framework (Hermes/OpenClaw), resolves its state dir, threads
    `--for <framework>` into every `OGPClient` call.

### Views

- **`StatusPopover`** — the menu-bar dropdown. Framework switcher, daemon/tunnel rows,
  federation list (ping + scopes), inline Approve/Reject for pending inbound, and the
  "＋ Add Gateway" entry that opens the window.
- **`AddGatewayWindow`** — hosts the 4-step wizard in a `Window` scene.
  - **Step 1 · Destination** — peer URL input + reachability ping.
  - **Step 2 · Name** — alias for the peer (local).
  - **Step 3 · Authorization** — `AuthorizationStep` component (isolated): per-peer scope
    checkboxes + read-only personas card.
  - **Step 4 · Connect** — runs `ogp federation request …`, streams live status,
    shows the approval/well-known result card.
- **`AuthorizationStep`** — isolated component. Input: peer's advertised personas +
  available scopes. Output: an `AuthorizationPolicy` (selected scopes → CLI args).
  The v2 per-agent primitive replaces this component's internals only.

### Data flow

```
Timer (5s) ──▶ OGPService ──▶ StateReader ──reads──▶ ~/.ogp/<fw>/*.json
                   │
                   └──▶ @Published status/federations ──▶ StatusPopover

Wizard action ──▶ OGPService ──▶ OGPClient ──spawns──▶ `ogp --for <fw> … --json`
                   │                              └──parses JSON──┐
                   └──◀── live progress / result ◀───────────────┘
```

## CLI prerequisite: `--json` output

The wizard needs structured output, not scraped human-formatted text. No `--json`
flag exists today on these verbs (verified). v1 adds `--json` to:
`ogp federation list`, `federation status`, `federation request`, `federation approve`,
`federation ping`, and `ogp tunnel list`.

This is a self-contained, broadly useful CLI improvement and a prerequisite for the
app's write side. It is implemented in the OGP TypeScript CLI (`src/cli/federation.ts`,
`src/cli/tunnel.ts`) with compiled `dist/` outputs, following the existing command
patterns.

## Error handling

- **OGP not configured** (no `~/.ogp/<fw>/config.json`): popover shows a setup hint
  ("Run `ogp setup`"), wizard entry disabled for that framework.
- **`ogp` binary not found**: actionable error in the popover (the existing
  common-paths search already handles location; surface failure instead of silent no-op).
- **Wizard command failure** (request rejected, peer unreachable, bad URL): the
  Connect step shows the parsed error from `--json` stderr/exit, lets the user go back
  and retry without losing entered values.
- **Framework daemon down**: status row shows stopped; wizard warns the local daemon
  must be running before sending a request.
- **Tunnel down but daemon up**: ⚠ partial state (existing yellow semantics), tunnel
  health row shows ✗ from `tunnel list` reconcile.

## Testing

- **Pure parsing units** (Swift): JSON decoders for `federation list/status/ping` and
  `tunnel list` outputs — table-driven against captured `--json` fixtures.
- **State directory resolution**: per-framework path resolution given a selected framework.
- **`AuthorizationPolicy` mapping**: selected scopes → correct `ogp … --grant` args.
- **CLI `--json` (TypeScript)**: TDD the new flags in the OGP repo's existing test
  suite — assert shape and that human output is unchanged when the flag is absent.
- **Manual smoke**: real add-gateway against a live peer (Cosmo/Junior), inbound
  approve, framework switch — on the dev machine, matching the tunnel-command validation
  approach.

## Open items for the plan

- Whether `--for <framework>` state-dir resolution is already exposed by a CLI verb the
  app can call (e.g. `ogp whoami --json`) vs. the app resolving paths itself. The plan
  should check `whoami`/`config` output first and prefer asking the CLI over hardcoding
  `~/.ogp/<fw>/` path conventions.

## v2 backlog (file as beads)
- Per-agent outbound allow-list daemon primitive + wizard UI.
- Invite/accept rendezvous short-code flow in the wizard.
- Start-tunnel-from-wizard when the gateway isn't publicly reachable.
