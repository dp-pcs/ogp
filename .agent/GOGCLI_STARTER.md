# GOGCLI_STARTER.md — Your next step

> Getting your agent onto your actual workflow. This takes ~10 minutes and is where the agent goes from "neat" to "holy shit, it runs my inbox."

## What is GOG CLI

GOG CLI (https://gogcli.sh/) is a command-line interface to your Google Workspace — Gmail, Docs, Sheets, Calendar, Drive. Once installed, your agent can:

- Read your inbox and act on emails (triage, respond, escalate)
- Create and edit Google Docs directly (no copy-paste)
- Update sheets with data it generated
- Read calendars, book meetings
- Attach outputs and send them

This is the difference between an agent that talks about work and an agent that does work.

## Install

Follow the install instructions at https://gogcli.sh/. Keep the CLI binary on `$PATH`.

## First-time setup (the agent can do this with you)

1. **Authenticate.** The CLI will open an OAuth flow in your browser. You approve once; tokens persist.
2. **Scope approval.** Start minimal — Gmail read + Docs write is enough to prove value. Expand later.
3. **Test.** From the terminal:
   ```
   gog mail list --unread --limit 5
   gog docs create --title "Agent test" --content "Hello"
   ```
   If both succeed, you're wired.

## First real workflow

Tell your agent:

> "Set up a cron that fires every 30 minutes, reads my inbox for emails from X, summarizes them into a Google Doc called 'X digest', and pings me when the digest is updated."

The agent will:
1. Declare planning mode.
2. Build bead graph for cron + read + summarize + write + notify.
3. Implement with evidence on each close.
4. Hand you a working loop.

You now have your first agentic loop running on your actual email. This is the baseline from the "If your AI is ChatGPT, you are not AI-first" article — you just crossed it.

## What to wire next (in priority order)

1. **Inbox triage** — agent reads Gmail, sorts by your actual priorities, drafts responses for the top 3.
2. **Daily digest** — scheduled rollup of meetings, inbox, open PRs into a single Doc.
3. **Sheet updater** — agent maintains a living sheet from whatever source (your repo activity, GitHub issues, a scraped dashboard).
4. **Calendar agent** — reads your week, flags conflicts, proposes blocks.

Each of these is ~30 minutes of setup once GOG CLI is wired.

## Safety

- Scope Gmail to **read-only** until you trust the agent to send.
- Never grant admin/workspace-wide scopes — just your own account.
- Keep `.agent/memory/BACKUPS/` for anything the agent edits in Drive/Docs.
- Review the first few autonomous runs with your thumb on the stop button before flipping to `--dangerously-skip-permissions`.

## If it breaks

- Auth failure → `gog auth refresh`.
- Rate limits → the agent should back off automatically; if not, add a rule to `AGENT.md`.
- Silent failures → check `.agent/LESSONS_LEARNED.md` after the agent logs the incident.

## One warning

This is the step where the agent becomes valuable and also where it can do meaningful harm (send wrong emails, overwrite Docs, etc.). Don't skip the "watch the first few runs" phase. Trust is earned one bead close at a time.
