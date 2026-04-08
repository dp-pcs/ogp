# OpenClaw & Hermes — Status Report
**Date:** April 7, 2026

> **Note:** This document is a sanitized version of internal status reporting. System-specific paths, PIDs, and operational details have been generalized. Created during OGP development to compare gateway stability.

---

## Executive Summary

Both local AI gateways (OpenClaw, Hermes) were evaluated. OpenClaw crashed multiple times in 24 hours from two distinct bugs. Hermes has been stable. A fact-check of an agent-drafted comparison article revealed it was substantially wrong. Config changes were made to switch OpenClaw's primary model to GPT-5.4 and adjust provider configurations.

---

## OpenClaw Gateway — Crash Analysis

### Crash #1: OOM (April 6, evening)

**Root cause:** The BrainLift plugin kicked off its nightly run for all 5 agents simultaneously. The agents hit Anthropic's rate limit (429) on Claude Sonnet 4.6. The embedded agent runner retried aggressively with no backoff ceiling and no memory cleanup between attempts. Heap grew to 4.08 GB and Node.js SIGABRT'd.

**Contributing factors:**
- All 5 agents scheduled at the same time
- No exponential backoff on 429 retries
- Default V8 heap limit (4 GB) with no `--max-old-space-size` override
- Auth error mixed in (API key issue)

**Evidence:** Logs showed repeated 429s, followed by `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`

### Crash #2: Unhandled Promise Rejection (April 7, afternoon)

**Root cause:** Bug in `pi-agent-core` — the exec tool's stdout handler fired a callback after the agent run had already ended. The gateway's global unhandled rejection handler treated this as fatal.

**Stack trace origin:** `Agent.processEvents` in `pi-agent-core/src/agent.ts:533` — "Agent listener invoked outside active run"

**Trigger:** Agent was editing files via the exec tool when the run completed but the exec process continued emitting stdout.

### Crash #3: Same as #2 (April 7, evening)

Identical stack trace. Same exec lifecycle bug. Reproducible.

---

## OpenClaw — Config Issues Found

### 1. LaunchAgent Environment Variables Don't Work

The LaunchAgent plist uses `$(security find-generic-password ...)` shell expansion syntax for API keys. **This doesn't work in launchd plists** — plist values are literal strings, not shell-evaluated. Keychain-derived env vars are empty when launched via launchd.

**Impact:** Gateway starts without API keys → auth failures → retry loops → OOM.

**Fix needed:** Either use a wrapper shell script in the plist that resolves keys before exec'ing the gateway, or store keys directly in the plist (less secure).

### 2. Kimi Provider Configuration Issue

The Kimi direct provider was referencing an API key that wasn't properly configured. The gateway's secret resolver treated this as a hard failure.

**Current workaround:** Disabled the kimi plugin, removed kimi auth profile. The Fireworks-routed Kimi K2.5 still works via FIREWORKS_API_KEY.

### 3. Skills Loading Issues

On every startup, many skills log `"Skipping skill path that resolves outside its configured root."` These are likely symlinks or relative path references. A significant portion of the skill set is silently not loading.

**Impact:** Agent capabilities reduced without any user-visible error.

### 4. BrainLift Double-Fires

The BrainLift plugin logged two `"starting nightly run"` entries within seconds of each other — running the full 5-agent sweep twice. This doubles API usage and compounds the rate limit problem.

---

## Changes Made This Session

| Change | File | Detail |
|--------|------|--------|
| Primary model → GPT-5.4 | `openclaw.json` | Was `anthropic/claude-sonnet-4-6` |
| Fallback chain updated | `openclaw.json` | Multiple fallback providers configured |
| `openai/gpt-5.4` added to models | `openclaw.json` | New model entry with Responses API |
| Kimi plugin disabled | `openclaw.json` | `plugins.entries.kimi.enabled: false` |
| Kimi auth profile removed | `openclaw.json` | Removed kimi auth profile |
| Gateway started with 8GB heap | Manual launch | `--max-old-space-size=8192` |
| Logs truncated | `logs/` | Log rotation applied |

---

## Hermes Gateway — Status

Hermes has been stable throughout. Running Python 3.11, `hermes gateway run --replace`. Port responding (403 on unauthenticated requests, expected). Low resource usage.

OGP bridge process also running.

No crashes, no issues.

---

## Article Fact-Check: "Hermes vs OpenClaw"

An agent-drafted article was **substantially wrong**. Its central thesis — "OpenClaw is desktop-first, Hermes is cloud-native" — is fabricated. Both are local daemons running on the same machine.

**Key errors corrected:**
- Hermes is NOT cloud-hosted (it's a local Python process)
- Hermes storage is NOT cloud-backed (it's local SQLite + markdown)
- Hermes skills are NOT synced cloud storage (local filesystem)
- Hermes does NOT have built-in public endpoints (needs tunnels like OpenClaw)
- "Turn off your phone and federation continues" is false (machine off = Hermes off)

**Corrected article delivered** with fact-checked claims against live configs and running processes.

---

## Recommended Actions

### Immediate (Stability)

1. **Fix the exec lifecycle crash** — File issue against `pi-agent-core`. The unhandled rejection in `Agent.processEvents` when exec stdout fires after run completion is a repeatable crasher. Until fixed, the gateway will keep dying.

2. **Fix LaunchAgent env vars** — Replace the `$(...)` plist values with a wrapper script:
   ```bash
   #!/bin/bash
   export ANTHROPIC_API_KEY=$(security find-generic-password ...)
   # ... other keys ...
   exec <node-path> --max-old-space-size=8192 \
     <openclaw-path> gateway --port <port>
   ```
   Point the plist's ProgramArguments at this script instead of node directly.

3. **Add `--max-old-space-size=8192`** to the LaunchAgent permanently (via the wrapper script above).

### Short-term (Reliability)

4. **Stagger BrainLift agent runs** — Don't fire all agents at the same cron tick. Space them apart to avoid rate limit contention.

5. **Investigate the skipped skills issue** — Check for broken symlinks or path traversal in skills directory. These represent a significant portion of the skill set not loading.

### Medium-term (Resilience)

6. **Request backoff/retry ceiling in embedded agent runner** — The 429 retry loop with no backoff is the #1 contributor to OOM crashes. Needs exponential backoff + max retry count + memory cleanup between attempts.

7. **Add process supervision** — Current state: launchd throttles after crash, manual nohup doesn't survive reboot. Consider a wrapper that catches SIGABRT and restarts with a cooldown.

---

**Document Created:** April 7, 2026  
**Sanitized for Publication:** April 8, 2026
