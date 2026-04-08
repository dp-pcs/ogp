# Changelog

## 0.3.4 (2026-04-08)

### Fixed
- **CRITICAL**: Fixed keychain service name collision causing multiple OGP instances to share the same private key
  - Each instance now uses a unique keychain service name: `ogp-federation-${hash(configDir)}`
  - Added migration logic to automatically move keys from shared keychain to instance-specific keychain
  - **Impact**: Resolves 401 Unauthorized errors when multiple instances (e.g., default + Hermes) try to federate
  - **Root Cause**: All instances used hardcoded `ogp-federation` keychain service, so Hermes instance was signing with Junior's private key
- **CRITICAL**: Fixed peer ID format inconsistency in agent-comms messages (16-char → 32-char)
  - Updated all `ourId` assignments to use `publicKey.substring(0, 32)` instead of `substring(0, 16)`
  - **Impact**: Prevents duplicate peer entries (BUG-6) and ID mismatches
  - **Locations fixed**: `federationSendAgentComms()`, `federationSend()`, `federationRequest()`
  - Aligns with v0.3.0 fix (commit d695fe1) that increased peer ID prefix to avoid Ed25519 DER header collision

### Changed
- Keychain service name now includes config directory MD5 hash for multi-instance isolation
- All outbound federation messages now use 32-char peer IDs consistently

## 0.3.3 (2026-04-07)

### BUG-1: Fix 401 Unauthorized on Agent-Comms Send

**Problem:** `ogp federation agent <peer> <topic> <message>` returned `401 Unauthorized` even when federation was approved and scopes were granted.

**Root Cause:** `federationSendAgentComms()` was not including `messageStr` (the raw JSON string used for signing) in the POST body. The receiving peer's signature verification used `JSON.stringify()` on the received payload, which could produce different key ordering than the original signed string, causing signature mismatch.

**Solution:**
- Updated `federationSendAgentComms()` to extract `payloadStr` from `signObject()` result
- Added `messageStr: payloadStr` to POST body (matching existing pattern in `federationSend()`)
- Now matches the working signature verification flow used by other intent types

**Impact:** Agent-comms messages now correctly verify on receiving peers. Bidirectional federation messaging works as intended.

### BUG-4: Alias Resolution for All CLI Commands

**Problem:** Using a peer alias (e.g., `ogp federation agent apollo general "test"`) failed with "Peer not found: apollo" even when alias was set during federation request.

**Root Cause:** CLI commands only looked up peers by ID or public key prefix. No alias-to-ID resolution existed.

**Solution:**
- Added `resolvePeerId(identifier)` helper function that tries:
  1. Exact ID or public key match via `getPeer()`
  2. Alias lookup via `peers.find(p => p.alias === identifier)`
- Applied to all CLI functions accepting peer identifiers:
  - `federationSend()`
  - `federationSendAgentComms()`
  - `federationShowScopes()`
  - `federationUpdateGrants()`
  - `federationApprove()`
  - `federationReject()`
  - `federationRemove()`

**Impact:** All federation CLI commands now support aliases, matching user expectations from `--alias` flag during `federation request`.

---

## 0.2.31 (2026-04-02)

### BUILD-117: CLI Uses Public Key ID Format for New Peers

**Problem:** When sending a federation request, the CLI created local peer entries with the old `hostname:port` ID format instead of the public key prefix format. This caused duplicate peer entries when the approval response used the new format.

**Solution:**
- Updated `federationRequest()` in `src/cli/federation.ts` to derive peer ID from `publicKey.substring(0, 16)`
- Falls back to `hostname:port` only if no public key is available (legacy compatibility)
- Ensures local peer ID matches the ID format used by the receiving peer

**Impact:** Eliminates duplicate peer entries with different ID formats. Federation requests now use consistent public-key-based identity across both sides.

---

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
