# OpenClaw Crash Observations - April 7, 2026

> **Note:** This document is a sanitized version of internal debugging notes. API key fragments, file paths, and system-specific details have been removed or generalized. Created during OGP development to document OpenClaw regression analysis.

---

## Timeline Summary

User reported that OpenClaw has been crashing non-stop for the last 24 hours after previously working without issues. Multiple agents were affected, with the gateway itself crashing repeatedly.

---

## Issues Identified & Fixed

### 1. Cascading Authentication Failures (8:00 AM)

**Symptoms:**
- Agent failing with all configured model providers
- Error sequence: Multiple providers failing in sequence
- "All models failed" errors in logs

**Root Causes:**
- Kimi API: HTTP 401 - Invalid/expired API key
- Anthropic API: HTTP 401 - Invalid API key (rate limits also hit)
- OpenAI API: 401 - Malformed API key (env var expansion failing)

**Analysis:**
The `openclaw doctor` command appeared to have modified the configuration file, simplifying the env section and causing environment variable expansion to fail. The OpenAI provider had a misconfigured API key reference.

**Fix Applied:**
- Restored proper API key references in env section
- Changed OpenAI provider to use environment variable references

### 2. Model Configuration Corruption (Multiple Occurrences)

**Symptoms:**
- Agent configuration simplified to only primary model, no fallbacks
- Default model referencing non-existent model ID
- Invalid model IDs causing 404 errors

**Root Cause:**
Configuration file was being modified (likely by `openclaw doctor` command or auto-formatting) which:
- Removed fallback models from agent configurations
- Simplified environment variable definitions
- Changed model references

**Example Configuration Issue:**
```json
// Broken (no fallbacks)
"model": {
  "primary": "anthropic/claude-sonnet-4-6"
}

// Restored (with fallbacks)
"model": {
  "primary": "openai/gpt-5.4",
  "fallbacks": [
    "anthropic/claude-sonnet-4-6",
    "openai/gpt-4o",
    "fireworks/accounts/fireworks/models/kimi-k2p5"
  ]
}
```

### 3. OpenAI API 404 Errors (9:00-9:50 AM)

**Symptoms:**
- Continuous 404 errors on OpenAI models
- All OpenAI models failing despite being available via API

**Root Cause:**
GPT-5.4 and newer models require the **Responses API** endpoint (`/v1/responses`) instead of the Chat Completions API endpoint (`/v1/chat/completions`). OpenClaw was using the wrong endpoint.

**Evidence:**
- Manual API query confirmed models exist: `gpt-5.4`, `gpt-5.4-2026-03-05`, `gpt-4o` all available
- OpenAI documentation confirmed GPT-5.4 requires Responses API
- Error pattern: 404 with no body = wrong endpoint

**Fix Applied:**
Added `"api": "openai-responses"` to OpenAI provider configuration:
```json
"openai": {
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "${PERSONAL_OPENAI_API_KEY}",
  "api": "openai-responses",
  "models": [...]
}
```

**References:**
- GitHub Issue: openclaw/openclaw#38706 - "GPT-5.4 via openai-codex OAuth uses wrong API"
- OpenAI Docs: Responses API required for GPT-5.4+

### 4. Gateway Crash - "Agent listener invoked outside active run" (12:08 PM)

**Symptoms:**
- Gateway completely unreachable
- LaunchAgent exit status: -1
- Error: `Unhandled promise rejection: Error: Agent listener invoked outside active run`

**Stack Trace:**
```
at Agent.processEvents (pi-agent-core/src/agent.ts:533:10)
at emitUpdate (exec-defaults-*.js:1524:8)
at handleStdout (exec-defaults-*.js:1546:4)
```

**Context:**
Crash occurred during OGP federation testing operations. Preceding log entries show:
- Edit operations failing
- Read operations failing for config files
- Multiple edit retry attempts

**Hypothesis:**
The crash may be related to:
1. OGP operations triggering edge cases in the exec/agent framework
2. File operations failing and causing state inconsistencies
3. Agent event processing happening outside the expected execution context

**Fix Applied:**
Gateway restart resolved the immediate issue, but underlying cause remained unclear at the time.

---

## Configuration Stability Concerns

### Observed Pattern:
1. Manual configuration changes applied
2. Gateway restart
3. Configuration file modified by unknown process
4. Settings reverted or simplified
5. Agents fail again

### Suspected Culprits:
- `openclaw doctor` command
- Auto-formatting/validation on config reload
- Hot reload mechanism modifying config

---

## Gateway Stability Observations

### Crash Frequency:
- Multiple gateway restarts required during debugging session
- Many restarts over 4-hour period
- One complete crash requiring manual intervention

### Memory/CPU Usage:
- Gateway process consistently using high CPU during startup
- Process ID changing frequently

### LaunchAgent Behavior:
- LaunchAgent showing status `-1` during crashes
- Sometimes showing status `0` but process not actually running
- Restart command occasionally reports "stale process" and force-kills

---

## OGP-Related Observations

### Timing Correlation:
User mentioned doing OGP work and the timeline suggests:
- OpenClaw was stable before OGP work
- Issues began within last 24 hours
- Gateway crash occurred during OGP federation operations

### OGP Operations Observed in Logs:
- Federation requests to Clawporate gateway
- Agent-to-agent communication attempts
- File operations on OGP-related files
- Attempts to read OGP config (file not found)

### Potential OGP-Related Issues:
1. **File Operation Failures**: Multiple edit/read failures on OGP-related files
2. **Agent Event Processing**: Crash occurred during stdout handling from supervised process
3. **Missing Config Files**: OGP config expected but not found in multiple locations

---

## Mitigation Steps Applied - 5:56 PM

### Changes Made to Test Crash Prevention:

**1. Disabled Heartbeat Tasks**
- Removed `heartbeat` configurations from agent defaults
- **Hypothesis**: Hourly heartbeats triggering cron jobs that hit API failures and crashed the gateway

**2. Replaced Keychain Lookups with Direct API Keys**
- Changed from: `$(security find-generic-password ...)`
- Changed to: Direct environment variable references
- **Reason**: Keychain lookups repeatedly failing with env var expansion errors

**3. BrainLift Plugin**
- Already disabled (enabled: false)
- No changes needed

---

## Current Working Configuration

### Models:
- **Primary**: openai/gpt-5.4 (via Responses API)
- **Fallbacks**: anthropic/claude-sonnet-4-6, openai/gpt-4o, fireworks/kimi-k2p5

### API Keys (via environment variables):
- ANTHROPIC_API_KEY: Working
- OPENAI_API_KEY: Working (via Responses API)
- FIREWORKS_API_KEY: Working

### Critical Config Settings:
```json
{
  "models": {
    "providers": {
      "openai": {
        "api": "openai-responses",
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "${PERSONAL_OPENAI_API_KEY}"
      }
    }
  }
}
```

---

## Open Questions

1. **What triggers config file modifications?** Is it automatic or user-initiated?
2. **Is OGP plugin causing instability?** Correlation suggests possible connection
3. **Why are keychain lookups failing intermittently?** Sometimes work, sometimes fail
4. **What is the expected behavior for "Agent listener invoked outside active run"?** Is this a known edge case?

---

## Files Modified During Session

- `$HOME/.openclaw/openclaw.json` (multiple times)
  - API key configurations
  - Model provider settings
  - Agent model configurations
  - Environment variables

---

**Session Date**: April 7, 2026  
**OpenClaw Version**: 2026.4.5  
**Total Crashes**: Multiple  
**Average Uptime Between Crashes**: 10-20 minutes  
**Sanitized for Publication**: April 8, 2026
