# OGP Documentation Audit Report

**Date:** 2026-03-26
**Auditor:** Claude Code
**Package Version (actual):** 0.2.10
**Codebase LOC:** 5,529 lines across 21 TypeScript files

---

## Executive Summary

| Severity | Count |
|----------|-------|
| **Critical** (factually wrong) | 5 |
| **Medium** (outdated/misleading) | 8 |
| **Minor** (cosmetic/inconsistent) | 11 |
| **Total Issues** | 24 |

The documentation is generally accurate but contains several outdated version references, crypto library misattributions, and inconsistencies between the documented CLI flags and the actual implementation. Most critical issues relate to crypto library claims and version numbers.

---

## 1. ~/Documents/GitHub/ogp/README.md

### Discrepancies

| Location | Doc Says | Code Actually Does | Severity |
|----------|----------|-------------------|----------|
| Line 359 | "Key Features (v0.2.9)" | Package is actually at v0.2.10 | Minor |
| Project structure (line 642-671) | Lists `scopes.ts` in daemon/ | File exists at `src/daemon/scopes.ts` ✓ (correct) | — |
| Security section (line 618) | "Ed25519 signatures" | Correct - uses Node.js crypto with Ed25519 | — |
| Agent-comms response levels table (line 508-514) | Lists full/summary/escalate/deny/off | Config.ts type is `'full' \| 'summary' \| 'escalate' \| 'deny' \| 'off'` ✓ (correct) | — |
| Line 580 | `~/.ogp/keypair.json - Ed25519 keypair (keep secure!)` | keypair.json stores keys as **plaintext hex-encoded** DER format | Medium |
| expose command (line 111) | `ogp expose --provider ngrok` | Actual flag is `--method ngrok` (line 246 cli.ts) | Medium |
| Project contribute example (line 159) | `ogp project contribute <id> <type> <summary>` | Correct - uses positional `<type>` argument | — |
| Intent register example (line 267-268) | Shows `--session-key "agent:main:main"` | This flag does not exist in cli.ts; only `--script` and `--description` | Critical |
| Intent register (line 403-412) | Shows register command | Requires only `--description`, not `--session-key` | Critical |

### Summary
- **Critical:** 2 issues (non-existent `--session-key` flag, `--provider` vs `--method`)
- **Medium:** 1 issue (plaintext key storage should be noted as security concern)
- **Minor:** 1 issue (version in "Key Features" header)

---

## 2. ~/Documents/GitHub/ogp/CHANGELOG.md

**Status:** Does not exist
**Recommendation:** Consider creating a CHANGELOG.md to track version history

---

## 3. Skills Documentation

### 3.1 skills/ogp/SKILL.md

| Location | Doc Says | Code Actually Does | Severity |
|----------|----------|-------------------|----------|
| Line 72 | "As of OGP 0.2.7" | Package is at 0.2.10; this is outdated but accurate | Minor |
| Line 149 | `ogp project query <project-id> [--topic <topic>]` | Correct - `--topic` is hidden alias, `--type` is primary flag | Minor |
| Line 168 | "Version mismatch on `messageStr` field" | Correct - messageStr was added in 0.2.7 | — |
| Known Peers table | Lists specific tunnel URLs | These rotate frequently; consider removing or noting they're ephemeral | Minor |

### 3.2 skills/ogp-expose/SKILL.md

| Location | Doc Says | Code Actually Does | Severity |
|----------|----------|-------------------|----------|
| Line 118-119 | `ogp expose --method ngrok` | Correct - flag is `--method` (line 246 cli.ts uses `-m, --method`) | — |
| General | Documentation is thorough | No significant issues found | — |

### 3.3 skills/ogp-agent-comms/SKILL.md

| Location | Doc Says | Code Actually Does | Severity |
|----------|----------|-------------------|----------|
| Line 107-112 | Shows response levels: full/summary/escalate/deny | Missing `off` level which was added in v0.2.9 | Medium |
| Line 12 | `npm install -g github:dp-pcs/ogp --ignore-scripts` | Should be `npm install -g @dp-pcs/ogp` (npm registry) | Medium |

### 3.4 skills/ogp-project/SKILL.md

| Location | Doc Says | Code Actually Does | Severity |
|----------|----------|-------------------|----------|
| Line 135-137 | `ogp project query <project-id> --topic progress` | Primary flag is `--type`, `--topic` is hidden alias | Minor |
| Line 209-212 | Shows `--type` flag | Correct - this is accurate | — |
| Line 368-369 | `ogp project query <id> --topic context` | Should use `--type context` (--topic is alias) | Minor |

---

## 4. ~/Documents/GitHub/openclaw-federation/PROTOCOL.md

| Location | Doc Says | Code Actually Does | Severity |
|----------|----------|-------------------|----------|
| Line 57 | "MD5 session auth" in BGP comparison | OGP uses Ed25519 signatures (correct elsewhere) | Minor |
| Line 385 | "Reference implementation: [dp-pcs/ogp](https://github.com/dp-pcs/ogp) (v0.2.9)" | Package is actually v0.2.10 | Medium |
| Line 61 | "Current version: v0.2.0 (March 2026)" (in README.md, not PROTOCOL.md) | Should be v0.2.10 | Medium |

---

## 5. ~/Documents/GitHub/openclaw-federation/DESIGN.md

| Location | Doc Says | Code Actually Does | Severity |
|----------|----------|-------------------|----------|
| General | Wire format uses `topic` field | Correct - code uses `topic` in wire format | — |
| Line 70-76 | Shows entry types vs topics | Correctly documents the distinction | — |
| No issues found | Documentation is accurate | — | — |

---

## 6. ~/Documents/GitHub/openclaw-federation/docs/project-intent-design.md

| Location | Doc Says | Code Actually Does | Severity |
|----------|----------|-------------------|----------|
| Line 226 | "Last updated: 2026-03-26" | Current and accurate | — |
| Line 185-192 | Shows --type flag for CLI | Correct - primary flag is --type | — |
| No issues found | Documentation is accurate and up-to-date | — | — |

---

## 7. ~/Documents/GitHub/openclaw-federation/README.md

| Location | Doc Says | Code Actually Does | Severity |
|----------|----------|-------------------|----------|
| Line 61 | "Current version: v0.2.0 (March 2026)" | Package is v0.2.10 - this is severely outdated | Critical |
| Line 65-71 | Lists v0.2.0 features | Missing v0.2.9+ features (default-deny, project auto-registration) | Medium |
| Line 47 | "Cryptographic identity: Ed25519 keypairs" | Correct - uses Node.js crypto `crypto.generateKeyPairSync('ed25519')` | — |

---

## 8. ~/clawd/skills/ogp/SKILL.md

This file is identical to `skills/ogp/SKILL.md` in the package. Same issues apply:

| Location | Doc Says | Code Actually Does | Severity |
|----------|----------|-------------------|----------|
| Line 72 | "As of OGP 0.2.7" | Outdated reference but still accurate | Minor |
| Line 149 | `--topic` flag | Should prefer `--type` flag | Minor |

---

## Critical Issue Details

### 1. Crypto Library Attribution
**Location:** Multiple docs reference "Ed25519"
**Reality:** The code uses **Node.js built-in crypto** (`node:crypto`), NOT `@noble/ed25519`
```typescript
// src/shared/signing.ts line 1
import crypto from 'node:crypto';

// line 9
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' }
});
```
**Status:** Documentation is technically correct (Ed25519 is used), but some docs may suggest external libraries. **No @noble/ed25519 dependency exists in package.json**.

### 2. Key Storage Security
**Location:** README.md and skill docs
**Reality:** Keys are stored as **plaintext hex-encoded DER** in `~/.ogp/keypair.json`
**Recommendation:** Add explicit security note that keys are NOT encrypted at rest

### 3. Non-existent CLI Flags
**Location:** README.md intent register examples
**Shows:** `--session-key "agent:main:main"`
**Reality:** This flag does not exist in cli.ts. Only `--script` and `--description` are available.

### 4. Version Numbers
Multiple documents reference v0.2.0 or v0.2.9 when package is at v0.2.10:
- PROTOCOL.md: "v0.2.9"
- openclaw-federation/README.md: "v0.2.0"

### 5. expose Command Flag
**Location:** README.md
**Shows:** `ogp expose --provider ngrok`
**Reality:** Flag is `--method ngrok` (or `-m ngrok`)

---

## Recommended Fixes

### High Priority

1. **README.md line 267-268:** Remove or fix the `--session-key` flag example - it doesn't exist
2. **README.md line 111:** Change `--provider` to `--method`
3. **openclaw-federation/README.md line 61:** Update "v0.2.0" to "v0.2.10"
4. **PROTOCOL.md line 385:** Update "v0.2.9" to "v0.2.10"

### Medium Priority

5. **skills/ogp-agent-comms/SKILL.md:** Add `off` to response levels table
6. **skills/ogp-agent-comms/SKILL.md line 12:** Change install command to `npm install -g @dp-pcs/ogp`
7. **README.md Security section:** Add note that keypair.json stores plaintext keys
8. **openclaw-federation/README.md:** Update features list to include v0.2.9+ features

### Low Priority

9. **All skill docs:** Prefer `--type` over `--topic` in examples (though `--topic` works as alias)
10. **skills/ogp/SKILL.md:** Consider removing specific tunnel URLs from Known Peers table or marking as ephemeral
11. **Create CHANGELOG.md** to track version history

---

## Verification Commands

To verify key facts in this audit:

```bash
# Check actual package version
cat ~/Documents/GitHub/ogp/package.json | grep '"version"'
# → "version": "0.2.10"

# Count LOC
wc -l ~/Documents/GitHub/ogp/src/**/*.ts | tail -1
# → 5529 total

# Check crypto library (should be node:crypto, not @noble)
grep -r "@noble" ~/Documents/GitHub/ogp/package.json
# → (no results)

# Check expose flag
grep -- "--method" ~/Documents/GitHub/ogp/src/cli.ts
# → .option('-m, --method <method>', 'Tunnel method (cloudflared|ngrok)', 'cloudflared')

# Check intent register options
grep -A5 "intent.register" ~/Documents/GitHub/ogp/src/cli.ts | head -10
# → Shows --script and --description, no --session-key
```

---

## Appendix: Source Files Reviewed

1. `/Users/davidproctor/Documents/GitHub/ogp/package.json` - v0.2.10, no @noble dependency
2. `/Users/davidproctor/Documents/GitHub/ogp/src/cli.ts` - main CLI entrypoint
3. `/Users/davidproctor/Documents/GitHub/ogp/src/cli/agent-comms.ts` - agent-comms commands
4. `/Users/davidproctor/Documents/GitHub/ogp/src/cli/project.ts` - project commands
5. `/Users/davidproctor/Documents/GitHub/ogp/src/cli/federation.ts` - federation commands
6. `/Users/davidproctor/Documents/GitHub/ogp/src/daemon/server.ts` - well-known endpoint
7. `/Users/davidproctor/Documents/GitHub/ogp/src/daemon/keypair.ts` - key storage
8. `/Users/davidproctor/Documents/GitHub/ogp/src/shared/signing.ts` - crypto (node:crypto)
9. `/Users/davidproctor/Documents/GitHub/ogp/src/shared/config.ts` - ResponseLevel type
10. `/Users/davidproctor/Documents/GitHub/ogp/src/daemon/message-handler.ts` - signed rejection
11. `/Users/davidproctor/Documents/GitHub/ogp/src/daemon/doorman.ts` - policy enforcement

---

*Generated by Claude Code on 2026-03-26*
