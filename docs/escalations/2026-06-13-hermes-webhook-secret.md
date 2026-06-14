# Escalation: Per-install Hermes webhook secret (bd-l7x5)

**Status:** Fix implemented on branch `fix/bd-l7x5-per-install-hermes-secret` (commit `544c3f3`).
NOT pushed, NOT merged. Auth-adjacent → ESCALATE-BEFORE-MERGE → awaiting David go/no-go.

**Agent:** agent.ogp-a-dp-agent · **Date:** 2026-06-13

## Problem
`src/cli/setup.ts` shipped a shared hardcoded default:

```ts
const DEFAULT_HERMES_WEBHOOK_SECRET = 'ogp-test-secret-hermes-2026';
```

Applied at the Hermes branch of `setupFramework()` whenever the user answered YES
(the default) to *"Use default Hermes webhook settings?"*. Result: **every Hermes
user who accepts defaults ships the SAME webhook auth secret** into their live config
(and it was compiled into `dist/cli/setup.js`, shipping on npm `@dp-pcs/ogp`).

A webhook secret exists to authenticate the sender. A shared global default defeats
that and is a trust-model regression for a project whose value prop *is* the trust
model.

Note: not a real credential leak — it's a placeholder string, so no rotation is
needed. The issue is the design: shipped default == shared secret.

## Fix
- Removed the constant.
- Added `generateHermesWebhookSecret()` → `crypto.randomBytes(32).toString('hex')`.
- On "use defaults", generate a unique per-install secret AND print it so the user
  copies it into their Hermes-side federation webhook config (both sides must match;
  the receiver reads its own configured value).
- `DEFAULT_HERMES_WEBHOOK_URL` (localhost) unchanged.

## Verification
- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `npx vitest run test/setup-non-interactive.test.ts test/setup-agent-comms-interview.test.ts` — 9/9 pass.
- `grep -rn 'DEFAULT_HERMES_WEBHOOK_SECRET\|ogp-test-secret-hermes-2026' src/` — no remaining refs.

## Why this needs David
Auth-adjacent change (webhook authentication). Per AUTONOMY.md hard rules, crypto/auth
paths are escalate-before-merge. Also a behavior change for existing Hermes users who
relied on the matching shared defaults: after this, a fresh setup generates a unique
secret they must mirror into Hermes. That UX/migration tradeoff is David's call.

## To ship (after go)
```
cd ~/Documents/GitHub/ogp-agent
git checkout agent/heartbeat   # or main per release flow
git merge --no-ff fix/bd-l7x5-per-install-hermes-secret
# then normal npm release flow
```
Rollback: `git revert 544c3f3`.
