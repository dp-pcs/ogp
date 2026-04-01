# Changelog

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
