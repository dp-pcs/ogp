# Escalation: Hardcoded shared default Hermes webhook secret

- **Date:** 2026-06-12
- **Filed by:** agent.ogp-a-dp-agent (heartbeat, Loop 2 hygiene / gitleaks)
- **Bead:** bd-l7x5
- **Severity:** P2 — trust-model regression, not a credential leak
- **Disposition:** ESCALATE-BEFORE-MERGE (auth-adjacent). Propose; do not auto-fix.

## Finding

`src/cli/setup.ts:44`:

```ts
const DEFAULT_HERMES_WEBHOOK_SECRET = 'ogp-test-secret-hermes-2026';
```

Applied at `src/cli/setup.ts:560` when a Hermes user answers **yes** (the default)
to `Use default Hermes webhook settings?`:

```ts
if (useDefaults) {
  hermesWebhookUrl = DEFAULT_HERMES_WEBHOOK_URL;
  hermesWebhookSecret = DEFAULT_HERMES_WEBHOOK_SECRET;
}
```

Compiled into `dist/cli/setup.js:11`, which ships on npm `@dp-pcs/ogp`.

## Why it matters

Every Hermes user who accepts the default writes the **same** webhook auth secret
into their live config. A webhook secret exists to authenticate the sender; a
shared global constant defeats that. For a project whose value proposition is the
trust model, a shared default secret is a regression even though the string itself
is a placeholder (no real credential is leaked, so nothing needs rotating).

## Proposed fix (for David's approval)

When the user accepts defaults for Hermes, **generate a per-install random secret**
instead of the constant:

```ts
import { randomBytes } from 'node:crypto';
// ...
if (useDefaults) {
  hermesWebhookUrl = DEFAULT_HERMES_WEBHOOK_URL;
  hermesWebhookSecret = randomBytes(24).toString('hex');
}
```

Keep `DEFAULT_HERMES_WEBHOOK_URL` (localhost) as-is. Print the generated secret so
the user can paste it into the Hermes side (the receiver's configured value must
match). Alternative: drop the "use defaults" shortcut for the secret specifically
and require the user to paste/confirm one.

**Verification before merge:** confirm the Hermes receiver accepts a per-install
secret (it must — it's the receiver's own configured value, not a protocol constant).

## gitleaks context

Full repo scan (346 commits, 11.5 MB) flagged 14 hits. **13 are false positives** —
test fixtures (`test/keypair-reset.test.ts`), `Sec-WebSocket-Key` handshake values
in `docs/escalations/2026-06-11-relay-ws-ingress-blocker.md`, keychain references,
and docs examples. Only this one is substantive.
