# Escalation: stranded uncommitted companion fix (tunnel stop / no-managed-tunnel)

**Date:** 2026-06-13
**Reporter:** agent.ogp-a-dp-agent (heartbeat)
**Related beads:** bd-1mtg (companion src stale vs installed binary), bd-yzj1 (the fix), bd-80gh (tunnel durability)
**Surface:** ogp-companion (Tauri desktop app) — propose-don't-deploy

## What I found

The `agent/heartbeat` worktree (`~/Documents/GitHub/ogp-agent`) had **uncommitted changes**
to two companion files when this heartbeat session woke:

- `ogp-companion/src-tauri/src/ogp.rs` (+44/-2)
- `ogp-companion/src/app.jsx` (+16/-2)

These were NOT authored in this session. They are coherent, well-commented, and map exactly to
**bd-yzj1 / bd-1mtg**: making `stop_tunnel` handle the *external/unmanaged tunnel* case instead of
treating it as a hard error.

### Backend (ogp.rs `stop_tunnel`)
Switches from blind `tunnel stop` (always-ok) to `tunnel stop --json`, inspects exit code + parsed
`{stopped,status}`:
- exit 0 → `{ ok:true, stopped }`
- exit 2 AND `status=="no-managed-tunnel"` → `{ ok:true, stopped:false, status:"no-managed-tunnel" }`
- any other non-zero → real error (surfaces stderr)

### Frontend (app.jsx `stopTunnel`)
Reads the new `{stopped:false,status:"no-managed-tunnel"}` shape and, instead of falsely claiming
"Tunnel stopped", shows a warn toast ("External tunnel — not managed by OGP…") + activity log entry.
Also moves `hydrate()` into `.finally()` so state re-syncs regardless.

## Verification done
- Installed `/opt/homebrew/bin/ogp tunnel stop --json` **does** support the `{stopped,status,message}`
  contract the Rust code expects (confirmed via `--help`). So the code is consistent with the shipped binary.
- bd-1mtg's note that the worktree `src/cli/tunnel.ts` lags the installed binary is the same drift this
  Rust handler papers over at the companion layer.

## Why I did NOT commit/push
Companion code touches the federation-adjacent daemon surface → propose-don't-deploy. I don't
autonomously commit code I didn't author this session. Diff preserved at:
`docs/escalations/bd-yzj1-stranded-tunnel-stop-fix.patch`

## Recommended action for David
1. Review the patch (above). If good: commit on `agent/heartbeat` (or cherry-pick onto a companion
   branch) with message referencing bd-yzj1 + bd-1mtg.
2. Decide whether `src/cli/tunnel.ts` should be reconciled to match the shipped binary (bd-1mtg core ask).
3. This branch is also **behind main** (main has 0.11.0 + companion auto-update work; local root
   package.json still says 0.9.1) — a rebase/sync may be wanted before landing.
