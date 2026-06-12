# Quick Start: Testing the Hermes Integration

> 5-minute verification that nothing broke

## Step 1: Verify OpenClaw Still Works (2 minutes)

```bash
# Check OGP is running
ogp status

# Expected: Shows your OpenClaw config, daemon running, etc.
# If not running: ogp start
```

```bash
# List your existing peers
ogp federation list

# Pick one you've tested with before
# Example: alice
```

```bash
# Send a test message
ogp federation send alice message '{"text":"Testing after Hermes backend update"}'

# Check your Telegram/notification channel
# Expected: Message arrives as normal
```

**✅ If this works, the implementation is safe!**

## Step 2: Check What Changed (30 seconds)

```bash
# View your current config
cat ~/.ogp/config.json | grep platform

# Expected: Nothing returned (field doesn't exist)
# This means it defaults to 'openclaw' - perfect!
```

```bash
# Verify you're on the feature branch
git branch

# Expected: * feature/hermes-support
```

## Step 3: Understanding the Changes (1 minute)

**What was added:**
- Backend abstraction system
- Hermes notification backend
- Config fields: `platform`, `hermesWebhookUrl`, `hermesWebhookSecret`

**What stayed the same:**
- All OpenClaw notification logic (just moved into OpenClawBackend class)
- Default behavior (no `platform` field = OpenClaw)
- Your existing config works unchanged

**The magic:**
```typescript
// In config.ts
platform?: 'openclaw' | 'hermes';  // Optional!

// In notify.ts
const platform = config.platform || 'openclaw';  // Defaults to OpenClaw!
```

## Step 4: Optional - Test Hermes (10-30 minutes)

**Only if you want to test Hermes integration:**

See [TESTING-HERMES-BACKEND.md](./docs/TESTING-HERMES-BACKEND.md) for full guide.

**Quick version:**
1. Configure Hermes webhook route
2. Create `~/.ogp-hermes/config.json` with `platform: "hermes"`
3. Start second OGP daemon on port 18791
4. Federate OpenClaw OGP with Hermes OGP
5. Send test message
6. Verify arrives in Hermes

## Rollback (If Needed)

**If something breaks:**

```bash
# Switch back to main branch
git checkout main

# Rebuild from main
npm run build

# Restart OGP
ogp stop
ogp start

# Everything back to normal
```

**Then file an issue on the feature branch to fix.**

## Success Criteria

**Minimum (Must Pass):**
- ✅ OpenClaw notifications still work
- ✅ No errors in logs
- ✅ Config unchanged

**Full (Nice to Have):**
- ✅ Hermes webhook integration works
- ✅ Local federation works
- ✅ Both platforms can operate simultaneously

## What to Report

**If tests pass:**
```
✅ Tested on feature/hermes-support
✅ OpenClaw notifications work
✅ No regressions found
Ready to merge
```

**If issues found:**
```
❌ Issue found: [describe the problem]
- Steps to reproduce
- Expected behavior
- Actual behavior
- Logs/errors
```

## Next Actions

**After successful testing:**
1. Review [HERMES-INTEGRATION-SUMMARY.md](./HERMES-INTEGRATION-SUMMARY.md)
2. Decide: merge or iterate
3. If merging: update CHANGELOG, version bump, publish

**If you want to test Hermes:**
1. Follow [hermes-local-testing.md](./docs/hermes-local-testing.md)
2. Report results

---

**Branch:** `feature/hermes-support`
**Time to Test:** 5-30 minutes (depending on depth)
**Risk:** Very low (fully isolated)
