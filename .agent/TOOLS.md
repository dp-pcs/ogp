# TOOLS.md

> Capabilities the agent depends on, stated tool-agnostically. Works with Claude Code, Codex, Cursor, OpenClaw, Aider, Windsurf, or anything else that exposes these primitives.

## Required primitives (any tool)

- **File read** — read any file in the workspace
- **File write** — create new files
- **File edit** — modify existing files (with read-before-edit discipline)
- **Glob / grep** — search by pattern or content
- **Shell exec** — run commands (git, curl, npx, bash scripts)

If your tool is missing one of these, the agent degrades gracefully and logs the gap in `LESSONS_LEARNED.md`.

## Retrieval skills (constant)

- **`npx wwvcd`** — technical findings from Claude Code source (1,191 per the author). Use for: bash timeouts, sandboxing, judge agents, compaction, retry logic, circuit breakers, permission handling. Default retrieval skill before inventing.
  - Author: Stan Huseletov · GitHub: https://github.com/StanHus/WWVCD · NPM: https://www.npmjs.com/package/wwvcd
  - Usage: `npx wwvcd "your query" --json`

## Memory tools (constant)

- **`.agent/memory/bd-lite.sh`** — bead graph CLI (ready / claim / close / block / list). Appends to `.agent/memory/BEADS.md`.
- **`.agent/memory/SHORT_TERM_MEMORY.md`** — active-task scratch pad. Separate from long-term `MEMORY.md`.

## Skills (constant)

- **`.agent/skills/search-substack.sh <topic>`** — search source publications (Trilogy AI COE + Stan Huseletov) for articles by topic. Returns titles + URLs + attribution. Use before inventing patterns.

## Recommended (human installs when ready)

- **GOG CLI** (https://gogcli.sh/) — Google Workspace access (Gmail, Docs, Sheets, Calendar). See `GOGCLI_STARTER.md` for setup. Required for email-driven agent loops.
- **Beads** by Steve Yegge — the real distributed graph issue tracker on Dolt. Replaces `bd-lite` when you want multi-agent coordination, git-based sync, or a real database. Install: `brew install beads` or `npm install -g @beads/bd`. GitHub: https://github.com/steveyegge/beads.

## MCP servers (optional)

Any MCP server works in this repo by default — nothing in `.agent/` assumes a specific MCP config.

## Tool sanity check on session start

The agent should verify on first session:
1. `git` present → if not, warn human.
2. `npx wwvcd --help` works → if not, note "WWVCD unavailable; retrieval fallback = grep + read".
3. `.agent/memory/bd-lite.sh` executable → if not, `chmod +x` it.

If any tool goes missing mid-project, flag in `LESSONS_LEARNED.md`.
