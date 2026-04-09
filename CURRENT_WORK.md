# OGP Development - Current Work Session

**Date**: April 9, 2026
**Version**: 0.4.2
**Focus**: OGP v0.4.2 release cut after stabilization, delegated-authority rollout, and end-to-end validation

## Canonical Active Backlog

This file is the canonical short-term backlog for the current OGP push.

Do **not** treat the following as active implementation queues:
- `docs/hermes-implementation-checklist.md` — historical implementation checklist; much of it is already shipped
- `docs/MULTI-FRAMEWORK-IMPL.md` — historical implementation log; some unchecked items were not maintained after features landed

Active backlog is:
1. Normalize stale backlog/docs so the repo stops contradicting itself
2. Make an explicit BUG-2 release decision and record closure criteria
3. Build the delegated authority / governance layer
4. Rewrite setup around that model
5. Enforce runtime policy behavior
6. Resolve policy precedence and remaining notification gaps

## BUG-2 Release Decision

### Decision

For **v0.4.2**, BUG-2 is considered resolved enough to stop blocking the next product step.

### What counts as fixed for v0.4.2

- inbound federated work reaches the local agent
- the local agent can read and reason over that work
- OpenClaw delivery prefers `/hooks/agent` with explicit human-delivery targeting
- fallback session injection still reaches the correct human-facing session when hook delivery is unavailable

### Accepted limitation for v0.4.2

Native sender identity preservation inside the OpenClaw/Telegram surface is **not** a release blocker for v0.4.2.

If the message appears as injected/system/`cli` content but:
- the peer identity is preserved in message content/metadata
- the agent can reason over it correctly
- the configured human-delivery target is respected

then BUG-2 should not block release.

### What remains out of scope for BUG-2

The following remain real issues, but they are no longer part of BUG-2's release gate:
- proactive federation lifecycle surfacing to the human (`BUG-3`)
- policy/governance for when to forward, summarize, act, or ask
- native sender identity parity with first-party Telegram messages

### Why this decision is correct

The live repro changed the diagnosis:
- part of the original problem was transport/injection
- a larger remaining problem is governance and channel-grounding

That means continuing to chase perfect sender identity before building the delegated-authority model is the wrong order.

## Next Build - Delegated Authority Model for OGP

This is the next product step after proving that OpenClaw delivery works via `/hooks/agent`.

### Core Product Point

OGP is not just message transport. The real value is that each human can bring an agent to a shared interaction space, and each human can decide how much authority that agent has when dealing with peer agents.

That means the missing layer is not primarily protocol transport anymore. It is a clear delegation model between the human and their agent.

### What We Need To Build

#### 1. First-class governance model

We need explicit config for agent authority, not just delivery routing.

The model should cover:
- when the agent may reply autonomously to peers
- when it must ask the human first
- when it should summarize instead of forward
- when a peer request counts as a human relay obligation
- global defaults, per-peer overrides, and topic-level overrides

#### 2. Setup interview

`ogp setup` should include a real human-agent interview, similar in spirit to Claude Code's ask-user flow.

The interview should ask:
- Should your agent answer peers on its own?
- Should it ask before replying?
- Should it summarize most things and only escalate important items?
- If a peer says "tell David X", should that always be delivered, summarized, or held for approval?
- Are some topics always approval-required?
- Do some trusted peers get more autonomy than others?

#### 3. Separate message classes

Behavior needs to distinguish between:
- agent-to-agent work
- human relay requests
- approval requests
- status/update only

Normal `agent-comms` should stay agent-to-agent unless policy says otherwise.

If a peer asks, "tell David X", that is different from, "what do you know about project intents?" The first is a relay obligation. The second is usually agent-to-agent work.

#### 4. Runtime interpretation

The daemon/backend should turn config into explicit instructions for the local agent so the agent is not improvising.

Examples:
- reply to peer directly unless blocked
- surface only a summary to the human
- do not claim delivery unless human relay actually happened
- if the request is a relay-to-human request, apply relay policy instead of ordinary peer-reply policy

#### 5. Natural-language updates later

After setup, the human should be able to change this with natural language.

Examples:
- "Handle Apollo autonomously unless he asks for approval."
- "Never reply to peers without clearing it with me."
- "Summarize everything except project work."

This means the config schema should be designed so it can be edited by both:
- the setup wizard
- future agent-mediated commands

#### 6. Docs and skills must explain the real value

Docs should explain:
- humans bring agents to the party
- each human decides what their agent is allowed to do
- federation is delegated collaboration with boundaries, not just transport

Skills should teach agents:
- default `agent-comms` stays agent-to-agent
- human surfacing depends on policy
- relay obligations are special
- approval boundaries must be respected

### Recommended Implementation Order

1. Add config schema for delegated authority
2. Add setup interview for human-agent OGP preferences
3. Update runtime handling so agent-to-agent work and human-relay work are treated differently
4. Update skills and docs to reflect the model clearly
5. Add end-to-end tests covering autonomy, summary, approval, and relay behaviors

### Test Scenarios We Must Cover Before Release

- Peer asks peer a question:
  - local agent replies to peer
  - human only gets a summary if policy says so
- Peer says "tell David X":
  - local agent follows relay policy correctly
- Approval-required mode:
  - no reply until human approves
- Autonomous mode:
  - agent handles it and only surfaces blockers or important results
- Per-peer override:
  - trusted peer behaves differently from a new or less-trusted peer

### Current Judgment

The protocol is already strong enough for the core use case.

What needs to be built next is the delegation/governance product layer on top of it:
- authority
- approval boundaries
- human surfacing preferences
- peer-specific trust behavior

That is the next meaningful build.

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
- Version: 0.4.2

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

## Historical Debug Notes (Superseded by Sections Above)

The remaining sections in this document are retained as debugging notes and repro history.

Their "next steps" are **not** the canonical backlog anymore unless they also appear in the sections above.

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

Historical status snapshot below. For the current source of truth, use the canonical backlog at the top of this file plus Beads.

Remaining stabilization queue after the delegated-authority work:
- `clawd-10a.12` / **BUG-10** next/last — rendezvous deregistration remains the only open stabilization bug in this queue, and it is still a convenience/discovery issue rather than the core direct-federation path.

- **BUG-1**: ✅ FIXED - Keychain collision (v0.3.3)
- **BUG-2**: ✅ CLOSED FOR v0.4.2 - Accepted limitation remains for native Telegram sender identity parity
- **BUG-3**: ✅ FIXED - Proactive federation lifecycle notifications now surface through the local agent path
- **BUG-5**: ✅ FIXED - Remove/reject now persist minimal tombstones and refederation replaces them with fresh pending peer state
- **BUG-7**: ✅ FIXED - Refederation no longer revives stale display names from removed/rejected peer records
- **BUG-8**: ✅ FIXED - Delegated-authority precedence is now deterministic and tested
- **BUG-10**: ✅ FIXED - Daemon shutdown now stops the HTTP listener and exits cleanly, so rendezvous deregistration is no longer undermined by a still-running process
- **BUG-11**: ✅ FIXED - macOS key storage/source-of-truth is now explicit in runtime messaging and docs

### Rendezvous Posture

Rendezvous remains available, but it is now treated as an **optional** discovery/invite layer rather than a core OGP requirement.

- Primary federation path: stable public gateway URLs plus direct federation
- Optional convenience layer: pubkey lookup and short invite codes via rendezvous
- Explicit non-goals: NAT traversal, UDP hole punching, or transport relay

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
- [x] Update CHANGELOG.md for v0.4.2 posture and accepted limitations
- [x] Update README.md with v0.4.2 delivery, precedence, and session-key grounding notes
- [ ] Check openclaw-federation repo for syntax updates
- [x] Update OGP skills to match delegated-authority and v0.4.2 posture
- [ ] Publish v0.4.2 to npm
- [ ] Push updated skills to clawhub

## Notes for Next Session

**Where we left off**: BUG-2 and BUG-3 were closed in the accepted `v0.4.2` posture. The remaining work is release follow-through and the next product layer on top of transport.

**Important runtime fact**: OGP now requests the Telegram `sessionKey` for `/hooks/agent` when local OpenClaw allows it via `hooks.allowRequestSessionKey=true` and compatible `hooks.allowedSessionKeyPrefixes`.

**Remaining limitation**: Most local installs still have `hooks.allowRequestSessionKey=false`, which means `/hooks/agent` falls back to the default hook session (`agent:main:main`) and native Telegram sender identity still looks like injected/system/`cli` content.

**Next practical step**: Finish aligning skills, release notes, and docs to the shipped runtime so the repo no longer implies there is an unshipped sender-identity fix in progress.
