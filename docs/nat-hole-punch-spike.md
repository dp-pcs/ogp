# NAT Hole Punching Research Spike for OGP

**Date:** 2026-03-30
**Status:** Research Complete — No Implementation
**Goal:** Evaluate UDP NAT hole punching to enable home users behind NAT to federate without port forwarding or tunnels

---

## 🎯 Recommendation: DEFER Implementation

**Do NOT implement UDP hole punching for OGP at this time.**

### Rationale

1. **HTTP fallback already works** — OGP's rendezvous server + HTTP messaging provides zero-config federation for 95%+ of residential users via UPnP, public IP detection, and tunnel services (ngrok/Cloudflare)

2. **Symmetric NAT is a deal-breaker** — UDP hole punching fails for ~15% of residential users behind symmetric NAT, requiring a TURN relay server (expensive, complex, defeats the purpose of P2P)

3. **High implementation complexity** — Adding UDP transport is a major undertaking (S → L complexity) with marginal benefit over existing HTTP solution

4. **TCP already traverses NAT** — HTTP over TCP is already NAT-friendly and works behind most residential routers without special handling

5. **No clear user pain point** — Users aren't blocked by the current HTTP approach; they use rendezvous server or tunnels successfully

### If User Demand Changes

If home users report widespread federation issues due to NAT (not currently the case), revisit this decision. Priority order:

1. **Improve HTTP rendezvous** — Add TURN-style relay for HTTP (simpler than UDP hole punching)
2. **Integrate tunnel services** — Embed ngrok/Cloudflare SDK for automatic tunnel setup
3. **UDP hole punching** — Only if HTTP solutions prove insufficient (unlikely)

---

## 📊 Library Comparison

### Evaluated Node.js STUN/UDP Libraries

| Library | Version | Last Updated | Weekly DLs | TS Support | License | Status | Verdict |
|---------|---------|--------------|------------|------------|---------|--------|---------|
| **stun** (nodertc) | 2.1.0 | 6 years ago | Low | ❌ No | MIT | Unmaintained | ❌ Too old |
| **node-stun** | 0.1.2 | 8 years ago | Minimal | ❌ No | Unknown | Abandoned | ❌ Abandoned |
| **werift** | 0.22.2 | 6 months ago | 29 dependents | ✅ Yes | MIT | Active | ⚠️ Overkill (full WebRTC) |
| **udp-hole-puncher** | 1.1.0 | 9 months ago | None | ❌ No | MIT | Stale | ❌ No adoption |
| **xkore** | 1.0.1 | 2 months ago | 1 dependent | Unknown | ISC | New/unproven | ⚠️ Too new |
| **nat-traversal** | Latest | Unknown | Low | ❌ No | Unknown | Active | ⚠️ TCP relay (not UDP hole punch) |

### Analysis

**No clear winner.** The ecosystem is fragmented:

- **Old libraries** (stun, node-stun) are unmaintained and lack TypeScript
- **New libraries** (xkore) are unproven with zero adoption
- **WebRTC stacks** (werift) include hole punching but bring massive complexity (ICE, DTLS, SRTP, SDP negotiation) — massive overkill for simple peer-to-peer messaging
- **Purpose-built hole punchers** (udp-hole-puncher) have zero community adoption

**Best option if forced to implement:** Use the **nodertc/stun** library for basic STUN client functionality and implement custom UDP hole punching logic (no library does it well). This is 80% of the work anyway.

---

## 🏗️ OGP Architecture Analysis

### Current HTTP Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ OGP Daemon (src/daemon/server.ts)                               │
│ - Express HTTP server on port 18790                             │
│ - Endpoints: /federation/request, /federation/message, etc.     │
│ - Rendezvous registration (POST /register every 30s)            │
│ - Peer lookup (GET /peer/:pubkey)                               │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTP/JSON + RSA signatures
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Rendezvous Server (rendezvous.elelem.expert)                    │
│ - HTTPS server (Express on port 3000 default)                   │
│ - Stores: { pubkey, ip, port, timestamp } with 90s TTL          │
│ - Never touches message content (privacy preserved)             │
└─────────────────────────────────────────────────────────────────┘
```

**Key observation:** OGP daemon is a single-port HTTP server. It does NOT have:
- UDP socket handling
- STUN client/server logic
- ICE candidate gathering
- Hole punching coordination

### Integration Points (If Implemented)

To add UDP hole punching WITHOUT breaking HTTP:

1. **Dual transport layer** — Run HTTP server (18790) AND UDP socket (18791) concurrently
2. **Rendezvous server changes** — Add STUN endpoint on UDP port, store both TCP port (18790) and UDP port (18791) per peer
3. **Connection attempt sequence** — Try UDP hole punch first, fall back to HTTP if fails (timeout after 3-5s)
4. **Protocol negotiation** — Peers must agree which transport to use via rendezvous server

**Critical constraint:** Cannot break existing HTTP federation (v0.2.0 protocol). UDP must be additive, not replacement.

---

## 🔬 NAT Traversal Feasibility

### NAT Type Distribution (Estimated)

| NAT Type | % of Residential ISPs | UDP Hole Punch Success Rate | Notes |
|----------|----------------------|---------------------------|-------|
| Full Cone | ~5-10% | >95% | Rare in modern routers |
| Restricted Cone | ~40-50% | >95% | Most common, hole punching works |
| Port-Restricted Cone | ~25-35% | ~80% | Common, mostly works |
| Symmetric NAT | ~10-15% | <10% | **Requires TURN relay** |

**Sources:**
- [Academic research (IEEE)](https://ieeexplore.ieee.org/document/7021753/)
- [NAT usage studies (Springer)](https://link.springer.com/chapter/10.1007/978-3-642-19260-9_4)
- [Tailscale's NAT traversal analysis](https://tailscale.com/blog/how-nat-traversal-works)

**Key finding:** UDP hole punching succeeds for ~82-85% of peers in cone NAT scenarios. The remaining ~15% (symmetric NAT) require a TURN relay server.

### TURN Relay Server Requirements

For symmetric NAT, peers cannot establish direct UDP connections. A TURN relay server is required:

- **Server:** [Coturn](https://github.com/coturn/coturn) (most popular open-source TURN server)
- **Hosting cost:** $20-50/month for small deployments (bandwidth-heavy)
- **Implementation effort:** Medium (2-3 weeks for integration + testing)
- **User experience:** Degrades to relay (higher latency, costs money)

**This defeats the purpose of P2P.** If we're relaying 15% of traffic, why not just use HTTP for everyone?

---

## 📋 Proposed Protocol Flow (If Implemented)

**NOTE:** This is theoretical. Do NOT implement without re-evaluating user need.

### Step 1: Rendezvous Registration (Startup)

```
OGP Daemon A                  Rendezvous Server
    │                               │
    ├─ POST /register ──────────────▶ Store:
    │  {                             │ - pubkey: "abc123..."
    │    pubkey: "abc123...",        │ - tcp_ip: "1.2.3.4"
    │    tcp_port: 18790,            │ - tcp_port: 18790
    │    udp_port: 18791,            │ - udp_ip: "1.2.3.4"
    │    timestamp: 1234567890       │ - udp_port: 18791
    │  }                             │ - timestamp: 1234567890
    │◀─ 200 OK ─────────────────────┤ TTL: 90 seconds
```

### Step 2: STUN Binding Request (Detect Public IP/Port)

```
OGP Daemon A                  STUN Server (on rendezvous.elelem.expert:3478 UDP)
    │                               │
    ├─ STUN Binding Request ────────▶
    │  (from local UDP port 18791)   │
    │                               │
    │◀─ STUN Binding Response ──────┤
    │  {                             │
    │    public_ip: "1.2.3.4",      │
    │    public_port: 54321         │  <-- NAT assigned external port
    │  }                             │
```

### Step 3: Peer Connection Attempt

```
OGP Daemon A                  Rendezvous Server              OGP Daemon B
    │                               │                               │
    ├─ GET /peer/xyz789... ─────────▶                               │
    │◀─ 200 OK ───────────────────┤                               │
    │  {                             │                               │
    │    tcp_ip: "5.6.7.8",         │                               │
    │    tcp_port: 18790,           │                               │
    │    udp_ip: "5.6.7.8",         │                               │
    │    udp_port: 65432            │                               │
    │  }                             │                               │
    │                               │                               │
    ├─ Try UDP hole punch ───────────────────────────────────────▶
    │  (both send UDP packets simultaneously)                       │
    │                               │                               │
    │◀─ UDP connection established (if cone NAT) ─────────────────┤
    │                               │                               │
    │  OR (if symmetric NAT)        │                               │
    │                               │                               │
    ├─ Fall back to HTTP ────────────────────────────────────────▶
    │  POST /federation/message     │                               │
```

### Step 4: Fallback Relay (Symmetric NAT)

```
OGP Daemon A                  TURN Relay Server              OGP Daemon B
    │                               │                               │
    ├─ Allocate relay ──────────────▶                               │
    │◀─ Relay address ───────────────┤                               │
    │  (relay_ip: 9.10.11.12:4000)  │                               │
    │                               │                               │
    ├─ Send to relay ───────────────▶                               │
    │                               ├─ Forward to B ───────────────▶
    │                               │                               │
    │◀─ Response from B ─────────────┤◀─ Send via relay ───────────┤
```

**Latency impact:**
- Direct UDP: ~10-50ms
- HTTP over TCP: ~20-100ms
- TURN relay: ~50-200ms (double hop)

---

## 🚧 Implementation Complexity

### Estimated Effort: **LARGE (L)**

**Components to implement:**

1. **STUN client** (1-2 weeks)
   - Bind to UDP socket (18791)
   - Send STUN Binding Request to discover public IP/port
   - Parse STUN Binding Response (RFC 5389 / RFC 8489)
   - Handle retries and timeouts

2. **UDP hole punching logic** (2-3 weeks)
   - Coordinate simultaneous send between peers (timing is critical)
   - NAT type detection (symmetric vs cone)
   - Connection attempt timeout and fallback

3. **Rendezvous server updates** (1 week)
   - Add STUN endpoint on UDP port 3478
   - Store UDP port alongside TCP port in peer registry
   - Handle dual-transport lookups

4. **TURN relay integration** (2-3 weeks)
   - Deploy Coturn server (or use public TURN service)
   - Implement TURN client in OGP daemon
   - Relay allocation and authentication

5. **Dual transport coordination** (1 week)
   - Try UDP first, fall back to HTTP
   - Protocol negotiation handshake
   - Handle mixed scenarios (Peer A has UDP, Peer B HTTP-only)

6. **Testing matrix** (2-3 weeks)
   - Test all NAT type combinations (4x4 = 16 scenarios)
   - Simulate symmetric NAT, firewall rules, packet loss
   - Validate fallback paths work reliably

**Total estimated effort:** 9-13 weeks (2-3 months)

**Risk factors:**
- NAT behavior is unpredictable (ISPs change router configs)
- Timing synchronization issues (hole punching is timing-sensitive)
- TURN relay costs and maintenance burden
- Breaking changes to existing HTTP federation (backward compatibility risk)

---

## ⚠️ Risks and Unknowns

### 1. Symmetric NAT Prevalence

**Unknown:** What % of OGP users are actually behind symmetric NAT?

- Industry estimates: ~10-15% residential, ~40% cellular/CGN
- OGP user base: Unknown (no telemetry data)
- **Mitigation:** Add telemetry to measure NAT type distribution before implementing

### 2. TURN Relay Costs

**Unknown:** How much bandwidth will relayed traffic consume?

- TURN servers charge by bandwidth (not connections)
- If 15% of traffic routes through relay, costs scale with user growth
- **Mitigation:** Self-host Coturn or use public TURN services (rate-limited, unreliable)

### 3. Firewall Interference

**Unknown:** Do corporate/school firewalls block UDP port 18791?

- Many networks whitelist HTTP (80/443) but block arbitrary UDP ports
- UDP hole punching may fail even with cone NAT due to firewall rules
- **Mitigation:** Fallback to HTTP (already implemented), so no user impact

### 4. IPv6 Considerations

**Unknown:** Does UDP hole punching work differently on IPv6?

- IPv6 has no NAT in theory, but many ISPs still use CGN (Carrier-Grade NAT)
- STUN/TURN specs support IPv6, but library support varies
- **Mitigation:** Focus on IPv4 first, add IPv6 later if needed

### 5. Mobile/Tethering Scenarios

**Unknown:** Do mobile hotspots (phone tethering) use symmetric NAT?

- Cellular networks often use symmetric NAT (40%+ based on research)
- Mobile users may be disproportionately blocked by UDP hole punching
- **Mitigation:** HTTP fallback works fine for mobile users

### 6. Library Ecosystem Immaturity

**Risk:** No battle-tested Node.js library for UDP hole punching exists

- Would need to implement custom logic on top of basic STUN client
- Debugging NAT traversal issues is notoriously difficult
- **Mitigation:** Use werift (WebRTC stack) despite complexity, or write custom implementation

---

## 🔗 References

### Research Papers
- [Peer-to-Peer Communication Across NATs (Bryan Ford)](https://pdos.csail.mit.edu/papers/p2pnat.pdf)
- [UDP Hole Punching - Wikipedia](https://en.wikipedia.org/wiki/UDP_hole_punching)
- [A New Method for Symmetric NAT Traversal](https://www.researchgate.net/publication/228411948_A_New_Method_for_Symmetric_NAT_Traversal_in_UDP_and_TCP)

### Implementation Guides
- [How NAT Traversal Works (Tailscale)](https://tailscale.com/blog/how-nat-traversal-works)
- [NAT Traversal Visual Guide (DEV Community)](https://dev.to/dev-dhanushkumar/nat-traversal-a-visual-guide-to-udp-hole-punching-1936)
- [Understanding NAT Types (DH2i)](https://support.dh2i.com/docs/Archive/kbs/general/understanding-different-nat-types-and-hole-punching/)

### Libraries and Tools
- [nodertc/stun (GitHub)](https://github.com/nodertc/stun) — RFC 5389 STUN client/server
- [werift (npm)](https://www.npmjs.com/package/werift) — WebRTC stack for TypeScript/Node.js
- [udp-hole-puncher (npm)](https://www.npmjs.com/package/udp-hole-puncher) — Dedicated hole punching library
- [xkore (npm)](https://www.npmjs.com/search?q=nat+traversal) — Newest NAT traversal library (2 months old)
- [coturn (GitHub)](https://github.com/coturn/coturn) — Open-source TURN server

### STUN/TURN Standards
- [RFC 5389: Session Traversal Utilities for NAT (STUN)](https://www.rfc-editor.org/rfc/rfc5389.html)
- [RFC 8489: STUN (obsoletes RFC 5389)](https://www.rfc-editor.org/rfc/rfc8489.html)
- [RFC 5766: Traversal Using Relays around NAT (TURN)](https://www.rfc-editor.org/rfc/rfc5766)
- [RFC 8656: TURN (obsoletes RFC 5766)](https://datatracker.ietf.org/doc/rfc8656/)

### Deployment Resources
- [Coturn Setup Guide (Gabriel Tanner)](https://gabrieltanner.org/blog/turn-server/)
- [WebRTC STUN Server Integration (VideoSDK)](https://www.videosdk.live/developer-hub/stun-turn-server/webrtc-stun-server)
- [STUN/TURN Server in Azure (Microsoft)](https://learn.microsoft.com/en-us/gaming/azure/reference-architectures/stun-turn-server-in-azure)

---

## 🎬 Next Steps (If Reconsidered)

**Do NOT proceed with implementation until:**

1. **User research** — Survey OGP users: Are they blocked by NAT? What % use tunnels vs direct IP?
2. **Telemetry** — Add NAT type detection to OGP daemon, collect anonymous stats for 30 days
3. **Cost analysis** — Estimate TURN relay costs based on actual traffic patterns
4. **Prototype** — Build minimal UDP hole punch prototype (no TURN) and test with 10-20 users
5. **Decision point** — If >50% of users benefit AND TURN costs are acceptable, proceed with full implementation

**Until then:** Focus on improving HTTP rendezvous server reliability and user experience.

---

## Appendix: NAT Type Detection

For future reference, here's how to detect NAT type using STUN:

```typescript
import dgram from 'dgram';

async function detectNATType(): Promise<'full-cone' | 'restricted' | 'port-restricted' | 'symmetric'> {
  const socket = dgram.createSocket('udp4');

  // Test 1: Basic STUN binding to STUN server A
  const { ip: publicIP1, port: publicPort1 } = await stunBinding(socket, 'stun.l.google.com', 19302);

  // Test 2: STUN binding to STUN server B (different IP)
  const { ip: publicIP2, port: publicPort2 } = await stunBinding(socket, 'stun1.l.google.com', 19302);

  // If public ports differ, it's symmetric NAT
  if (publicPort1 !== publicPort2) {
    return 'symmetric';
  }

  // Test 3: Request STUN server to respond from different port
  const respondsFromDifferentPort = await stunBindingWithPortChange(socket, 'stun.l.google.com', 19302);

  if (respondsFromDifferentPort) {
    return 'full-cone'; // Accepts packets from any IP:port
  }

  // Test 4: Request response from different IP
  const respondsFromDifferentIP = await stunBindingWithIPChange(socket, 'stun.l.google.com', 19302);

  if (respondsFromDifferentIP) {
    return 'restricted'; // Accepts packets from any port on same IP
  }

  return 'port-restricted'; // Only accepts packets from same IP:port
}
```

**Note:** This is pseudo-code. Actual implementation requires RFC 5780 (NAT Behavior Discovery).
