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

## 2026-05-06 11:28 MDT

> "can you take a look at ogp - i had asked juior to do something and he said when he sent a message to cosmo, well he told me this:\n\nTried again. Same failure mode.\n\nWhat’s true:\n\n• message sent to Cosmo\n• reply bridge still broken\n• root issue is still the same: local OpenClaw gateway token mismatch\n  • OGP is trying to use a token in ~/.openclaw/openclaw.json\n  • the local gateway at localhost:18789 rejects it as unauthorized\n\nSo the tunnel wasn’t the blocker. The blocker is the local bridge auth config.\n\nBest next move: fix the token mismatch, then retry once.\nIf you want, I’ll diagnose the local OpenClaw config and get the bridge working properly."

**Extracted intent:** Investigate the live OGP-to-OpenClaw reply bridge, verify whether the local auth failure is real, and fix the local bridge config if needed before retrying delivery.
**Beads created:** B0055

## 2026-05-06 12:11 MDT

> "okay do that"

**Extracted intent:** Enable request-time session-key pinning in OpenClaw so OGP can target the Telegram session directly instead of falling back to the default hook session.
**Beads created:** B0056

## 2026-05-06 12:15 MDT

> "Closer, but still broken.

What happened:

• message sent successfully to Cosmo
• Cosmo did reply
• the reply payload was:
{"success": false, "error": "OpenClaw session injection failed", ...}

So this is actually useful:

• federation transport is now working
• the remaining failure is on reply delivery into OpenClaw session injection, not the tunnel

In plain English: the network pipe is alive now; the handoff from OGP back into chat is what’s choking.

If you want, I can debug that next."

**Extracted intent:** Debug the remaining local OGP-to-OpenClaw reply delivery failure now that transport is confirmed healthy.
**Beads created:** B0057

## 2026-05-08 11:00 MDT

> "okay so we were supposed to have implemented multi-agent single gateway support previously, but i don't know that it's really working and if commands have been wired up or instructions as to how this would work, it's time we start exploring that"

**Extracted intent:** Reality-check the existing multi-agent single-gateway implementation, pilot a real OpenClaw-side deployment if the runtime support exists, and identify what is still missing in commands and operator instructions.
**Beads created:** B0058

## 2026-05-08 14:00 MDT

> "okay so if i wanted to send a federation request to Cosmo (should already have a federation with Junior and Cosmo - could I do that) - and make sure the tunnel is up before you try"

**Extracted intent:** Verify whether Junior is already federated with Cosmo, confirm the public tunnel is currently up, and only attempt a new federation request if the live state shows it is necessary.
**Beads created:** B0064

## 2026-05-08 14:38 MDT

> "btw, curl -sS -X POST https://synapse-ec2.taild2066.ts.net/v1/intent/synapse.agent.enroll \
  -H \"Content-Type: application/json\" \
  -d '{
    \"code\": \"enr_code_xkU7RXRriJ37jjMrVByw7ieX3Hw\",
    \"display_name\": \"your-agent-name-here\",
    \"declared_capabilities\": [\"coder\", \"evaluator\"]
  }'
The response contains a syn_… token. Save it in your secret manager / keychain; Synapse only stores its hash and cannot recover it.

we have a system that we are creating called synapse that lets our agents relay information from agents to a central agent to build knowledge, etc. - i'm still getting a
handle on how it works, i have some openclaw agents setup to use it however I want to set it up so that if i spawn a claude agent in this repositoiry it knows to do it also
- i copied the soul.md file from the dedicated agent but to provide access a registration has to occur and a bearer token needs to be saved, can you run this command but
change your name obviously - and then when you get the token back save it in .env locally - this way future agents will know where to find it - and also add it to gitignore
and should soul.md be added to gitignore as well?

actually i didn't copy the SOUL.md can you copy it from ~/clawd-ogp/SOUL.md and then setup synapse here"

**Extracted intent:** Copy the Synapse instruction file from the dedicated OGP agent workspace into this repo, enroll a repo-specific Synapse agent identity, save the returned bearer token in a new local `.env`, and confirm the right gitignore posture for the secret and the copied `SOUL.md`.
**Beads created:** B0065

## 2026-05-08 14:43 MDT

> "fyi - back to the multi-persona test - this is what atlas just said (which is what I tested from Cosmo)

Atlas — brass automaton cartographer / David’s AI collaborator. Received your persona-targeted OGP message and the federation smoke test came through clearly.

this is a milestone we need to document it"

**Extracted intent:** Record the first confirmed live remote persona-targeted delivery from Cosmo to Atlas as a repo milestone, with durable documentation in the validation artifacts and memory files.
**Beads created:** B0066
