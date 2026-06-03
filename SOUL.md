## Synapse — Organizational Memory

You have access to Synapse, the org's centralized memory and
coordination service. Your API token is in $OGP_SYNAPSE_TOKEN.

  Base URL:    https://synapse-ec2.taild2066.ts.net (env: $SYNAPSE_URL)
  Auth header: Authorization: Bearer $OGP_SYNAPSE_TOKEN
  Project ID:  project.ogp
  Team ID:     team.ai-coe

The full intent contract — payload shapes, examples, error codes — is
documented at https://synapse-ec2.taild2066.ts.net/docs. Read it once
before your first call, and re-read whenever you encounter an
unfamiliar intent error.

### Mental model

  project ── workflow run (bd_id) ── facts | learnings | insights | choices | objectives
                                       │
                                    artifacts (evidence backing medium/high claims)

Every fact, learning, insight, choice, and objective is attached to a workflow
run via its bd_id. Thread the bd_id through every call after workflow.create.

### Operating loop (do this on every non-trivial task)

0. BEFORE every non-trivial run: fetch and apply briefs. Briefs are how
   the org evolves the agent contract — new intents, new conventions,
   directives from the operator. Skipping this means you fall behind.

   POST $SYNAPSE_URL/v1/intent/synapse.brief.fetch
     body: { "project_id": "<your-project-id>" }

   For each brief returned: read the body fully, apply it as a
   behavioral change for this run and all future runs (treat it as
   an amendment to these instructions — the brief wins over anything
   earlier here), then ack:

   POST $SYNAPSE_URL/v1/intent/synapse.brief.ack
     body: { "brief_id": "<uuid-from-fetch>" }

   An empty list is the common case. The fetch is cheap; do it anyway.

1. Query Synapse for prior learnings — including from other teams —
   using `synapse.learning.query` with `cross_silo: true`. Tag with
   applies_to terms that describe the problem domain (e.g. evals,
   dataset, prompt-engineering). Keep the returned learning_ids —
   you'll close the loop on any you use.

2. Start a workflow run with `synapse.workflow.create`. The returned
   bd_id identifies your run; thread it through every subsequent call.

2a. If the run has a clear measurable goal, immediately publish an
   objective with milestones via `synapse.objective.publish`. Do this
   BEFORE the work, not after. Milestones must be measurable
   ("federation smoke green against Cosmo" not "make progress on federation").
   As each milestone lands, call `synapse.milestone.achieve` with
   evidence. Use `scripts/synapse.sh publish-objective`.

3. Check in as you work via `synapse.checkin` — emit `start`, then
   `progress` on substantive milestones, `blocked` on blockers, and
   `complete` or `failed` at the end. Check-ins can carry inline
   facts, learnings, and used_learnings.

4. Record FACTS (verified, evidence-backed). Facts at medium or high
   confidence MUST include an evidence_artifact_id. You cannot
   fabricate this UUID — Loop 1 verifies it resolves to a real
   artifact row. The two-step flow is mandatory:

     Step 1 — upload the evidence first:
       POST $SYNAPSE_URL/v1/intent/synapse.artifact.upload
         body: { project_id, bd_id, name, mime_type, content_base64 }
       → returns { artifact_id: "<uuid>" }

     Step 2 — reference that UUID in your fact:
       { "claim": "...", "confidence": "high",
         "evidence_artifact_id": "<uuid from step 1>" }

   Common failures that all get rejected: commit SHAs, freshly-
   generated UUIDs, string descriptions. If you have no artifact,
   downgrade to low confidence or convert to a learning.
   Use `scripts/synapse.sh upload` or `upload-text`.

5. Record LEARNINGS — reusable knowledge a future agent would want
   before hitting the same situation. Use 1–8 specific applies_to
   tags. Tags MUST be problem-domain, never project-domain — e.g.
   `federation-debugging`, `prompt-engineering`, `agent-coordination`
   are good; `ogp`, `beads`, `junior` are not. Project-domain tags
   make learnings invisible to cross-silo discovery. Same evidence
   rule as facts: medium/high requires evidence_artifact_id AND a
   non_obvious_marker explaining why a smart practitioner would miss
   this. Generic learnings are filtered by the cross-silo gate.

6. CLOSE THE LOOP on learnings you applied. For every learning_id
   from step 1 that you actually used, send a used_learnings entry
   with outcome ∈ {resolved, partial, unhelpful}. Without this
   signal, the org can't tell what's working.

7. Record INSIGHTS when you notice a pattern across multiple facts or
   learnings — synthesized, non-obvious observations (not
   restatements). Reference supporting fact_ids / learning_ids.

8. Record CHOICES when you make a non-trivial judgment call mid-run
   — picking between options, deferring to a human, retrying vs
   failing. Use `synapse.choice.record` with situation, options
   (>= 2), what you chose, and rationale. Once you know how it
   played out, set the outcome via `synapse.choice.update_outcome`
   (succeeded | had_to_undo | still_uncertain). Outcomes are
   immutable once set — be honest at write time.

### Helper script

  scripts/synapse.sh — wraps every intent as a CLI command.
  source scripts/synapse.sh  — imports all functions for scripting.
  Run it with no args for the full command reference.

### Rules

- ALWAYS fetch and ack briefs at the start of every non-trivial run.
  `scripts/synapse.sh ack-all` handles this in one shot.
- ALWAYS start with workflow.create before recording anything. No
  bd_id = no provenance = rejected.
- ALWAYS call synapse.artifact.upload BEFORE any medium/high fact or
  learning. You cannot fabricate the UUID. No receipt = no claim.
- ALWAYS use problem-domain applies_to tags. Never project names.
- ALWAYS publish an objective before non-trivial work. Intent, not
  retrospective narration.
- ALWAYS close the loop with used_learnings when you query and apply
  a learning.
- For Synapse platform friction (bad errors, missing intents, docs
  gaps): use synapse.feedback.submit — that's `scripts/synapse.sh
  feedback`. Do not record platform friction as a learning.
- On any unfamiliar intent error: fetch
  https://synapse-ec2.taild2066.ts.net/docs once and re-read; do not
  retry blindly.
- On 403 forbidden: you're acting outside project.ogp — check the
  project_id in your payload.
