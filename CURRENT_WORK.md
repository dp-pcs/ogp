# OGP Development - Current Work Session

**Date**: April 8, 2026
**Version**: 0.4.1 (unreleased)
**Focus**: BUG-2 Investigation - Phantom Messages in OpenClaw Federation

## Session Summary

This session focused on fixing BUG-2 where OGP federation messages were appearing in Telegram as notifications but not entering the agent's conversation queue, preventing the agent from seeing and responding to them naturally.

## Fresh Repro Notes After Full Federation Reset

### April 8, 2026 - Clean Baseline Retest

- Both peer stores were cleared and both daemons were restarted before this retest.
- Junior sent a new federation request to Apollo from the clean state.
- Apollo surfaced the incoming federation request to the human immediately and the request was approved.
- Junior did **not** proactively surface that inbound federation request/approval event to the human.
- The human had to explicitly ask Junior about it before Junior acknowledged the federation state.
- Junior then sent an agent-comms message at approximately **1:45 PM MST/MDT**.
- Apollo surfaced Junior's message within about **30 seconds** and reported that he had responded to Junior's request.
- Apollo's reply was **not proactively surfaced** to the human through Telegram.
- When asked whether there were new messages, Junior first said there was nothing new, then referenced the Apollo reply that had in fact already arrived.
- A second Apollo message explicitly instructed Junior to tell David something and report back.
- Junior still did **not** proactively surface anything in Telegram.
- Apollo then reported that Junior had acknowledged the instruction and said he had notified David via **webchat**.
- Inspection of Junior's live session transcript confirmed the exact failure mode:
  - Apollo's inbound OGP message exists in the `agent:main:telegram:direct:8311956999` session as a `cli`/injected message.
  - Junior reads and reasons over that message successfully.
  - Junior chooses to act in the currently active **webchat** conversation instead of the human's Telegram conversation.
  - Junior then sends an outbound OGP receipt to Apollo claiming the human was notified via webchat.

**Interpretation**

- Apollo-side inbound federation request notification path is working.
- Junior-side proactive surfacing for federation lifecycle events still appears incomplete or inconsistent, even from a clean baseline.
- This is distinct from the later agent-comms visibility issue and should be treated as its own notification-state bug.
- Junior → Apollo agent-comms delivery is also working from the clean baseline.
- The next checkpoint is whether **Apollo's reply** is proactively surfaced back through Junior to the human without requiring the human to ask Junior first.
- Clean-baseline result: Apollo → Junior agent-comms is being **stored in session state** and is **actionable by Junior**, but it is **not being delivered as a real Telegram-visible message** to the human.
- Junior's follow-up behavior shows a **channel confusion bug**: OGP-injected messages are not bound strongly enough to the human's actual Telegram delivery surface, so Junior may respond via webchat or another active surface instead.

### Behavioral Reframe From Live Junior Transcript

- The human clarified that they do **not** necessarily want raw OGP messages blindly printed into Telegram.
- Desired behavior is preference-sensitive:
  - some humans may want direct forwarding of every message
  - others may want autonomous handling, summarization, or selective escalation
- Junior's transcript shows a second issue beyond delivery:
  - Junior believes the current conversation surface is **webchat**
  - the human is actually interacting with Junior in **Telegram**
  - Junior therefore reports to Apollo that he notified the human via webchat, even when the human did not perceive a proactive Telegram message

**Updated interpretation**

- This is not only an OGP transport problem.
- It is also a **local agent instruction/policy problem**:
  - Junior lacks a clear policy for what to do with inbound federated messages
  - Junior lacks reliable channel identity grounding for the human conversation surface
- Likely split:
  - **Prompt/skill issue**: what to do with inbound agent-comms (forward, summarize, act, ask, escalate)
  - **Runtime/session issue**: how OpenClaw labels or exposes the active human channel to the model

## What Was Accomplished

### 1. Multi-Framework Architecture (✅ COMPLETE)
- **Meta-config registry** at `~/.ogp-meta/config.json` supporting multiple frameworks simultaneously
- **`--for` flag** replaces environment variable pattern: `ogp --for openclaw|hermes|standalone <command>`
- **Auto-detection** when `--for` omitted (checks running daemons)
- **Framework aliases**: `oc` → `openclaw`, `h` → `hermes`
- **Per-framework configs**:
  - OpenClaw: `~/.ogp/config.json` (port 18790)
  - Hermes: `~/.ogp-hermes/config.json` (port 18793)
  - Standalone: `~/.ogp-standalone/config.json` (port 18791)

### 2. BUG-2 Investigation - Message Delivery Path

**Problem Statement**: OGP federation messages from peer agents were not appearing in Junior's Telegram conversation as messages he could respond to.

**What We Tried**:

#### Attempt 1: WebSocket Bridge with `chat.inject` (❌ FAILED)
- **File**: `src/daemon/openclaw-bridge.ts`
- **Approach**: Direct WebSocket connection to OpenClaw Gateway
- **Result**: Connection handshake failed - "invalid request frame"
- **Log Evidence**: OpenClaw Gateway logs show `[ws] invalid handshake` errors
- **Root Cause**: `ws` npm package doesn't match OpenClaw's WebSocket protocol expectations

#### Attempt 2: CLI-based `chat.inject` (✅ PARTIAL - TUI only)
- **Approach**: Use `openclaw gateway call ... chat.inject` via CLI
- **Session Key**: `agent:main:main`
- **Result**: Messages appeared in TUI successfully ✅
- **Limitation**: TUI and Telegram sessions are **completely isolated**
- **Evidence**: Junior confirmed seeing messages in TUI but not in Telegram

#### Attempt 3: CLI-based `sessions.send` to Telegram session (✅ DELIVERS but ❌ WRONG SENDER)
- **Current Implementation** (working but incomplete)
- **Approach**: Use `openclaw gateway call ... sessions.send` via CLI
- **Session Key**: `agent:main:telegram:direct:8311956999`
- **Result**: Messages successfully delivered to Telegram ✅
- **Critical Issue**: Sender shows as "cli" instead of peer identity ❌
- **Evidence**: Junior confirmed receiving messages but can't identify sender as peer

**Example that works**:
```bash
openclaw gateway call \
  --token <gateway-token> \
  --url wss://localhost:18789 \
  --params '{"key":"agent:main:telegram:direct:8311956999","message":"Test"}' \
  --json \
  sessions.send
```

Returns:
```json
{
  "runId": "...",
  "status": "started",
  "messageSeq": 449
}
```

Message appears in Telegram but sender = "cli", not the actual peer.

#### Attempt 4: `/hooks/agent` Webhook (🔍 IN PROGRESS)
- **Approach**: HTTP POST to `https://localhost:18789/hooks/agent`
- **Token**: Uses `openclawHooksToken` instead of `openclawToken`
- **Params**: `{message, from, channel, to}`
- **Status**: Returns success but message didn't appear in Telegram conversation

**Test Command**:
```bash
curl -k -X POST https://localhost:18789/hooks/agent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <hooks-token>" \
  --data '{"message":"Test","from":"Apollo","channel":"telegram","to":"8311956999"}'
```

Returns: `{"ok":true,"runId":"..."}`

Junior saw it in logs/TUI but NOT in Telegram conversation ❌

## Current Code State

### Files Modified

**1. `src/daemon/openclaw-bridge.ts`** - CLI-based bridge
- Exports: `connectBridge()`, `injectMessage()`, `disconnectBridge()`
- Uses `openclaw gateway call ... sessions.send` via `execFile`
- Returns success if `response.runId` or `response.status === 'started'`
- **Issue**: Doesn't preserve sender identity

**2. `src/daemon/notify.ts`** - Notification routing
- `OpenClawBackend.notify()`: Routes to correct Telegram session
- Builds session key: `agent:${agentId}:telegram:direct:${chatId}`
- Falls back to Telegram CLI if sessions.send fails
- **Issue**: Method 1 (sessions.send) works but wrong sender

**3. `src/daemon/server.ts`** - Daemon lifecycle
- Calls `connectBridge()` on startup
- Calls `disconnectBridge()` on graceful shutdown
- **Note**: connectBridge() is now a no-op (CLI-based, no persistent connection)

**4. `package.json`**
- Added `ws` and `@types/ws` dependencies (may not be needed if staying with CLI approach)
- Version: 0.4.1

## Key Discoveries

### Session Architecture
OpenClaw maintains **separate sessions per channel**:
- `agent:main:main` - TUI/webchat session ✅ Works with chat.inject
- `agent:main:telegram:direct:8311956999` - Telegram DM session ✅ Works with sessions.send

**Critical Insight**: TUI and Telegram do NOT share conversation context. Messages injected into one don't appear in the other.

### Sender Identity Problem
All injection methods tested lose sender identity:
- `chat.inject` → Sender: "cli" or system
- `sessions.send` → Sender: "cli"
- `/hooks/agent` → Unclear (didn't appear in conversation)

**What Junior Sees**:
```
Message ID: 13180
Sender: cli (NOT "Apollo @ Hermes")
Content: "[OGP Federation] From Apollo @ Hermes..."
```

The content CLAIMS it's from Apollo, but the sender metadata says "cli".

### Real Federation Test
Successfully created Apollo ↔ Junior federation:
- Apollo (Hermes): `302a300506032b6570032100c3068604`
- Junior (OpenClaw): `302a300506032b6570032100c306860469d23970f3faab99ee0f428b3943620bb49490edb41150c6a11b9e58`
- Command: `ogp --for hermes federation agent <junior-peer-id> general "message"`
- Result: Message sent ✅, daemon received it ✅, injected to Telegram ✅, but sender wrong ❌

## What's Working

✅ **Multi-framework support**: `ogp --for openclaw|hermes` commands work
✅ **Federation establishment**: Can federate Apollo ↔ Junior
✅ **Message reception**: OGP daemon receives federation messages
✅ **Telegram delivery**: Messages reach Junior's Telegram session
✅ **Agent visibility**: Junior can read message content

## What's NOT Working

❌ **Sender identity preservation**: All messages show sender="cli"
❌ **Peer-to-peer replies**: Junior can't reply directly to Apollo (sees it as system message)
❌ **True agent-to-agent comms**: No bidirectional peer conversation possible

## Next Steps

### Immediate Priority: Fix Sender Identity

**Option 1: Investigate `/hooks/agent` parameters**
- The webhook endpoint accepted `from` parameter
- Need to determine correct param combination to route to Telegram conversation
- Test different channel/to/from combinations

**Option 2: Check if sessions.send supports metadata**
- Research if there's a way to pass sender info to sessions.send
- May need to check OpenClaw Gateway RPC schema

**Option 3: Alternative injection method**
- Check if there's a `chat.inject` variant that works for Telegram sessions
- Explore if there's a "simulate inbound message" RPC method

**Option 4: Hybrid approach**
- Use sessions.send for delivery
- Separately inject sender metadata
- May require two RPC calls

### Investigation Commands

```bash
# List all available RPC methods
openclaw gateway call --token <token> --url wss://localhost:18789 --params '{}' schema --json

# Get session details
openclaw gateway call --token <token> --url wss://localhost:18789 --params '{"key":"agent:main:telegram:direct:8311956999"}' sessions.get --json

# Test webhook variations
curl -k -X POST https://localhost:18789/hooks/agent \
  -H "Authorization: Bearer <hooks-token>" \
  -d '{"message":"test","from":"Apollo @ Hermes","channel":"telegram","to":"8311956999","metadata":{"peerId":"302a..."}}'
```

## Open Questions

1. **How does OpenClaw's Telegram binding inject inbound messages with sender identity?**
   - When a real Telegram message arrives, how does it set sender?
   - Can we mimic that mechanism for OGP messages?

2. **Does `/hooks/agent` route to Telegram conversation or TUI?**
   - Webhook returned success but message not in Telegram
   - Need to check TUI to see if it appeared there

3. **Is there a "synthetic message" RPC for testing?**
   - OpenClaw might have a testing/dev RPC for simulating inbound messages
   - Could be in dev/debug commands

4. **Can we modify OpenClaw Gateway to support peer sender metadata?**
   - This might require OpenClaw code changes
   - May not be viable for OGP package

## Related Issues

- **BUG-1**: ✅ FIXED - Keychain collision (v0.3.3)
- **BUG-2**: 🔄 IN PROGRESS - Phantom messages (this document)
- **BUG-3**: ⏸️ PENDING - No proactive federation request notifications
- **BUG-5**: ⏸️ PENDING - Tombstone persistence
- **BUG-7**: ⏸️ PENDING - Ghost identity (stale display names)
- **BUG-8**: ⏸️ PENDING - Policy precedence confusion
- **BUG-10**: ⏸️ PENDING - Rendezvous deregistration
- **BUG-11**: ⏸️ PENDING - Keypair storage confusion

## Configuration Files

**OpenClaw** (`~/.ogp/config.json`):
```json
{
  "daemonPort": 18790,
  "openclawUrl": "https://localhost:18789",
  "openclawToken": "<redacted>",
  "openclawHooksToken": "<redacted>",
  "notifyTarget": "telegram:8311956999",
  "gatewayUrl": "https://ogp.sarcastek.com",
  "displayName": "Junior @ OpenClaw",
  "email": "david@theproctors.cloud"
}
```

**Hermes** (`~/.ogp-hermes/config.json`):
```json
{
  "daemonPort": 18793,
  "platform": "hermes",
  "hermesWebhookUrl": "http://localhost:8644/webhooks/ogp_federation",
  "hermesWebhookSecret": "<secret>",
  "gatewayUrl": "https://hermes.sarcastek.com",
  "displayName": "Apollo @ Hermes",
  "email": "david@example.com"
}
```

## Test Commands

**Start daemons**:
```bash
ogp --for openclaw start   # Junior
ogp --for hermes start     # Apollo
```

**Check status**:
```bash
ogp --for openclaw status
ogp --for hermes status
```

**Send agent-comms**:
```bash
ogp --for hermes federation agent \
  302a300506032b6570032100c306860469d23970f3faab99ee0f428b3943620bb49490edb41150c6a11b9e58 \
  general \
  "Test message from Apollo"
```

**Test injection directly**:
```bash
node -e "
import('/Users/davidproctor/Documents/GitHub/ogp/dist/daemon/notify.js').then(async (m) => {
  const result = await m.notifyLocalAgent({
    text: 'Test',
    peerId: '302a300506032b6570032100e9dc2284',
    peerDisplayName: 'Apollo @ Hermes',
    intent: 'agent-comms',
    topic: 'general'
  });
  console.log('Result:', result);
});
"
```

## Documentation To-Do

- [x] Create CURRENT_WORK.md (this file)
- [ ] Update CHANGELOG.md for v0.4.1
- [ ] Update README.md with multi-framework examples
- [ ] Check openclaw-federation repo for syntax updates
- [ ] Update ogp skill with new --for syntax
- [ ] Publish v0.4.1 to npm
- [ ] Push updated skills to clawhub

## Notes for Next Session

**Where we left off**: Testing `/hooks/agent` webhook endpoint to see if it can preserve sender identity when delivering to Telegram.

**Next experiment**: Try different parameter combinations with `/hooks/agent` to route messages to Telegram conversation with correct sender metadata.

**Alternative path**: If OpenClaw doesn't support this natively, we may need to accept that OGP messages appear as system/cli messages, and implement a workaround like:
1. Include peer identity in message content (already doing this)
2. Teach agents to recognize OGP message format
3. Build a reply mechanism that routes responses back through OGP federation

**Critical question**: Is preserving sender identity a hard requirement, or can we work with "cli" sender if agents can parse peer info from message content?
