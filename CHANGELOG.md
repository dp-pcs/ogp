# Changelog

## 0.2.30 (2026-04-02)

### BUILD-116: Race Condition Fix for Peer Storage

**Problem:** When a peer approval was received, the status update didn't persist to disk because of a race condition between concurrent `savePeers()` calls. The approval notification would update the peer in memory, but a concurrent write would overwrite it with stale data.

**Solution:**
- Changed `savePeers()` to use atomic file writes (write to temp file, then rename)
- Added error handling and logging for disk write failures
- `savePeers()` now returns boolean to indicate success/failure
- `approvePeer()`, `addPeer()`, and other peer functions now log errors on save failure

**Impact:** Federation approvals now reliably persist to disk. The requester automatically sees "approved" status after the approver confirms.

---

## 0.2.29 (2026-04-02)

### BUILD-115: Agent-Specific Notification Routing

**Problem:** OGP notifications were routed to a single `notifyTarget`, causing all agent-comms to notify the main agent even when intended for other agents (Scribe, Optimus, etc.).

**Solution:**
- Added `notifyTargets` config map for per-agent routing: `{ "main": "telegram:...", "scribe": "telegram:..." }`
- Added `agentId` field to peer storage and federation context
- Hook payload now includes `agentId`, `peerId`, `intent`, `topic` for proper routing
- Updated setup wizard to ask which agent owns the gateway
- OpenClaw now routes notifications to the correct agent based on binding config

### BUILD-114: Peer Aliases (petname → alias)

**Problem:** "petname" terminology was confusing and inconsistent with cryptographic identity.

**Solution:**
- Renamed `petname` to `alias` across the entire codebase
- Auto-migration: existing `petname` configs migrate to `alias` on daemon start
- CLI now uses `--alias` flag (`--petname` deprecated but still works)
- `ogp federation list` shows ALIAS column alongside public key
- New `ogp federation status` shows alias → public key mappings

### BUILD-113: Asymmetric Federation Removal

**Problem:** When one peer removed federation, the other side stayed in "approved" state indefinitely, causing confusion and preventing re-federation.

**Solution:**
- Added `/federation/removed` endpoint for tear-down notifications
- When `ogp federation remove` is called, notifies peer with signed removal message
- Receiving peer updates status to "removed" and notifies user
- Full protocol documentation in PROTOCOL.md

---

## 0.2.28 (2026-04-01)

### BUILD-113: Asymmetric Federation Removal Notifications

- `/federation/removed` endpoint now triggers OpenClaw notification when a peer removes your gateway
- User is notified via their agent session with peer details
- Notification includes: peer display name, ID, timestamp, and removal type
- Uses best-effort delivery (no retry) since removal is already processed

---

## 0.2.27 (2026-04-01)

### Critical Fix: Peer ID Normalization (BUILD-111)

**Problem:** When receiving federation requests, the daemon was storing peers using whatever ID the sender provided in `peer.id`. This caused inconsistencies when senders used old `hostname:port` format while receivers expected `public-key-prefix` format.

**Solution:** 
- Peer ID is now **always derived** from `publicKey.substring(0,16)`
- The `peer.id` field from senders is **completely ignored**
- Added check for existing peers by derived public-key-id
- New response: `already-pending-or-approved` if peer already exists

**Impact:** Federation now works correctly regardless of what peer ID format the sender uses. The public key is the single source of truth for identity.

---

## 0.2.26 (2026-04-01)

### Critical Fix: Federation Request Persistence

**Problem:** The `federation/request` endpoint was creating peer objects and returning HTTP 200, but never actually persisting them to disk. This caused requests to appear successful while leaving `peers.json` empty.

**Solution:** Added `addPeer(peerData)` call after peer creation.

---

## 0.2.25 (2026-04-01)

### BUILD-111: Port-Agnostic Peer Identity

- Peer ID changed from `hostname:port` to `publicKey.substring(0,16)`
- Makes identity stable across tunnel URL changes
- Gateway URL is for routing only; public key is the identity

### BUILD-110: Intent Negotiation

- Federation requests include `offeredIntents`
- Approval automatically mirrors those intents back
- Symmetric federation by default

---

## Earlier Versions

See [GitHub releases](https://github.com/dp-pcs/ogp/releases) for full history.
