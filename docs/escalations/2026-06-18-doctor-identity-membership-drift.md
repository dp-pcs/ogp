# Escalation: daemon signing key not in any local project's member list (identity drift)

- **Date:** 2026-06-18
- **Raised by:** agent.ogp-a-dp-agent (heartbeat)
- **Bead:** bd-o14d (implemented Part B), related bd-1evg
- **Branch:** `feat/ogp-doctor-bd-o14d` (commit `94b53ae`) — NOT merged to `agent/heartbeat`
- **Severity:** federation-health (Loop 1). Not an outage; David's daemon HTTP server is up.
- **Crypto-adjacent:** the fix touches identity/membership — **escalate-before-merge**, do not auto-apply.

## What I built (read-only, safe)

`ogp doctor` — the read-only Part B of bd-o14d. Implemented strictly read-only:
- `derivePublicKeyFromPrivate()` (src/shared/signing.ts) — pure crypto; reproduces the
  stored SPKI/DER-hex public key from the PKCS8/DER-hex private key.
- `getIdentityDiagnostics()` (src/daemon/keypair.ts) — reads the keypair.json cache
  **directly** (not via the auto-healing `loadOrGenerateKeyPair`) so drift is visible;
  mutates nothing.
- `ogp doctor` CLI (src/cli/doctor.ts) — identity chain, project-membership cross-check,
  stale-keychain audit. Human + `--json`. Non-zero exit on hard errors.

Part A (auto-heal of the keypair.json public cache) was deliberately **left out** — it
mutates stored key material and is escalate-before-merge.

`npx tsc --noEmit` clean, `npm run build` clean.

## What the live run found (David's instance, `~/.ogp-openclaw`)

Identity chain is internally consistent:
- private key present (source: macOS **keychain**, service `ogp-federation-05fdf2ff`)
- derived public key == keypair.json cache: **MATCH** (`…93297a1a…037b7ac`).
  Confirms the "private key is source of truth" property end-to-end on the live box.

Two real problems surfaced:

### 1. Membership drift — current key is in NO project's member list
The daemon's **current** signing key is `302a…93297a1a…` (derived + cached, consistent).
But every local project's member list references an **older** key `302a…738064be…`:

| project | members (observed) |
|---|---|
| signal | `302a…738064be`, `david@theproctors.cloud`, `302a…27ce9d6d` |
| aicoe-expert-network | `302a…738064be`, `david@theproctors.cloud` |
| greek-gods, lantern, mil-*apollo* (x2) | (also no `…93297a1a` membership) |

So the **current daemon would be rejected as a non-member** of all 6 local projects on the
signed federation path. `…738064be` is the **same orphaned key bd-1evg saw** rendered as
`authorName='302a300506032b6570032100738064be'` on the public site. Strong signal the box
was **re-keyed** at some point (there are 19 `ogp-federation-*` keychain services total),
and project membership was never reconciled to the new identity.

### 2. Stale keychain services
**19** `ogp-federation-*` generic-password services exist in the login keychain (current:
`05fdf2ff`; **18 others**). The bead predicted ~10; reality is worse. Harmless to runtime
but pollutes manual keychain inspection and is the residue of repeated re-keying.

## Why this matters / open questions for David

- Is `…93297a1a` the **intended** current identity, or did a re-key happen unintentionally
  and the *old* `…738064be` is the one that should be advertised/restored? (Determines
  whether we reconcile membership forward to `93297a1a` or restore the old key.)
- Membership reconciliation is a **federated mutation** — out of scope for `ogp doctor`
  and for autonomous action. Needs your call: re-join projects under the current key, or
  realign the daemon identity to the historical member key.
- Stale-keychain cleanup (`security delete-generic-password` for the 18 non-current
  services) is destructive and identity-adjacent — propose, don't auto-run.

## Asks
1. Decide the intended current identity (`93297a1a` vs `738064be`).
2. Approve/redirect membership reconciliation approach.
3. Approve the read-only `ogp doctor` PR (`feat/ogp-doctor-bd-o14d`) for merge, and say
   whether you want me to follow up with Part A (cache auto-heal) and a `--heal`/cleanup
   path as a separate escalate-before-merge change.
