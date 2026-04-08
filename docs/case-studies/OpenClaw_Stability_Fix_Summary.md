# OpenClaw Stability Fix Summary
**Date:** April 7, 2026  
**Status:** RESOLVED - Mitigations Implemented

> **Note:** This document is a sanitized version of internal debugging notes. File paths, process IDs, and system-specific details have been generalized. The original was created during OGP development to debug an unrelated OpenClaw regression.

---

## Problem Summary

OpenClaw gateway (v2026.4.5) was crashing every 10-60 minutes with two distinct failure modes:

1. **Exec Lifecycle Bug** - "Agent listener invoked outside active run" error
2. **Browser Automation OOM** - V8 heap exhaustion from heavy browser use

---

## Root Cause Analysis

### Bug #1: Exec Lifecycle Crash (CRITICAL)

**Status:** **KNOWN BUG in OpenClaw 2026.4.5** - Regression from 2026.4.2

**Error:** `Unhandled promise rejection: Error: Agent listener invoked outside active run`

**GitHub Issues:**
- [#62137](https://github.com/openclaw/openclaw/issues/62137) - Exec/PTY unhandled promise rejection
- [#61592](https://github.com/openclaw/openclaw/issues/61592) - Background exec process crashes
- [#61812](https://github.com/openclaw/openclaw/issues/61812) - Regression in 2026.4.5
- [#61733](https://github.com/openclaw/openclaw/issues/61733) - Windows crashes with same error

**Technical Details:**
When a background exec process emits stdout after the agent run has completed, the gateway crashes instead of safely ignoring or buffering the output. The `pi-agent-core` library's `Agent.processEvents` method throws when called outside an active run context.

**Trigger Scenarios:**
- File operations
- Long-running exec processes
- Bash tools calling `openclaw message send`
- Cron jobs spawning exec sessions

**Impact:** Gateway crashes every 10-60 minutes during normal operation

### Bug #2: Browser Automation OOM

**Error:** `FATAL ERROR: v8::internal::HeapAllocator::AllocateRawWithLightRetrySlowPath Allocation failed - JavaScript heap out of memory`

**Root Cause:** Heavy browser automation creates large serialized objects that overflow the default V8 heap limit (4GB)

**Impact:** Gateway crashes after extended browser automation sessions (2-4 hours)

### Bug #3: Cron Job API Key Failures (FIXED)

**Status:** RESOLVED by disabling cron jobs

**Error:** `401 Incorrect API key provided` (environment variable expansion failing)

**Root Cause:** Environment variable evaluation failing in LaunchAgent context when cron jobs execute, triggering cascading model fallback failures and eventual OOM

**Fix:** Disabled all cron jobs + BrainLift plugin

---

## Solutions Implemented

### ✅ Solution #1: Wrapper Script with 8GB Heap Limit

**File:** `$HOME/.openclaw/bin/gateway-wrapper.sh`

**What it does:**
- Sets all required environment variables explicitly
- Launches gateway with `--max-old-space-size=8192` (8GB heap limit)
- Provides logging for debugging

**LaunchAgent Integration:**
Updated LaunchAgent plist to use wrapper instead of calling node directly

**Benefits:**
- Doubles heap limit to prevent browser OOM crashes
- Ensures env vars are always set correctly
- Survives OpenClaw updates (wrapper script is outside node_modules)

### ✅ Solution #2: Disabled All Cron Jobs

**Files Modified:**
- `$HOME/.openclaw/openclaw.json` - BrainLift plugin disabled
- `$HOME/.openclaw/cron/jobs.json` - All cron jobs disabled

**Impact:**
- Eliminates cron-triggered API key evaluation failures
- Prevents BrainLift OOM crashes from simultaneous agent runs
- Stops scheduled jobs that were triggering crashes

### ✅ Solution #3: API Keys in Config File

**Status:** Already fixed via config modification

**What happened:** OpenClaw config's `env` section was modified to include API keys directly instead of shell command expansion

**Effect:** Environment variables now always available, preventing auth cascades

---

## Remaining Issues

### ⚠️ Exec Lifecycle Bug - NOT FIXED, MITIGATED

**Status:** Waiting for OpenClaw developers to fix in pi-agent-core

**Mitigation:** Gateway will still crash when exec lifecycle bug triggers, but LaunchAgent will auto-restart it

**Upstream Fix Options:**
1. Wait for OpenClaw team to release patch
2. Roll back to 2026.4.2 (workaround mentioned in GitHub issues)
3. Avoid file operations that trigger long-running exec processes

**Recommended Action:** Monitor for OpenClaw 2026.4.6 or later that fixes these issues

---

## OGP Correlation

**Conclusion:** OGP work is **NOT** the cause of crashes

**Evidence:**
- Both bugs are known OpenClaw 2026.4.5 regressions affecting all users
- Crashes occur with zero OGP activity
- GitHub issues filed by users not using OGP
- Dual-assistant setup (OpenClaw + Hermes) may have exposed bugs faster due to higher load, but didn't create them

---

## Current Status

**Gateway:** ✅ Running  
**Heap Limit:** ✅ 8GB (doubled from default 4GB)  
**Cron Jobs:** ✅ Disabled  
**BrainLift:** ✅ Disabled  
**Wrapper Script:** ✅ Active via LaunchAgent

**Expected Stability:**
- ✅ No more cron-triggered crashes
- ✅ No more browser OOM crashes (unless >8GB heap usage)
- ⚠️ Exec lifecycle bug may still cause occasional crashes (auto-restart enabled)

---

## Testing & Monitoring

**To verify stability:**

```bash
# Check gateway status
launchctl list | grep openclaw
lsof -i :<gateway-port>

# Monitor for crashes
tail -f ~/.openclaw/logs/gateway.err.log | grep -E "unhandled|crash|FATAL"

# Check uptime
ps aux | grep openclaw-gateway
```

**Success Metrics:**
- Gateway uptime > 24 hours without manual restart
- No API key evaluation errors in logs
- No OOM crashes during browser automation

---

## Rollback Instructions

If issues persist, to rollback:

```bash
# Restore original LaunchAgent
cp $HOME/Library/LaunchAgents/ai.openclaw.gateway.plist.backup-* \
   $HOME/Library/LaunchAgents/ai.openclaw.gateway.plist

# Restore cron jobs
cp $HOME/.openclaw/cron/jobs.json.backup-* \
   $HOME/.openclaw/cron/jobs.json

# Re-enable BrainLift in openclaw.json
# (manually change "enabled": false to true)

# Reload LaunchAgent
launchctl unload $HOME/Library/LaunchAgents/ai.openclaw.gateway.plist
launchctl load $HOME/Library/LaunchAgents/ai.openclaw.gateway.plist
```

Or consider rolling back OpenClaw to 2026.4.2:
```bash
npm install -g openclaw@2026.4.2
# Note: May require removing plugins.entries.memory-core.config.dreaming from config
```

---

## Next Steps

1. ✅ Monitor gateway stability for 24-48 hours
2. ⏸️ Wait for OpenClaw 2026.4.6+ release with exec lifecycle fix
3. 🔍 Investigate skipped skills issue (low priority)

---

**Document Created:** April 7, 2026  
**Last Updated:** April 7, 2026  
**Sanitized for Publication:** April 8, 2026
