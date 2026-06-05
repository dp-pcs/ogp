# Journey Into OGP

*A technical history of the Open Gateway Protocol, March 19 through April 27, 2026*

---

## 1. Project Genesis

OGP was born in a single afternoon. On **March 19, 2026 at 12:32 PM** (#17480), David Proctor scaffolded what would become `@dp-pcs/ogp` — a peer-to-peer federation daemon for AI gateways. By 12:38 PM, six minutes into the project's existence, twenty-five observations had been recorded covering everything from the npm package manifest (#17483) through TypeScript ES2022 strict mode configuration (#17485), `~/.ogp/config.json` (#17487), and Ed25519 cryptographic signing using Node's native `crypto` API (#17488). By 12:38 PM the git repository was initialized (#17506), a `.gitignore` was added (#17507), and the entire scaffold was committed (#17508).

Read that timestamp again: **six minutes from "I should write a federation daemon" to "the package skeleton is committed."** That is unusual velocity even for a hot start, and it is foundational to understanding the rest of the project's history. Decisions made in those six minutes — Ed25519 (not RSA, not ECDSA P-256), Node's built-in `crypto` (not `tweetnacl`, not `libsodium`), `~/.ogp/` for state, Express for the federation HTTP surface, hex-encoded keys in JSON files — would persist through every subsequent version. Some of those choices were excellent. Some of them, like the unverified-signature handshake we will cover in the technical-debt section, lived for thirty-nine days before someone noticed they were a security hole.

The motivating problem, articulated more formally during the patent disclosure work in early April (#22335, #22339), was specific: AI agents running in different gateways — David's OpenClaw instance, Stanislav's OpenClaw instance, eventually Hermes — needed to talk to each other without either side having to surrender raw conversation context, raw model access, or raw user data. Existing federation patterns assumed homogeneous infrastructure (one platform, one provider, one trust root). OGP started from the assumption of heterogeneity: BGP-style peering between independent gateways, where each peer is its own administrative domain, and trust is negotiated bilaterally rather than inherited from a central authority.

The Mar 19 scaffold contained the core pieces: a federation message handler with signature verification (#17493), the Express HTTP server with federation endpoints (#17494), an interactive setup wizard (#17496), federation management CLI commands (#17497), a tunnel-expose command for public reachability (#17498), and an intent registry (#17491) — the abstraction that would later carry agent-comms, project contributions, and resync offers. The architectural seed was already complete; everything that followed was elaboration.

## 2. Architectural Evolution

OGP went through six distinct architectural eras in 5.5 weeks. Each one was driven by a specific friction the previous version exposed.

**v0.1 to v0.2.0: Scope Negotiation (Mar 23).** The first version's `approve` flow was binary: peer is approved or not, and approved peers can do anything any intent supports. Within four days the BGP-inspired insight had landed (#17784, #17776) — peers should negotiate per-relationship *scopes* the way BGP routers negotiate route advertisements. By Mar 23 at 10:23 AM (#17822), v0.2.0 was live with a three-layer scope model (#22326), a doorman runtime enforcement module (#22322), sliding-window rate limiting (#22336), an `agent-comms` intent for free-form A2A messaging (#17826), and a reply handler for callback-shaped responses (#17829). A scope-resolution prioritization bug surfaced almost immediately (#17948 at 11:49 AM, eight hours after launch) and was fixed the same day. This established a pattern: ship fast, debug fast, document after.

**v0.2.0 to v0.2.3 to v0.2.9: Refinement (Mar 24-26).** The agent-comms architecture sprouted *response policies* (#17975) — three-level controls (`full` / `summary` / `off`) per peer per topic, with a `default-deny` `off` policy that returned signed rejections (#20913). Project collaboration became its own intent: contributions, queries, project membership, with auto-registration on federation approval (#17904, #20754, #20759). The CLI refactored "topic" into "entry type" (#20924). By v0.2.9 the project had grown a real surface area, but the core invariant held: every wire message was Ed25519-signed against a per-peer public key, and `doorman` was the single chokepoint for authorization.

**v0.2.10 to v0.2.17: Rendezvous + Public URLs (Mar 26-30).** A practical problem: NAT. Two agents behind home routers could not reach each other directly. Mar 30 introduced an HTTP-based rendezvous server (#21556) with `OGP_PUBLIC_URL` environment override (#21524), invite codes, TTL management (#21528), and automatic registration via heartbeat. A research spike on UDP hole-punching (#21557, #21558, #21563) explored real STUN/TURN/ICE — and was deliberately deferred. The conclusion (#21563): UDP NAT traversal success rates are too sensitive to NAT type to be a baseline assumption; HTTP-via-Cloudflare-tunnel is boring but works. That decision shaped the next month's deployment story.

**v0.3.x: Hermes, Multi-Backend Notifications, Multi-Instance Identity (Apr 3-7).** Apr 3-4 brought the integration question: OGP is "for OpenClaw" — but what about Hermes, the Python-based gateway from a sister project? The architectural answer (#22853): refactor the notification layer into a *backend interface* (#22878, #22886) with OpenClaw and Hermes implementations, leaving the wire protocol identical. Two daemons, two state directories (`~/.ogp` for OpenClaw, `~/.ogp-hermes` for Hermes), one binary. This worked, but it surfaced the infamous keychain collision: both daemons used the same `service` name in macOS Keychain, so whichever wrote last won. The fix (#24358 at 5:57 AM Apr 8) namespaced the keychain entry per instance. The same day a 16-character-vs-32-character peer-ID mismatch (#24386) caused signature verification to silently fail — a particularly nasty bug because the daemon happily accepted half the peer ID and then could not find the public key.

**v0.4.0 to v0.4.4: Multi-Framework `--for` (Apr 8-18).** The two-daemon-two-config story was flexible but operationally horrible. Switching frameworks meant exporting `OGP_HOME`. The Apr 8 redesign (#24430, #24447) introduced a meta-config at `~/.ogp-meta/` with a `frameworks` array, framework auto-detection (#24542), legacy migration logic (#24546), and the global `--for <framework>` flag with `--for all` for fan-out commands. Tab completion (#24710, #24732), Cisco-IOS-style `?` contextual help (#24713, #32078), peer heartbeat health monitoring (#31610), and federation resync (#31804) all landed in this era. v0.4.3 fixed a gateway-URL normalization bug and a missing `replyTo` callback in the Hermes notification backend (#31796). v0.4.4 shipped federation resync (#31842) — letting a peer who lost their keypair re-establish via signed snapshot rather than full re-approval.

**v0.5.0 to v0.6.0: Identity Split (Apr 20).** Until Apr 20 a peer was just a `displayName` and a public key. The user pushed back: when David's agent talks to Stephen's agent, the peer is *Stephen* (the human) running *Apollo* (his agent) at *Trilogy* (his org). One field cannot carry that. B0031 (#32744) split identity into `humanName`, `agentName`, `organization`, and tags, with an `update-identity` command (#33071) that propagates retroactively, and *identity snapshots* (#33090) attached to every project contribution so the historical record survives renames. Shipped as 0.5.0, then 0.6.0 the same day when the contribution-snapshot work made it feel like a minor-version-worthy release.

**v0.7.0-rc.1: The Security Era (Apr 27).** Detailed in sections 3 and 5.

## 3. Key Breakthroughs

A handful of "aha" moments compressed weeks of work each.

**Mar 23, 9:49 AM (#17777, #17778, #17784).** The BGP analogy. Up to that morning, federation had been a yes/no question. The realization that *peer relationships are routing protocols* — that scopes are advertised capabilities, that approval is route negotiation, that revocation is route withdrawal — gave the rest of v0.2.0 its shape. The decision (#17784) to use intent-based protocol architecture with per-peer scope negotiation is the single most consequential design choice after Ed25519 itself.

**Mar 23, 11:54 AM (#17964).** "Agent-Comms Messages Successfully Delivered to OpenClaw CLI." Eleven hours after the v0.2.0 plan was approved (#17812), a federated message routed from one daemon, through doorman, into the live OpenClaw agent context. This was the first end-to-end proof that the architecture did what it claimed.

**Apr 3, 7:26 AM (#22337).** Patent analysis identified ten technical innovations in the codebase. This was less a breakthrough than a recognition: the work had outgrown "scratch project." The next week was spent generating a full disclosure (#22366, #22387 through #22441). That exercise forced the team to name what was actually novel — *gateway-mediated agent federation with three-layer scope isolation and cryptographic intent binding* (#22361 through #22365) — which then sharpened the v0.3.x integration story.

**Apr 5, 8:05 AM (#23460).** "Hermes Gateway Successfully Received and Processed OGP Webhook Request." OGP became platform-agnostic in fact, not just in design. From that morning forward the project had two living deployments to test against, which is what surfaced every multi-instance bug in the next forty-eight hours.

**Apr 8, 12:13 PM (#25422, #25431).** "Fixed Phantom Message Issue by Switching from /hooks/agent to /hooks/wake." This is covered in detail in section 6, but the breakthrough moment was the realization that the entire WebSocket-bridge approach (#25145, #25150) — three days and several hundred lines of code — was the wrong layer. The right answer was a one-line endpoint change. The bridge code was kept as fallback but the architectural lesson was: when you find yourself reverse-engineering an internal RPC schema, you have probably missed the public webhook.

**Apr 20, 11:34 AM (S2616, #32739).** Identity-split. The trigger was a casual user observation that "type: work / personal" would not carry enough information. The reframe — that humans and agents are not the same thing, and conflating them in `displayName` was a category error — produced a clean redesign in three hours and shipped that afternoon.

**Apr 27, 7:50 AM (#35622).** The security audit. After fact-checking a Substack article triggered a deeper read of `server.ts`, the agent (running with `superpowers:security-best-practices`) catalogued **eleven** findings. The audit itself was not novel work — Ed25519 verification was already correct on `/federation/message` — but it surfaced that *handshake* endpoints (`/federation/request`, `/federation/approve`, `/federation/reply`) had been accepting unsigned payloads since Mar 19. More on this below.

## 4. Work Patterns

The 5.5-week timeline divides cleanly into three rhythms.

**Burst-feature days.** Mar 19 (25 obs in six minutes), Mar 23 (262 obs across the v0.2.0 scope-negotiation sprint), Apr 5 (354 obs as Hermes integration came together), Apr 8 (782 observations — the largest day in the project's history, covering BUG-2 phantom messages, multi-framework `--for`, sessions.send RPC migration, and v0.4.1 release). These days share a profile: a clear architectural target, fast iterate-build-test cycles, and aggressive use of subagents for parallel work. On Apr 8 (#24544 through #24547) three separate subagent tasks completed in parallel for the meta-config / framework-detection / migration-logic refactor.

**Debugging cycles.** Mar 26 had 148 obs almost entirely focused on a single problem: OpenClaw gateway crashes due to API key configuration in plist files (#21034 through #21053). Apr 7 (10:40 PM, #24124 through #24148) was an overnight crash-loop investigation that produced the meta-published case study "AI Tools Meta-Debugging" (#24189). Apr 16 (365 obs) was a marathon of Portkey API authentication failures in Hermes — a saga that revealed how much OGP's daily usability was bottlenecked by the underlying gateways' provider configuration, not OGP's own code.

**Refactoring + cleanup phases.** Apr 15 (#29787 through #29882) was a quiet day spent on the `youragent` scaffold, BEADS task ledger, and protocol-version messaging cleanup (B0027, #29881). Apr 22 (55 obs) was pattern absorption from `PATTERNS_CATALOG.md`. Apr 27 — the heaviest week in raw token spend — was almost entirely security work, with about 12 hours of sustained activity from 7:43 AM through 4:30 PM.

**Exploration phases.** Apr 3 (157 obs) — the patent-disclosure deep dive — was exploratory in a different mode: not building, but *describing* what had been built. The same is true of Apr 27's article fact-checks (#35614, #35615, #35617): the project paused to verify its own narrative against ground truth.

A pattern across all of these: **the work was almost always solo, but rarely lonely.** The federation peers (Junior, Apollo, Stanislav, Stephen) provided continuous live test partners. Many observations describe message handoffs to other gateways for collaborative debugging — federation as both product and tooling.

## 5. Technical Debt

The honest list.

**The unverified-signature handshake (Mar 19 to Apr 27, F-01 / F-04).** From the very first scaffold (#17493, #17494), the federation HTTP server had this shape: `/federation/request` and `/federation/approve` accepted JSON bodies containing `fromPublicKey`, `fromGatewayUrl`, and other identity fields, but the bodies themselves were not signed. Only `/federation/message` (the steady-state messaging endpoint) verified signatures. This meant any attacker who learned of a pending federation request could race the legitimate peer, send a forged `approve` payload with their own public key, and the daemon would happily replace the peer record — every subsequent message from the attacker would then pass signature verification because it was being verified against the attacker's own key. The audit (#35622, #35631) found this on Apr 27. **Thirty-nine days of exposure on a security-critical code path.** The fix (PR #14, #35654, #35655) replaced the bare-JSON pattern with `signCanonical()` / `verifyCanonical()` helpers and 5-minute timestamp freshness windows, modeled on `/federation/removed` which had implemented the correct pattern (apparently from intuition rather than design, since the bug existed everywhere else).

**F-05 cross-process nonce tracker (introduced and reverted in PR #14).** While implementing F-05 reply authentication, the initial PR1 design (#35643) used an in-memory `Map<nonce, peerId>` to bind each outbound nonce to its destination, then verify replies against that specific peer's public key. The bug: the *CLI* process generates nonces when sending messages, but the *daemon* process receives the replies. The Map lived in whichever process happened to import the module, and the two processes do not share memory. The simplification — accept signatures from any approved peer that successfully verifies — was committed as **638b4de** within the same PR. The trade-off (#35643): a malicious approved peer who somehow learns a nonce could poison a reply slot, but nonces are random UUIDs known only to the destination peer, so the attack requires an existing trust violation. Net assessment: the simpler design was both more correct and more secure than the original.

**F-07 keychain shell-string subprocess (already fixed before the audit named it).** The audit found a class of vulnerability in `src/daemon/keypair.ts`: `execSync('security add-generic-password ' + interpolatedArgs)` would shell-injection if any argument became user-influenced. By the time the audit was written, commit `fabede0` (#35632) had already replaced all five `execSync` calls with `execFileSync('security', [args...])` — argv form, OS quoting, no shell. The audit report was kept honest: F-07 was documented as the vulnerability pattern with a note that current code already implements the recommended fix. This is the cleanest possible technical-debt outcome: defense-in-depth applied before exploitation, then surfaced for review.

**Multi-instance keychain collision (Mar 19 to Apr 8).** As section 2 mentioned, the original `keypair.ts` used a static `service` name in macOS Keychain. When Hermes integration created a second `~/.ogp-hermes/` instance, the two daemons fought over the same keychain entry. Whichever wrote last owned the slot. This caused the multi-hour signature-verification debugging on Apr 8 (#24310 through #24358) — symptom: `401 Unauthorized` on cross-daemon agent-comms. Fix: per-instance keychain service names + migration logic (#24361). Lesson: assumptions about singletonness in `~/.config`-style state directories do not survive contact with multi-instance reality.

**Peer-ID truncation inconsistency (Apr 8, #24321 through #24400).** Different code paths used different lengths of the public-key hex prefix as the "peer ID" — some 16 chars, some 32, some full 64. When two daemons disagreed on the truncation, peer lookups failed silently. Fix: standardize on 32 chars everywhere (#24386, #24391). This is the kind of bug that only manifests at federation scale — within a single daemon, all the truncations were self-consistent.

**Phantom messages (BUG-2, Apr 8 to Apr 8).** The full-day saga in section 6.

**Documentation drift.** The CHANGELOG.md most recent entry on Apr 27 was v0.4.2 from Apr 9 (#35651). Versions 0.4.3, 0.4.4, 0.5.0, and 0.6.0 had shipped without changelog entries. Caught and partially repaired during the v0.7.0-rc.1 prep.

## 6. Challenges and Debugging Sagas

**The BUG-2 Phantom Messages saga (Apr 8, ~9 hours).** This is the longest single-day debugging arc in the project's history. The symptom: federation messages arrived at the receiving OpenClaw daemon, returned 200 OK, showed up in Telegram — but the agent never saw them. They lived as ghosts in the gateway's session store, addressed to no conversation queue.

The investigation crossed four architectural layers across roughly 50 distinct attempts:

1. **First hypothesis: notification routing.** Maybe `notify.ts`'s session-key was wrong (#24875, #24887). Updated webhook config to agent-specific session keys. Restart. Test. Still phantom.
2. **Second hypothesis: WebSocket bridge.** Inspect OpenClaw's gateway RPC schema (#25097, #25098) and inject messages directly via WebSocket (#25136, #25138, #25145, #25150). Wrote a full bridge module with reconnection logic, lifecycle integration, graceful shutdown. Built the daemon. Still phantom — the bridge connected, but the OpenClaw RPC did not actually have a "deliver this to the agent's queue" verb that the bridge could call.
3. **Third hypothesis: `sessions.send` RPC.** Discovered via a March 26 commit (#25101) that there had been a working notification path using a `sessions_send` tool. Migrated bridge to that RPC (#25260). Test. JSON escaping bug. Fix. Test. Schema validation failure (#25251). Different tool now? Discovery: that tool no longer exists in current OpenClaw (#24924).
4. **Fourth hypothesis: a different webhook.** Reviewing the OpenClaw CLI documentation revealed `/hooks/wake` (#24875, #25420) — an endpoint distinct from `/hooks/agent` that *did* inject messages into the conversation queue. One-line change in `openclaw-bridge.ts` (#25422). Test. Worked.

The total resolution: switching from `/hooks/agent` to `/hooks/wake`. The total work to find that fix: ~782 observations across the day. **The right answer was simpler than the wrong answers**, which is the canonical shape of webhook-architecture debugging. Memorialized in the v0.4.1 CHANGELOG as a "partial fix" because the sender-identity preservation worked but the round-trip-reply path still had open questions (#25411).

**The OpenClaw crash-loop saga (Apr 7, ~6 hours overnight).** Not OGP's fault, but inseparable from OGP's history because OpenClaw is what OGP federates *to*. The gateway crashed, restarted via launchd, crashed again. Root cause(s): V8 OOM from browser-automation load (#24057), unhandled promise rejections in `pi-agent-core`'s `processEvents` handler (#24155), 128 cron jobs configured with null agent assignments (#24070, #24071). The fix: disable Brainlift plugin (#24124), disable all OpenClaw cron jobs (#24126), restart. The case study became a published Substack article (#24189) — "AI Tools Meta-Debugging While Working on OGP" — which is a perfect description of how much of the project's daily friction came from the surrounding ecosystem rather than OGP itself.

**The OpenClaw bridge refactor (Gateway RPC to /hooks/wake, Apr 8).** Captured in observation #25431 as a refactor: the WebSocket-RPC architecture was kept as code but de-emphasized in favor of HTTP webhook injection. This is a recurring OGP pattern — *prefer the documented public surface over the reverse-engineered internal one* — even when the internal one looks more powerful.

**The Federation State Machine work (Apr 18 to Apr 27).** Peer heartbeat health monitoring (#31610) introduced "health" as a first-class peer attribute. By Apr 27 the design had grown into an OSPF-inspired peer state machine (#34695) and bidirectional health status exchange (#34696). The audit's F-12 finding — that the `X-OGP-Peer-ID` header used by health-probe endpoints was unsigned — got rolled into PR #14 and fixed alongside the handshake work, so health probes now require a signed peer-id header.

**The Multi-framework demo issues (Apr 8-17).** Multi-framework support shipped on Apr 8 with all the right plumbing, but every restart for the next ten days surfaced edge cases: legacy directories that the migration script did not catch (#24749), config-file dynamic vs. static path resolution (#24739, #24741), shell completion not knowing about new subcommands (#32296), zsh fpath not picking up the completion install (#32311), and the eternal "stop command does not actually stop the daemon because the PID file lies" (#35645).

## 7. Memory and Continuity

`claude-mem` shaped the work in three ways.

**Recall-driven debugging.** The Apr 8 phantom-messages saga repeatedly invoked memory search to reconstruct what *used to work*. Observation #25100 ("OGP Notification System Evolution - Multiple Fix Attempts March 2026") explicitly retrieves the history of `notify.ts` to find a March 26 implementation that delivered messages successfully. #25111 ("March 26 Telegram Message Routing Method Confirmed Working") completes that trace. Without persistent memory, the developer would have had to re-derive every prior approach by reading git log.

**Cross-session bug context.** The keychain collision and peer-ID truncation bugs (#24310, #24358, #24386) were debugged over multiple sessions with overnight gaps. Each new session began by reading the prior session's observations, which is how the F-04 / F-01 debt was eventually surfaced — the audit (#35622) did a fresh read of `server.ts` against memory of how `/federation/removed` had been built and noticed the asymmetry.

**Article fact-checking (Apr 27 #35614, #35615).** The clearest illustration: Substack articles drafted on Apr 21 against v0.4.2 needed to be verified against v0.6.0 implementation six days later. Memory preserved the article's claim-by-claim assertions; current code provided ground truth; the diff produced a list of corrections (#35617, #35619, #35620, #35621). The same workflow on Apr 27 evening (#27553, #27557, #27558) surfaced six categories of technical errors and a framework-name confusion (Apollo-the-agent vs Hermes-the-platform) in article 04. None of those errors would have been caught without persistent memory connecting the article draft to the implementation timeline.

## 8. Token Economics & Memory ROI

**Aggregate numbers (SQL-derived, OGP project only).**

| Metric | Value |
|---|---|
| Total observations | 3,153 |
| Distinct memory sessions | 41 |
| Total discovery tokens | 8,841,805 |
| Avg discovery tokens per recorded obs | ~2,804 |
| Avg observation size (tokens, written) | ~349 |
| Date range | Mar 19, 2026 to Apr 27, 2026 (~40 days) |

**Top 5 most expensive observations.**

| ID | Title | Discovery tokens |
|---|---|---|
| 35678 | Rendezvous infrastructure to be migrated to dedicated production-labeled cluster | 128,088 |
| 35641 | Junior daemon baseline state verified before PR1 deployment | 106,709 |
| 25213 | OpenClaw Gateway Session Inventory Retrieved | 88,885 |
| 35615 | OGP Version Discrepancy Between Article 02 and Current Implementation | 61,720 |
| 35635 | PR sequencing strategy: land PR1 in isolation before PR4 for clean security audit trail | 58,044 |

Three of the top five are from Apr 27 — the security-audit + production-deploy day. #25213 is from the Apr 8 phantom-messages investigation, where the daemon retrieved 208 active OpenClaw sessions to figure out where the messages were going. These large discoveries are *load-bearing*: each one corresponds to an investigation that produced a persistent answer.

**Daily activity table.**

| Date | Obs | Sessions | Discovery tokens |
|---|---:|---:|---:|
| 2026-03-19 | 25 | 1 | 61,875 |
| 2026-03-20 | 36 | 2 | 91,327 |
| 2026-03-23 | 262 | 2 | 755,925 |
| 2026-03-25 | 36 | 1 | 199,756 |
| 2026-03-26 | 148 | 9 | 537,299 |
| 2026-03-30 | 56 | 5 | 216,258 |
| 2026-04-03 | 157 | 2 | 533,775 |
| 2026-04-04 | 96 | 2 | 304,560 |
| 2026-04-05 | 354 | 2 | 541,843 |
| 2026-04-06 | 16 | 1 | 32,870 |
| 2026-04-07 | 41 | 1 | 45,217 |
| 2026-04-08 | **782** | 5 | **1,700,775** |
| 2026-04-11 | 70 | 1 | 171,681 |
| 2026-04-14 | 3 | 1 | 1,655 |
| 2026-04-15 | -- | -- | -- |
| 2026-04-16 | 365 | 3 | 752,041 |
| 2026-04-17 | 58 | 1 | 182,687 |
| 2026-04-18 | 54 | 1 | 226,364 |
| 2026-04-19 | 71 | 1 | 120,712 |
| 2026-04-20 | 284 | 2 | 962,293 |
| 2026-04-21 | 115 | 1 | 261,435 |
| 2026-04-22 | 55 | 2 | 153,973 |
| 2026-04-27 | 69 | 3 | **987,484** |

(Apr 15 has BEADS work but no `discovery_tokens` recorded in the OGP project rows; the 41-session count includes that day.)

**Weekly view.**

| Week | Obs | Tokens | Defining event |
|---|---:|---:|---|
| Mar 19-22 | 61 | 153K | Scaffold + daemon mode |
| Mar 23-29 | 502 | 1.71M | v0.2.0 scope negotiation, project intent |
| Mar 30-Apr 5 | 720 | 1.97M | Rendezvous, patent disclosure, Hermes |
| Apr 6-12 | 909 | 1.92M | Multi-framework, BUG-2 phantom messages |
| Apr 13-19 | 551 | 1.28M | Heartbeat, federation resync, gateway crashes |
| Apr 20-27 | 523 | 2.37M | Identity split, security audit, PR1+PR2+rendezvous deploy |

**ROI calculation.**

Net memory savings, using the skill's own methodology:

- **Passive recall:** ~50 observations per session * 30% relevance * ~2,804 avg discovery tokens = ~42K tokens recalled per session * 41 sessions = **~1.72M tokens of work that did not need to be redone**.
- **Explicit recall:** memory-search style queries cost ~10K tokens each. Conservative count of ~30 explicit recalls (article fact-checking, BUG-2 history, F-07 verification, identity-system review) = ~300K tokens of explicit retrieval.
- **Total work tokens (per the timeline header):** 8.69M.
- **Total tokens read from memory (per the timeline header):** 1.10M.
- **Stated savings (per the timeline header):** 87%.

The timeline file's own header asserts `8,692,942t work | 87% savings` — a number that broadly aligns with the discovery-token sum of 8.84M and an effective passive-recall rate around 30%. The clearest qualitative ROI markers are the Apr 27 article fact-checks (which would have required re-reading every release-note commit and CHANGELOG to reconstruct the Apr 9 to Apr 27 implementation drift) and the BUG-2 saga's recall of the March-26 working `notify.ts` implementation (without which the team would have rebuilt the WebSocket bridge instead of finding the right webhook).

**Memory-recall observation count:** an overly-conservative SQL filter (narratives containing literal strings like "recalled," "from memory," "previous session") returned **3 matches**. That number is misleading — the tool calls themselves do not appear in narrative text, and the actual recall behavior is encoded structurally in `source_input_summary` and the prompt structure rather than in narrative prose. The 41 distinct sessions, each starting from a clean context but landing immediately into informed work, is the better signal.

## 9. Timeline Statistics

**Date range:** 2026-03-19 to 2026-04-27, 40 days, ~5.5 weeks.
**Total observations:** 3,153.
**Distinct memory sessions:** 41.
**Most active days:** Apr 8 (782 obs), Apr 16 (365), Apr 5 (354), Apr 20 (284), Mar 23 (262).
**Quietest active day:** Apr 14 (3 obs — a brief gateway-restart check).

**Type distribution (from SQL):**

| Type | Count |
|---|---:|
| discovery | 1,877 |
| change | 570 |
| feature | 422 |
| bugfix | 176 |
| decision | 74 |
| refactor | 33 |
| security_alert | 1 |

**Reading the type distribution:** 60% of observations are `discovery` — the project spent most of its tokens *figuring things out*, not building. That ratio is unusually high for a 40-day project and reflects two things: (1) OGP federates to other gateways (OpenClaw, Hermes) whose own state had to be repeatedly explored, and (2) the multi-instance / multi-framework refactors required surveying the existing surface before changing it. The 5:1 feature-to-bugfix ratio is healthy. The single `security_alert` (#35622, Apr 27) is the audit itself.

**Longest debugging sessions:** Apr 8 (782 obs / 5 sessions) for BUG-2 phantom messages, and Apr 16 (365 obs / 3 sessions) for the Portkey-API authentication marathon in Hermes.

## 10. Lessons and Meta-Observations

What a new contributor reading this history should walk away with:

**The wire protocol is the contract; the deployment is the chaos.** OGP's actual federation protocol — Ed25519 over signed canonical JSON, intent-routed message handling, doorman-enforced scope authorization — is small, stable, and has worked since Mar 23. Almost all the project's friction came from the *surrounding* infrastructure: tunnel providers, keychain semantics, OpenClaw plist interpolation, Hermes Portkey credentials, NAT traversal, multi-instance state directories, port collisions, stale daemon PIDs. A new contributor will spend most of their time in deployment and far less time in `shared/signing.ts`.

**Skill-extracted scaffold first; refine later.** Mar 19's six-minute scaffold included scope negotiation as a placeholder *and the doorman as a real module*. The fact that `agent-comms` was added as a v0.2.0 *intent* — not a special-case code path — is what allowed `project.contribute`, `project.query`, `federation.update-identity`, and `federation.resync` to be added later as just more intents, without the wire protocol changing.

**Cryptography that's done right early survives churn.** Ed25519 + signed canonical JSON was decided in the first ten minutes (Mar 19) and has not been revisited. Every security finding in the Apr 27 audit was an *application-layer* gap (which payloads got signed, which headers got verified) — none questioned the underlying primitives. That is what good early decisions look like: they make the late decisions possible.

**Conversely: any code path that *is not* signed-by-default will eventually be exploited.** The `/federation/request` and `/federation/approve` endpoints accepted unsigned payloads for thirty-nine days. The bug was caught only because a fact-check accidentally triggered a security audit. A new contributor should assume that every wire endpoint requires the same `signCanonical` / `verifyCanonical` pattern, and that any deviation from it is a bug-in-waiting.

**Two-process coordination is harder than it looks.** The F-05 nonce-tracker bug shipped, broke in CI, and was simplified within minutes — but the architectural lesson is durable: CLI and daemon are *different processes* and cannot share in-memory state. Any feature that wants to bind state across that boundary needs to be designed for it (disk-backed, signature-verified, or simply restructured to not need cross-process binding).

**Multi-instance support is a tax on every singleton assumption.** The Hermes integration (Apr 5) did not add a feature; it audited every place the codebase had assumed "there is one OGP daemon on this machine." Keychain service names. Config directories. Port numbers. PID files. Each of those produced a bug that lived for hours-to-days before being found. A new contributor adding a new framework should expect a similar tax.

**Federation makes debugging a social activity.** Many of the hardest bugs were caught by running OGP against other people's gateways. Junior, Apollo, Stanislav, Stephen, TrogdorClaw — these are not theoretical peers, they are how the team validated that the wire protocol behaved the same on other people's infrastructure. The federation peers were continuous integration partners.

**Memory turns one-day work into one-month work.** Without `claude-mem`, the Apr 27 audit would have started from a blank slate; instead it started by recalling exactly which endpoints had been added when, which payloads had ever been signed, and what `/federation/removed` had gotten right that the others had not. The 87% claimed savings is plausible; the 41-session continuity is the real artifact.

**Ship first, document second, verify third.** The `claude-mem` observation log is the document. Article-level explanations on Substack get fact-checked against the log and the code, not against an external spec. This is risky — the spec can lag the code — but it is fast, and the fact-check workflow on Apr 27 (#35614 through #35621) shows the lag is recoverable when memory and code are both intact.

If there is a single sentence that summarizes the OGP journey, it is this: **a six-minute scaffold based on good cryptographic taste produced a system whose architecture survived contact with two AI gateways, three peer humans, four major refactors, eleven security findings, and one production AWS migration — all in forty days, with most of the work being not the protocol itself but the deployment substrate the protocol had to live on top of.**

---

*End of report.*
