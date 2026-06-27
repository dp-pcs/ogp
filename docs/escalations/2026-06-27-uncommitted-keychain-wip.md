# Escalation: uncommitted keychain/CLI WIP found in agent/heartbeat worktree

- **Date:** 2026-06-27
- **Agent:** agent.ogp-a-dp-agent
- **Worktree:** ~/Documents/GitHub/ogp-agent (branch `agent/heartbeat`)
- **Class:** ESCALATE-BEFORE-MERGE (touches `src/daemon/keypair.ts` — keychain/crypto path)
- **Status:** NOT committed, NOT merged. Verified green; awaiting David's call.

## What was found

The heartbeat opened on a dirty worktree. Four files modified, no stash, no
commit capturing them — genuine WIP left from a prior session:

```
 src/cli/config.ts          |  4 ++--
 src/daemon/keypair.ts      | 17 +++++++++++------
 src/shared/help.ts         | 10 ++++++++--
 test/keypair-reset.test.ts | 42 ++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 63 insertions(+), 10 deletions(-)
```

Full diff saved to `/tmp/ogp-keychain-wip.patch` (132 lines) and reproducible
via `git diff` in the worktree.

## The change set (coherent, single intent)

1. **`src/daemon/keypair.ts`** (crypto/keychain): legacy-keychain migration
   (`ogp-federation` → instance-specific `ogp-federation-<hash>`) was logging a
   migrate banner + warning on *every* `keychainLoad()`. Adds a per-process
   `Set` guard (`legacyKeychainMigrationAttemptedFor`) so the migrate attempt +
   warning fire **once per process per service**, not on every load. Pure
   log-noise / redundant-write fix — does NOT change which key is returned
   (`return oldResult` is unchanged and outside the guard).

2. **`src/cli/config.ts`**: `ogp config show` printed a hardcoded
   `~/.ogp-meta/config.json`. Now prints the real `getMetaConfigPath()` (already
   exported from meta-config.ts). Cosmetic correctness fix.

3. **`src/shared/help.ts`**: top-level help refreshed — adds `app`, `tunnel`,
   `keychain`, `completion` commands; moves `expose`/`expose-stop` to a
   "Deprecated aliases" section pointing at `ogp tunnel start|stop`. Docs only.

4. **`test/keypair-reset.test.ts`**: +1 test — "warns only once per process when
   old macOS keychain migration cannot write the new service entry." Covers the
   keypair.ts guard above.

## Verification (positive evidence)

- `npx tsc --noEmit` → exit 0 (clean).
- `npx vitest run test/keypair-reset.test.ts` → 6 passed / 6 (incl. the new test).

## Why escalating instead of committing

Per AUTONOMY.md HARD RULE: crypto code is escalate-before-merge. `keypair.ts` is
the keychain path, so even a log-only change gets David's sign-off before it
lands. The other three files (config.ts / help.ts / test) are benign but ship as
one logical unit.

## Recommendation

Low-risk, well-tested, all-green. Suggest: David reviews keypair.ts hunk,
then I commit as a single `fix(keychain): migrate/ warn once per process` +
the help/config cleanup. Hold until approved.

## Decision needed from David

- [ ] Approve commit of all 4 files as-is, OR
- [ ] Split keychain change out for closer review, OR
- [ ] Discard (if this was an abandoned experiment).
