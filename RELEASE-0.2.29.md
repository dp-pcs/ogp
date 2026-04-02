# OGP 0.2.29 Release Notes

## Overview
This release includes three major builds (BUILD-113, BUILD-114, BUILD-115) that fix critical federation and notification issues.

## What's New

### BUILD-113: Asymmetric Federation Removal
- **Problem:** When one peer removed federation, the other side stayed in "approved" state indefinitely
- **Solution:** 
  - New `/federation/removed` endpoint for tear-down notifications
  - `ogp federation remove` now notifies peer with signed removal message
  - Receiving peer updates status to "removed" and notifies user
  - Full protocol documentation in PROTOCOL.md

### BUILD-114: Peer Aliases (petname → alias)
- **Problem:** "petname" terminology was confusing and inconsistent
- **Solution:**
  - Renamed `petname` to `alias` across entire codebase
  - Auto-migration: existing configs migrate on daemon start
  - CLI now uses `--alias` flag (`--petname` deprecated but works)
  - New `ogp federation status` shows alias → public key mappings
  - `ogp federation list` shows ALIAS column

### BUILD-115: Agent-Specific Notification Routing
- **Problem:** All notifications went to main agent, even when intended for others
- **Solution:**
  - New `notifyTargets` config: `{ "main": "telegram:...", "scribe": "telegram:..." }`
  - `agentId` field tracks which agent owns each federation
  - Hook payload includes `agentId`, `peerId`, `intent`, `topic`
  - Setup wizard asks which agent owns the gateway
  - OpenClaw routes to correct agent based on bindings

## Migration Guide

### For Existing Users
1. Update to OGP 0.2.29: `npm install -g @dp-pcs/ogp@0.2.29`
2. Restart daemon: `ogp daemon stop && ogp daemon start`
3. Existing `petname` configs auto-migrate to `alias`
4. (Optional) Add `notifyTargets` for multi-agent routing

### New Config Options
```json
{
  "notifyTargets": {
    "main": "telegram:123456789",
    "scribe": "telegram:987654321"
  },
  "agentId": "main"
}
```

## Testing Checklist
- [ ] Federation request/approve works
- [ ] `ogp federation list` shows aliases
- [ ] `ogp federation status` shows mappings
- [ ] Agent-comms notifications route to correct agent
- [ ] Asymmetric removal works (one side removes, other gets notified)

## Commits
- 14 subagent tasks
- 30+ commits
- Full backward compatibility maintained
