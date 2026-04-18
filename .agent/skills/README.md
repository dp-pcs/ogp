# skills/README.md

> Invokable helpers for the agent. Shell scripts, not documentation. The agent runs these when the task calls for them.

## Available skills

### `search-substack.sh`
Search the source publications for articles matching a topic. Returns titles + URLs + attribution.

```bash
./search-substack.sh "planning"
./search-substack.sh "memory overwrite"
./search-substack.sh "openclaw cron"
```

**Attribution note:** when the agent applies an idea surfaced via this skill, it must cite the source. *"Per 'How to Build a Perfect Plan' (Trilogy AI COE) — ..."*. The human wants to see where ideas come from.

## Rules for the agent

1. **Before inventing, search.** If you're about to design a pattern from scratch, `search-substack.sh <topic>` first. Then `npx wwvcd <topic>` for TS implementation patterns. Only then write new code.
2. **Always attribute.** Ideas from these sources get cited in your response. Silent lift = fabrication.
3. **Prefer source over paraphrase.** If the human asks about a topic covered in an article, point them to the URL first, then offer to summarize.

## Adding a new skill

Drop an executable shell/python script here. Document it in this README. Keep skills small and single-purpose.
