# OpenClaw Crash Resolution
**Date:** April 7, 2026  
**Status:** ✅ RESOLVED with mitigations

> **Note:** This document is a sanitized version of internal debugging notes. System-specific details have been generalized. Original created during OGP development to document OpenClaw regression debugging.

---

## Quick Summary

Your OpenClaw crashes were caused by **TWO KNOWN BUGS in version 2026.4.5** - NOT by your OGP work or dual-assistant setup. Multiple GitHub issues filed by other users in the last 1-2 days confirm this.

**Fixes implemented:**
1. ✅ Wrapper script with 8GB heap limit
2. ✅ All cron jobs disabled
3. ✅ BrainLift plugin disabled
4. ✅ Gateway auto-restart enabled

**Current Status:** Gateway running stable with mitigations. Exec lifecycle bug may still cause occasional crashes but will auto-restart.

---

## The Bugs

### Bug #1: Exec Lifecycle Crash
**GitHub Issues:** [#62137](https://github.com/openclaw/openclaw/issues/62137), [#61592](https://github.com/openclaw/openclaw/issues/61592), [#61812](https://github.com/openclaw/openclaw/issues/61812)

**Error:** `Unhandled promise rejection: Error: Agent listener invoked outside active run`

**Cause:** Regression in 2026.4.5 where background exec process stdout crashes gateway after agent run completes

**Platforms Affected:** Linux, Windows, macOS (all platforms)

**Your Impact:** Crashed every 10-60 minutes during normal operations

**Mitigation:** Wrapper script enables auto-restart; upstream fix pending

### Bug #2: Browser Automation OOM
**Error:** `FATAL ERROR: JavaScript heap out of memory`

**Cause:** Default 4GB V8 heap limit too small for heavy browser automation

**Your Impact:** Crashed after 2+ hours of browser activity

**Fix:** Increased heap to 8GB via `--max-old-space-size=8192` flag

### Bug #3: Cron Job API Key Failures
**Error:** `401 Incorrect API key provided` (env var expansion failing)

**Cause:** Environment variable evaluation failing when cron jobs execute

**Your Impact:** Cron job running every 5 minutes triggering cascading failures

**Fix:** Disabled all cron jobs and BrainLift plugin

---

## What We Did

### 1. Created Gateway Wrapper Script

**File:** `$HOME/.openclaw/bin/gateway-wrapper.sh`

**What it does:**
```bash
#!/bin/bash
# - Sets all environment variables
# - Launches gateway with 8GB heap limit
# - Enables auto-restart via LaunchAgent
exec <node-path>/bin/node --max-old-space-size=8192 \
  <openclaw-path>/dist/index.js gateway --port <port>
```

### 2. Updated LaunchAgent

**File:** `$HOME/Library/LaunchAgents/ai.openclaw.gateway.plist`

**Change:** Now calls wrapper script instead of node directly

### 3. Disabled Cron Jobs

**Files:**
- `$HOME/.openclaw/openclaw.json` - BrainLift disabled
- `$HOME/.openclaw/cron/jobs.json` - All cron jobs disabled

---

## OGP Cleared of Suspicion

**Verdict:** Your OGP work is NOT causing the crashes.

**Evidence:**
- Same bugs reported by users not using OGP
- GitHub issues filed 1-2 days ago across all platforms
- Crashes occur with zero OGP activity
- Known regressions in OpenClaw 2026.4.5

**Your dual-assistant setup (OpenClaw + Hermes) may have exposed the bugs faster due to higher load, but didn't create them.**

---

## Current Gateway Status

- **PID:** [Running]
- **Port:** ✅ listening
- **Heap Limit:** 8GB (doubled from 4GB)
- **Wrapper:** ✅ Active
- **Cron Jobs:** ✅ Disabled
- **BrainLift:** ✅ Disabled
- **LaunchAgent:** ✅ Auto-restart enabled

**Uptime:** Started and currently stable

---

## Expected Behavior

**Fixed:**
- ✅ No more cron-triggered crashes
- ✅ No more browser OOM crashes (unless you exceed 8GB heap)
- ✅ Auto-restart on any crash

**Still Possible:**
- ⚠️ Exec lifecycle bug may still crash gateway occasionally
- When this happens, LaunchAgent will auto-restart within seconds

---

## Monitoring

**Check gateway status:**
```bash
launchctl list | grep openclaw
lsof -i :<port>
ps aux | grep openclaw-gateway
```

**Watch for crashes:**
```bash
tail -f ~/.openclaw/logs/gateway.err.log | grep -E "unhandled|FATAL"
```

**Success metrics:**
- Uptime > 24 hours without manual intervention
- No API key errors in logs
- Auto-restart working if crashes occur

---

## Rollback (if needed)

```bash
# Restore original LaunchAgent
cp $HOME/Library/LaunchAgents/ai.openclaw.gateway.plist.backup-* \
   $HOME/Library/LaunchAgents/ai.openclaw.gateway.plist

# Restore cron jobs
cp $HOME/.openclaw/cron/jobs.json.backup-* \
   $HOME/.openclaw/cron/jobs.json

# Reload
launchctl unload $HOME/Library/LaunchAgents/ai.openclaw.gateway.plist
launchctl load $HOME/Library/LaunchAgents/ai.openclaw.gateway.plist
```

Or downgrade to OpenClaw 2026.4.2:
```bash
npm install -g openclaw@2026.4.2
```

---

## Documentation

**Full Details:** See `OpenClaw_Stability_Fix_Summary.md`  
**Original Analysis:** See `crash_observations.md`  
**Status Report:** See `OpenClaw_Hermes_Status_Report_20260407.md`

**GitHub Issues to Watch:**
- https://github.com/openclaw/openclaw/issues/62137
- https://github.com/openclaw/openclaw/issues/61592
- https://github.com/openclaw/openclaw/issues/61812
- https://github.com/openclaw/openclaw/issues/61733

---

**Resolution Date:** April 7, 2026  
**Gateway Status:** ✅ Running with mitigations  
**Next Check:** Monitor for 24 hours  
**Sanitized for Publication:** April 8, 2026
