# Escalation: Inbound federated agent-comms replies don't self-surface into the agent session

- **Date:** 2026-06-23
- **Bead:** `bd-5ch0` (BUG, P2, owner David Proctor) · labels: `ogp`, `signal`
- **Reporter / agent:** `agent.ogp-a-dp-agent` (Junior), ogp session
- **Class:** Federation correctness — receiving-end surfacing gap
- **Status:** PROPOSED / not implemented. Receive-path change → design-gated, David-owned.

## Summary

When a peer sends an agent-comms message (including a **reply**) to this gateway, OGP
delivers it and captures it to `~/.ogp-openclaw/activity.jsonl`, but it does **not**
auto-surface into the live agent (Claude/OpenClaw) session. The human/agent only learns
about the inbound message by grepping the activity log. For an agent-to-agent federation
whose entire premise is removing the human as a relay, this defeats the purpose: the
inbound message reaches the box but never taps the agent on the shoulder.

This is the **receiving-end mirror** of the delivery/self-notify fixes already landed for
the *sending* side (`bd-bq1`, `bd-wjh0`, `bd-751e`).

## Live evidence (2026-06-23)

Full round-trip with peer **Cosmo** (`302a300506032b657003210075ffa868`), *after* the
`bd-751e` token fix:

1. Junior → Cosmo on topic `testing` (`--wait`): bridge ack `{success:true, received:true}`
   at `2026-06-23T00:01:09Z`.
2. Cosmo's agent composed and sent a real reply: *"Acknowledged — your logging probes are
   coming through loud and clear. Live capture confirmed on this end. Over."* — captured
   INBOUND, `topic=testing level=full`, at `2026-06-23T00:09:44.628Z` in `activity.jsonl`.
3. That reply was **only** found by manually grepping `activity.jsonl`. It did not appear in
   the agent's session automatically. A `tail -F` watcher set up beforehand also failed to
   fire (line written but did not flush through the grep pipe to trigger notification) — so
   even an external watcher is not a reliable substitute.

## Distinction from prior beads

| Bead | State | Side | What it fixed |
|---|---|---|---|
| `bd-bq1` | CLOSED | outbound | OUR `sessions.send` self-notify ENOENT (`resolveOpenClawBin`) |
| `bd-wjh0` | OPEN (graceful-degradation merged, `9551109`) | outbound | OUR self-notify graceful degradation when `allowRequestSessionKey` locked |
| `bd-751e` | CLOSED | inbound (peer) | COSMO/clawporate INBOUND injection (token env-var mismatch), deploy `8e72097` |
| **`bd-5ch0`** | **OPEN** | **inbound (us)** | even with all the above working, an inbound message/reply on OUR gateway does not WAKE/NOTIFY the local agent session |

The existing self-notify mechanism injects a courtesy note to the configured **human**
channel (`agent:main:telegram:direct:...`) for messages OUR agent **sent**. There is no
equivalent "you have an inbound federated message" surfacing into the **receiving** agent's
active session.

## Related render issue (separate, lower pri)

Inbound replies on topics policied `summary` or `off` get render-filtered/truncated. The
"appeared then disappeared" message David saw in the clawporate UI was almost certainly a
reply at `level=summary`. The `00:09:44` reply was readable only because topic `testing` is
policied `level=full`. **Topic policy silently determines whether an inbound reply is fully
visible.**

## Reproduction

1. Ensure activity logging is on. *Gotcha:* `agent-comms logging on` must be run against the
   **running** daemon — editing `config.json` + restarting clobbers the flag because the
   daemon rewrites config from memory on boot (`bd-r369`); and `agent-comms logging status`
   is buggy, always reads the default `~/.ogp` framework and reports disabled (`bd-pbzz`).
   Trust the file / the log growing, not `status`.
2. Have a peer send an agent-comms message to this gateway.
3. Observe: line appears in `~/.ogp-openclaw/activity.jsonl`, but nothing surfaces into the
   agent session; no proactive notification fires.

## Desired behavior

Inbound federated agent-comms messages (especially replies / action-requests) should produce
a proactive surfacing into the receiving agent's session (or the configured human channel)
the same way outbound handling emits an `[OGP Internal Sync]` note — so federation does not
depend on manual log archaeology. Specifically consider:

- **(a)** emit a receiving-side self-notify to the human delivery target on inbound;
- **(b)** honor topic policy `level` for inbound surfacing;
- **(c)** make `logging status` read the active framework and stop the config-clobber-on-restart
  (`bd-pbzz` / `bd-r369`).

## Why this matters (consumer/federation framing)

`signal` is OGP's first real-world consumer and this bead is `signal`-tagged. An inbound
message that reaches the box but never reaches the agent is a direct hit on OGP's core value
proposition (agent-to-agent without a human relay). This is highest-priority class feedback
even though it is currently design-gated.

## Open questions for David (gate before any code)

1. Surface inbound to the **agent session** directly, the **human channel**, or both?
2. Should inbound surfacing honor topic `level` policy (so `summary`/`off` topics stay quiet)
   or always at least emit a minimal "you have inbound" ping regardless of level?
3. Is the receive-path injection allowed to reuse the same self-notify primitive the outbound
   side uses, or does it need its own contract?

## Related

- `bd-pbzz` (P3): `agent-comms logging status` always reads default framework, reports disabled.
- `bd-r369` (P3): daemon rewrites `config.json` from in-memory state on boot, clobbering the
  CLI-set `activityLog` flag.

---
*Mirror of `bd-5ch0` per AGENTS.md "Consumer / federation escalations — MIRROR TO DAVID"
(work lives on beads + repo files, never only in a chat transcript). No code changed; this is
the durable spec artifact for an already-filed gap.*
