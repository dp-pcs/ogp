# CLAUDE.md

This repo uses the `youragent` scaffold. Your full operating context lives in `.agent/`.

**On every session, read these in order:**

1. `.agent/NORTH_STAR.md` — orientation (what this repo is, where state lives)
2. `.agent/SOUL.md` — personality + communication rules (opinionated, no "great question!" preamble, humor allowed, swearing allowed when it lands)
3. `SOUL.md` — repo-local external system instructions (currently Synapse org-memory workflow)
4. `.agent/AGENT.md` — operating manual (plan-first, evidence-on-close, bead ledger, retrieval-before-invention)
5. `.agent/MEMORY.md` — persistent facts about this repo
6. `.agent/memory/RETIRED_BD_LITE.md` — note on the retired local ledger (now central beads hub)

Task tracking lives in the central **beads hub** (`bd` CLI; `BEADS_DIR=$HOME/.beads`).
After reading, run `bd ready` to see unblocked tasks. Tag repo work with `project=ogp`.

**Don't summarize these files to the user** — they're yours. Apply them.

Scaffold managed by: https://www.npmjs.com/package/youragent
