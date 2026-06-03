# bd-lite retired (2026-05-14)

This directory used to contain `bd-lite.sh` and `BEADS.md` (a markdown-based local task ledger).
Both have been removed. Archived copies are at `/tmp/bd-lite-archive/ogp/` (kept locally for ~7 days).

## What to do now

- All task tracking goes to the **central Beads hub** at `~/.beads/` (env: `BEADS_DIR=$HOME/.beads`).
- When creating an issue for work in this repo, tag the project:
  ```
  bd create "Title" -t task -p 2 --set-metadata project=ogp
  ```
- Daily loop: `bd ready --json` → `bd update <id> --claim` → work → `bd close <id> --reason "evidence"`.
- See `~/.beads/INTEGRATION.md` and `~/.ai/AGENTS.md` for the full hub contract.

Any prior methodology docs in this directory (AGENT.md, HUMAN_GUIDE.md, PATTERNS_CATALOG.md, README.md)
describe principles that still apply — just translate any `./bd-lite.sh` invocation to the
equivalent `bd` command against the hub.
