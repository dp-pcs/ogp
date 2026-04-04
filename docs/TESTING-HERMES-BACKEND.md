# Testing the Hermes Backend Implementation

> Verification guide for the platform-agnostic notification backend

## What Changed

The notification system now supports multiple AI platforms via a backend abstraction layer:

**Files Modified:**
- `src/shared/config.ts` - Added optional `platform`, `hermesWebhookUrl`, `hermesWebhookSecret` fields
- `src/daemon/notify.ts` - Implemented backend system with OpenClaw and Hermes backends

**Backward Compatibility:**
- ✅ All existing OpenClaw installations work unchanged
- ✅ Config without `platform` field defaults to `'openclaw'`
- ✅ All existing code paths preserved
- ✅ No breaking changes

## Test Plan

### Phase 1: Regression Testing (OpenClaw)

**Goal:** Verify existing OpenClaw integration still works perfectly.

1. **Verify OGP is currently working:**
   ```bash
   ogp status
   # Should show your existing OpenClaw configuration
   ```

2. **Check your config has no 'platform' field:**
   ```bash
   cat ~/.ogp/config.json | grep platform
   # Should return nothing (field doesn't exist)
   ```

3. **Send a test message to an existing peer:**
   ```bash
   ogp federation list
   # Pick a peer you've already federated with

   ogp federation send <peer-alias> message '{"text":"Test from feature/hermes-support branch"}'
   ```

4. **Verify notification arrives in OpenClaw:**
   - Check your Telegram/notification channel
   - Should see the test message as before
   - No changes in behavior

**Expected Result:** Everything works exactly as before. ✅

### Phase 2: Hermes Setup (If You Want to Test It)

**Goal:** Set up a second OGP instance for Hermes and test federation.

**Prerequisites:**
- Hermes installed and gateway running
- Ready to configure webhook

#### Step 1: Configure Hermes Webhook

Edit `~/.hermes/config.yaml`:

```yaml
platforms:
  webhook:
    enabled: true
    port: 8644
    host: "127.0.0.1"
    routes:
      ogp_federation:
        secret: "test-secret-change-me"  # Pick a secret
        events: ["*"]
        prompt: |
          📡 **OGP Federation Test**

          From: {{peer_display_name}} ({{peer_id}})
          Intent: {{intent}}
          Topic: {{topic}}

          {{message}}
        deliver: "telegram"  # Or your preferred channel
```

**Restart Hermes gateway:**
```bash
hermes gateway restart
```

**Verify webhook is running:**
```bash
curl http://localhost:8644/health
# Should return: {"status":"ok"}
```

#### Step 2: Create OGP Instance for Hermes

```bash
# Create state directory
mkdir -p ~/.ogp-hermes

# Create config
cat > ~/.ogp-hermes/config.json <<'EOF'
{
  "daemonPort": 18791,
  "platform": "hermes",
  "gatewayUrl": "http://localhost:18791",
  "displayName": "David (Hermes)",
  "email": "your-email@example.com",
  "stateDir": "~/.ogp-hermes",

  "hermesWebhookUrl": "http://localhost:8644/webhooks/ogp_federation",
  "hermesWebhookSecret": "test-secret-change-me",

  "openclawUrl": "",
  "openclawToken": "",

  "rendezvous": {
    "enabled": false
  }
}
EOF
```

**Note the differences:**
- `platform: "hermes"` (this activates the Hermes backend)
- `hermesWebhookUrl` and `hermesWebhookSecret` (for webhook POST)
- `openclawUrl` and `openclawToken` are empty (not used)

#### Step 3: Start Hermes OGP Instance

```bash
# Method 1: Direct daemon start
OGP_HOME=~/.ogp-hermes node dist/daemon/server.js &

# Save PID for later
echo $! > ~/.ogp-hermes/daemon.pid
```

**Verify it's running:**
```bash
curl http://localhost:18791/.well-known/ogp
# Should return OGP metadata
```

#### Step 4: Test Local Federation

**From OpenClaw OGP to Hermes OGP:**

```bash
# Request federation
ogp federation request http://localhost:18791 --alias hermes-test

# Check pending (on Hermes side)
OGP_HOME=~/.ogp-hermes ogp federation list --status pending

# Note the peer ID and approve
OGP_HOME=~/.ogp-hermes ogp federation approve <peer-id> \
  --intents message,agent-comms
```

**Send test message:**
```bash
ogp federation send hermes-test message '{"text":"Hello Hermes from OpenClaw!"}'
```

**What should happen:**
1. Message leaves OpenClaw OGP (port 18790)
2. Arrives at Hermes OGP (port 18791)
3. Doorman validates signature
4. OGP POSTs to Hermes webhook (port 8644)
5. You see message in Hermes delivery channel (Telegram/etc.)

**Check logs:**
```bash
# Hermes logs
tail -f ~/.hermes/logs/gateway.log

# Look for:
# [webhook] Received POST on route ogp_federation
# [webhook] Signature verified
```

### Phase 3: Cleanup (If You Tested Hermes)

```bash
# Stop Hermes OGP
kill $(cat ~/.ogp-hermes/daemon.pid)

# Remove test state (optional)
# rm -rf ~/.ogp-hermes
```

## Verification Checklist

### OpenClaw (Must Pass)
- [ ] Existing OpenClaw OGP still runs
- [ ] Can send messages to existing peers
- [ ] Notifications arrive in OpenClaw
- [ ] `ogp status` shows correct info
- [ ] No errors in logs

### Hermes (Optional Testing)
- [ ] Hermes webhook receives POST
- [ ] Signature verification passes
- [ ] Message arrives in Hermes delivery channel
- [ ] Logs show successful notification
- [ ] Can federate with OpenClaw instance

## Troubleshooting

### Build Issues

**If TypeScript compilation fails:**
```bash
npm run build
# Check for errors, fix them, rebuild
```

### Runtime Issues

**OpenClaw notifications not working:**
1. Check config has no `platform` field (should default to 'openclaw')
2. Verify `openclawUrl` and `openclawHooksToken` still set
3. Check logs for errors
4. Try sending to a known-working peer

**Hermes webhook not receiving:**
1. Verify webhook secret matches in both configs
2. Check Hermes gateway is running: `curl http://localhost:8644/health`
3. Check Hermes OGP is running: `curl http://localhost:18791/.well-known/ogp`
4. Check Hermes logs: `tail -f ~/.hermes/logs/gateway.log`

**Signature verification fails:**
1. Secrets must match exactly:
   - `hermesWebhookSecret` in `~/.ogp-hermes/config.json`
   - `secret` in `~/.hermes/config.yaml` under `routes.ogp_federation`
2. No extra whitespace in secret values
3. Case sensitive

## Success Criteria

### Minimum (Must Pass)
- ✅ OpenClaw integration works unchanged
- ✅ No regression in existing functionality
- ✅ Code compiles without errors

### Full (Nice to Have)
- ✅ Hermes webhook receives messages
- ✅ Local OpenClaw ↔ Hermes federation works
- ✅ Both platforms can send/receive simultaneously

## Next Steps

After verification:

1. **If all tests pass:**
   - Ready to merge feature branch
   - Update CHANGELOG
   - Version bump to 0.3.0
   - Publish to npm

2. **If issues found:**
   - Document them
   - Fix on feature branch
   - Re-test

3. **Future work:**
   - Update CLI setup wizard for platform selection
   - Add platform selection to `ogp setup`
   - Documentation updates for Hermes users
   - Integration tests for both platforms

---

**Branch:** `feature/hermes-support`
**Last Updated:** 2026-04-04
**Status:** Ready for Testing
