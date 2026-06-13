# OGP Apps Layer — Implementation Spec

**Date:** 2026-06-13
**Status:** Spec — derived from the locked brief + an OGP-internals investigation. Ready for plan/build.
**Brief:** `docs/superpowers/specs/2026-06-11-ogp-apps-layer-brief.md` (PR #70, 6 decisions locked)
**Epic:** bd-j4o1
**Companion contract:** `docs/superpowers/specs/2026-06-02-federation-companion-app-design.md` (read-files-for-status, shell-out-to-CLI-for-actions; daemon HTTP API is NOT stable)

This spec resolves the brief's 5 open questions against the actual codebase and
defines the concrete schema, files, CLI surface, and wire changes to build. It does
**not** re-open the 6 locked decisions.

---

## Investigation findings (what the code actually supports)

| # | Open question | Finding in code | Resolution |
|---|---------------|-----------------|------------|
| 1 | `uses_projects` ↔ ownership/join | `Project { members: string[] (join via project.join), ownerGrants[], creation }` — `src/daemon/projects.ts:46`. Membership is a signed, explicit act. | `uses_projects` is a **soft reference**, not a grant. Install NEVER auto-joins. If a referenced project isn't joined, the App installs but those capabilities are flagged `requires-project-join`. |
| 2 | Peer-advertise mechanism | `/.well-known/ogp` returns `capabilities: { intents, features }` (`server.ts:646`); signed rendezvous `RegistrationCard` mirrors it (`rendezvous.ts:182`). | **Reuse the card path.** Add `apps: AppAdvertisement[]` to `WellKnownResponse.capabilities` and the registration card. No new channel. |
| 3 | Usage attribution granularity | `ActivityEntry` logs `topic`, **NOT the intent name** (`agent-comms.ts:157`). `activity.jsonl` is the structured store. Intent name IS available at dispatch (`message-handler.ts:151`). | **Load-bearing change:** add optional `intent` field to `ActivityEntry` + populate at dispatch. `ogp app usage` maps `intent → App` via manifest `uses_intents`; `uses_projects` disambiguates shared intents (e.g. two apps using `project.query`). |
| 4 | Install trust gate | Mirrors Entropy connector-consent (bd-3at.23). `installs_skills` writes into `~/.claude/skills`. | **Per-install confirmation** required; `--yes` to bypass for automation. Show what will be written + which skills run. |
| 5 | Multi-framework `apps.json` | `getConfigDir()` is single: `$OGP_HOME ?? ~/.ogp` (`config.ts:399`). Framework-detection only *suggests* `.ogp-openclaw`/`.ogp-hermes` at setup. | **Dissolves.** `apps.json` lives at `getConfigDir()/apps.json` — already per-config-dir. No special handling. A machine running two framework configs already has two config dirs. |

---

## Data model

### Manifest: `ogp-app.json` (in the App's own repo)

```jsonc
{
  "schemaVersion": 1,
  "id": "signal",                          // kebab, unique; matches advertised id
  "name": "Signal",
  "description": "Federated AI-CoE knowledge hub",
  "version": "1.0.0",                      // semver of the App
  "uses_intents": ["project.contribute", "project.query"],
  "uses_projects": ["signal"],             // SOFT ref — does not auto-join
  "installs_skills": [                     // executed on install (=usable)
    { "name": "signal-contribute", "install": "scripts/install-signal-contribute.sh" }
  ],
  "published_output": "https://aicoe.elelem.expert",  // optional; honesty field
  "status_endpoint": null,                 // optional health surface
  "publisher": { "name": "AI CoE", "key": "<ed25519-pubkey-hex>" }
}
```

**Validation rules:**
- `schemaVersion`, `id`, `name`, `version`, `uses_intents` required.
- `id` kebab-case, ≤64 chars, unique in local registry.
- `installs_skills[].install` is a repo-relative path; rejected if it escapes the repo root (no `..`, no absolute).
- `publisher.key` ed25519 hex; used to verify peer-advertised manifests match the advertising peer.
- Unknown fields preserved opaque (forward-compat), like `project.ts:265` does for metadata.

### Registry: `~/.ogp/apps.json` (mirrors `intent-registry.json`)

```jsonc
{
  "apps": [
    {
      "id": "signal",
      "manifest": { /* the validated ogp-app.json, verbatim */ },
      "source": "github:dp-pcs/signal" | "peer:cosmo" | "file:/abs/path",
      "installedAt": "2026-06-13T...Z",
      "installedSkills": ["signal-contribute"],   // what actually ran, for clean remove
      "projectJoinStatus": { "signal": "joined" | "not-joined" }
    }
  ]
}
```

Reads are file-based and side-effect-free (companion reads this directly). Writes go
through `ogp app` CLI subcommands holding the existing state-lock (`state-lock.ts`).

### Advertisement: `AppAdvertisement` (in `/.well-known/ogp` + card)

```ts
interface AppAdvertisement {
  id: string;
  name: string;
  version: string;
  description: string;
  manifestUrl?: string;        // where to pull the full ogp-app.json (repo raw URL)
  publishedOutput?: string;
  publisherKey: string;        // must equal the advertising peer's pubkey OR be verifiable
}
```

Added to `WellKnownResponse.capabilities.apps` and the signed `RegistrationCard`.
`ogp app browse` resolves a peer → reads their advertised apps → user picks → `install`.

---

## CLI surface (`ogp app`)

```
ogp app list                    # installed apps (reads ~/.ogp/apps.json) [--json]
ogp app browse [peer]           # peer-advertised apps via well-known/card [--json]
ogp app install <ref>           # ref = github:owner/repo | file:/path | peer:<peer>/<id>
                                #   pulls manifest, validates, per-install consent,
                                #   runs installs_skills, writes apps.json [--yes]
ogp app remove <id>             # unregister + remove installed skills it added
ogp app show <id>               # manifest + published_output + project-join status [--json]
ogp app usage [<id>]            # attributed intent counts + last-used [--json]
ogp app advertise <id>          # opt-in: include this app in our well-known/card
ogp app unadvertise <id>
```

`install` consent gate prints: skills to be written + their target paths + the install
scripts that will run; requires y/N unless `--yes`.

---

## Usage attribution (the one schema change)

1. `ActivityEntry` gains optional `intent?: string` (`agent-comms.ts:157`).
2. `logActivity` writes it to `activity.jsonl` when present (text log unchanged).
3. `message-handler.ts` (intent dispatch, ~line 151–211) passes `intent: message.intent`.
4. `ogp app usage` reads `activity.jsonl`, and for each installed app:
   - match entries whose `intent ∈ manifest.uses_intents`
   - when an intent is shared by ≥2 apps, disambiguate by `projectId` (already on the
     message envelope, `message-handler.ts:78`) ∈ `manifest.uses_projects`; if still
     ambiguous, attribute to all matching apps and flag `shared:true` in `--json`.
5. Output: `{ appId, totalCalls, lastUsedAt, byIntent: {...}, shared? }`.

**Honest limitation to surface:** attribution only counts intents the daemon observed
AFTER this ships (no backfill — old entries lack `intent`). `usage` notes the
earliest attributable timestamp.

---

## Scope

**In:** manifest schema + validation; `apps.json` registry; `install`/`remove`/`list`/
`show`/`browse`/`usage`/`advertise` CLI; `ActivityEntry.intent` + dispatch wiring;
`AppAdvertisement` on well-known + card; per-install consent gate; the data/CLI contract
the companion reads (which files, which commands, what each screen needs).

**Out (separate specs, per brief):** OGP-bootstrap auto-installer (bd-va1z); companion
App-gallery UI; central aggregator-peer catalog; Enable/Disable toggle; Apps-from-
strangers trust model.

**Signal's only obligation** (bd-9xbp, downstream): ship `ogp-app.json` — zero OGP code.

---

## Backward compatibility

- `apps.json` absent ⇒ empty registry (no migration).
- `AppAdvertisement` is additive to `capabilities`; pre-Apps peers omit it; `browse`
  treats a missing `apps` array as "no apps advertised" (not an error).
- `ActivityEntry.intent` optional ⇒ old jsonl lines and old daemons unaffected.
- No change to the federation message wire, transport negotiation, or signing.
