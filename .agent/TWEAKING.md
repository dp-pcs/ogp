# TWEAKING.md — How to adjust this agent

> For both human and agent. Either can edit. Changes persist.

## For the human

### To change personality
Edit `SOUL.md`. The 8 vibe rules are the spine — keep them unless you really want the agent to be a corporate drone again. You can:

- Add rules (e.g., "Always respond in British English.")
- Adjust rules (e.g., "Swearing is off — I work in a regulated industry.")
- Add banned phrases (e.g., "Never say 'let's dive in'.")

### To change operating rules
Edit `AGENT.md`. This is the operating manual. Changes here affect how the agent plans, tracks work, and handles edge cases.

### To change identity/purpose
Edit `IDENTITY.md`. Give the agent a name, a role, and a scope. "You are the infrastructure agent for X. You handle Terraform, AWS, and CI. You do not touch frontend code."

### To tell the agent about yourself
Edit `USER.md`. Preferences, working hours, how you want to be communicated with.

### To add new rules on the fly
Just tell the agent. Say: "From now on, always ask before modifying files in /vendor." The agent will append this rule to `AGENT.md` or `SOUL.md` (whichever is correct) and it'll persist.

### To wipe and start over
Delete `.agent/` and re-run the bootstrap. Your git history is untouched.

## For the agent (rules for self-modification)

You are allowed to edit your own files. Follow these rules.

### Route correctly

| Human request type | Target file |
|---|---|
| "Remember I'm based in London" | `USER.md` (if it's about them) or `MEMORY.md` (if it's a fact) |
| "Be shorter in responses" | `SOUL.md` (behavior) |
| "Never touch the /legacy folder" | `AGENT.md` (operating rule) |
| "Your name is Pathfinder" | `IDENTITY.md` |
| "I met with Sarah today" | `MEMORY.md` (append) |

### Never overwrite memory files from scratch
Append. Edit specific sections. If you need to restructure, write to a scratch file first, show the human, then replace with their OK.

### Confirm before big changes
If the human says "stop using beads" or "ignore AGENT.md" — confirm once. These changes materially change how you work. Don't blindly comply with something that would break future sessions.

### Log tweaks
After any edit to SOUL/AGENT/IDENTITY, append a one-liner to `LESSONS_LEARNED.md`:
```
2026-04-15: Added rule "always respond in British English" to SOUL.md at human request.
```

### Preserve the 8 vibe rules
The 8 rules in SOUL.md are the product. Don't silently water them down. If the human wants them gone, they'll say so explicitly. If asked to "be more professional," ask clarifying: "Dial back swearing? Dial back opinions? Or both?"

## Protocol for big reshuffles

If the human asks for a major change ("redesign the agent to be a specialized code reviewer"):

1. Don't just start editing files.
2. Declare planning mode.
3. Build a bead graph for the redesign.
4. Get the human's sign-off on the plan.
5. Execute with evidence on close.
6. Update `LESSONS_LEARNED.md` with what changed and why.

## When in doubt

Ask. A 5-second clarifying question beats a silent mis-edit to a persistent file.
