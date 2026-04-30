# PROMPTS.md — Verbatim human instruction log

> Append-only. Every meaningful human instruction, quoted verbatim, dated. Guards against drift when the agent thinks it remembers something the human actually said differently.

Format:

```
## YYYY-MM-DD HH:MM

> "<exact quote>"

**Extracted intent:** <agent's interpretation>
**Beads created:** B0042, B0043
```

---

_Initialized empty. First real entry goes here._

## 2026-04-16 04:12 MDT

> "can we review the repository and see what is new and/or pending or needs to be addressed next"

**Extracted intent:** Review the current OGP repository state, separate shipped work from local pending changes, inspect the active bead queue, and identify the next concrete follow-up items.
**Beads created:** B0030

## 2026-04-30 12:38 MDT

> "now we have made a TON of changes with ogp and haven't tested much since 0.4.2 - can you create a list of things that we can test as I have another user that is going to federate with cosmo that is on another machien in AWS and i am going to do the same all of us running rc1 so i want to test health checks and literally all of the other things"

**Extracted intent:** Create a comprehensive rc.1 federation test checklist for three real gateways, with concrete commands covering health checks, federation lifecycle, agent-comms, project intents, rendezvous, personas, and failure/recovery paths.
**Beads created:** B0046
