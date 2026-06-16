# OGP Apps Layer — Handoff Design Brief

**Date:** 2026-06-11
**Status:** Brainstorming decisions locked; **handed to the OGP agent to finish the spec + plan.**
**Origin:** Brainstormed in the `signal` repo (David + signal agent). Signal is the
first *consumer* of this layer, not its owner — so the design transfers here, where
it belongs.
**Companion-app context this aligns to:** `docs/superpowers/specs/2026-06-02-federation-companion-app-design.md`

---

## Why this exists (one paragraph)

OGP has skills, intents, and projects, but no first-class notion of a **named,
installable thing a user can browse, install, and then see as "installed + used."**
Today "having Signal" means an agent happens to have some skill files that ride the
`project.contribute` / `project.query` intents. A user can't browse what's available,
click to install, or see at a glance "Signal is installed and I've used it 14 times
over OGP." This layer adds that: **OGP Apps** — a declarative bundle concept plus the
registry, install flow, discovery, and usage attribution to make it real. Signal
attaches as consumer #1.

## What this brief is / isn't

- **Is:** the locked product decisions from a full brainstorming pass, with the
  rationale, so the OGP agent doesn't re-litigate settled questions.
- **Isn't:** a finished spec. Two surfaces are deliberately left for the OGP agent to
  design against OGP's own internals: (1) the exact CLI command shapes, (2) the
  companion-app UI. Open questions are listed at the end.

---

## The core concept: an "App"

**An App is a declarative bundle that points at the OGP capabilities it uses and
declares where its own output lives.** It does not *contain* a runtime — it
*references* intents/projects/skills and (optionally) an external published surface.

**Naming decision — call it "App", NOT "plugin".** "Plugin" already means something
one layer down: Claude Code / OpenClaw plugins extend a *host agent's runtime* with
code (the plugin marketplace, the beads plugin, etc.). An OGP App does not extend
OGP's runtime — it *rides* OGP's intents and may run its own pipeline elsewhere. A
plugin extends *you*; an app is its own *thing you talk to*. Using "plugin" would
collide with that sibling concept and the first question every user asks is "is this a
Claude Code plugin or an OGP one?" "App" is the honest word. (The label is cheap to
change later; the concept below is what matters.)

### Manifest: `ogp-app.json` (lives in the App's own repo)

Each App ships a manifest in its repo. Straw-man shape (the OGP agent should finalize
field names against OGP internals):

```jsonc
{
  "id": "signal",
  "name": "Signal",
  "description": "Federated AI-CoE knowledge hub",
  "version": "1.0.0",
  "uses_intents": ["project.contribute", "project.query"],
  "uses_projects": ["signal"],
  "installs_skills": ["signal-contribute", "signal-query", "signal-refresh"],
  "published_output": "https://aicoe.elelem.expert",   // honest "it's more than skills"
  "status_endpoint": null,                              // optional health surface
  "publisher": { "name": "AI CoE", "key": "<pubkey>" }
}
```

The `published_output` field is the design's honesty mechanism. Signal is genuinely
*more than skill files* — it has a real publish pipeline (projector → Lambda → S3 →
CloudFront site). The manifest plainly lists both halves: the skills it installs
**and** the external surface it owns. An App with no pipeline simply omits
`published_output`, and the UI shows it as a pure skill-bundle. Nothing pretends to be
more than it is; nothing hides what it actually is.

---

## Locked decisions (6)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | **What is the unit?** | App = a manifest bundle that references intents + projects + skills + external output | Only model that honestly represents an App's *both halves* (client skills + owned pipeline) and stays generic. Do **not** hardcode any single App into OGP — build the generic manifest reader; Signal is exhibit A. |
| 2 | **Naming** | "App" (not "plugin") | Avoids collision with Claude Code / OpenClaw plugins (runtime-extending code). See concept section. |
| 3 | **Discovery** | **Peer-advertised** (primary) over **manifest-in-repo** (substrate); central catalog deferred | Relay (no tunnel required) is the unlock — peer-advertised discovery is now the natural OGP-native answer and makes "click an App → get data from it" a real federation query, not a hardcoded link. Every App *is* a manifest file; peer-advertising = "a peer tells you which manifests it publishes." Central catalog can come later as one well-known aggregator peer (YAGNI for v1). Honest tradeoff: you only discover Apps from peers you're connected to — correct for org-internal tools like Signal; insufficient for "discover from strangers" (later). |
| 4 | **What does install DO?** | **Install = usable**, not a bookmark | The manifest's `installs_skills` executes on install (the `install-signal-*.sh` behavior, generalized). After install an agent on the machine can actually *use* the App, and it shows as installed. A bookmark-only install would make the feature a glorified link and the usage-tracking meaningless. A future Enable/Disable toggle is a natural extension, not a required first step. |
| 5 | **What does "used over OGP" mean?** | **Daemon-observed intent calls, attributed to the App via the manifest** | "Used over OGP" should mean exactly that: intent calls observed by the daemon, mapped back to the owning App through the manifest's `uses_intents`. The one source that is both honest and automatic (no per-App self-reporting burden). **IMPORTANT transport correction below.** |
| 6 | **OGP-bootstrap (auto-install OGP if missing)** | **Separate spec — out of scope here** | The companion app could detect missing OGP and even auto-install it (npm `@dp-pcs/ogp`, but the real difficulty is the **Node** dependency on non-dev machines → likely a bundled Node runtime / SEA single-binary, which is real native-packaging work). That risk must not balloon the Apps design. This spec **detect-and-guides only** (cheap: the app already polls the daemon / can check `ogp` on PATH); the full auto-installer is its own follow-up spec. |

---

## Transport correction (align to the companion-app contract)

The companion-app spec (2026-06-02) locked a **drive-mechanism contract** this layer
**must** respect:

> Hybrid: **read files for status, shell out to `ogp` for actions.** The CLI is the
> stable, supported contract; **the daemon's internal HTTP API is NOT stable.**

This corrects the brainstorm's initial assumption (a bespoke `localhost:18790` usage
feed). Re-cast onto the contract:

- **Registry (installed Apps):** a state file under `~/.ogp/`, e.g.
  `~/.ogp/apps.json` — sits right next to the existing `intent-registry.json` /
  `intents.json` / `projects.json`. Reads are file-based (instant, side-effect-free).
- **Usage signal:** the daemon already writes `~/.ogp/activity.log`. Usage attribution
  should **extend that existing log** (tag each intent dispatch with the owning App,
  derived from the manifest's `uses_intents`), surfaced via a **CLI** read command,
  not a new HTTP endpoint.
- **Actions (install / remove / enable):** new `ogp` CLI subcommands (write side).

### Strong fit: OGP already has the substrate

Two existing surfaces mean this is *extension*, not invention:

- **`ogp intent register/list/remove`** + `~/.ogp/intent-registry.json` — a working
  named-thing registry with schema + handler script. The Apps registry is the same
  pattern one level up (an App groups intents/skills/output).
- **`~/.ogp/activity.log`** — a daemon-written event log; usage attribution rides it.

Suggested (OGP agent to finalize) CLI surface — `ogp app` / `ogp apps` namespace is
free today:

```
ogp app list                 # installed apps (reads ~/.ogp/apps.json)
ogp app browse               # discover peer-advertised apps (federation)
ogp app install <ref>        # pull manifest, register, run installs_skills
ogp app remove <id>
ogp app usage [<id>] --json  # reads attributed activity.log → counts/last-used
ogp app show <id>            # manifest + instructions + published_output link
```

---

## Scope boundary for the OGP agent

**In this spec (recommended):** the durable, hard-to-reverse layer — manifest schema,
`~/.ogp/apps.json` registry shape, install flow (incl. `installs_skills` execution),
activity-log usage attribution + `ogp app usage`, and peer-advertised discovery over
relay. Plus the **interface the companion app consumes** (which files to read, which
CLI commands to call, what each screen needs) — *not* pixel-level UI.

**Deferred (separate specs):** (a) OGP-bootstrap / auto-install of OGP itself;
(b) the companion-app UI layout (App gallery, detail view, installed-with-usage list)
— design that against the settled data/CLI contract; (c) central aggregator-peer
catalog; (d) Enable/Disable toggle; (e) Apps-from-strangers trust model.

---

## Signal as consumer #1 (what signal-side owes, once this lands)

Signal's only obligation is to **attach**: ship an `ogp-app.json` in the signal repo
(values in the manifest example above are real). Signal needs **no code change** in
OGP — that's the proof the layer is generic. Signal's "more than skills" nature shows
up purely as the `published_output` field. File this back to the signal agent as a
follow-up bead once the OGP layer exists.

---

## Open questions for the OGP agent

1. **Manifest field names + validation** — finalize against OGP internals (esp. how
   `uses_projects` relates to the existing project-join/ownership model).
2. **Peer-advertise mechanism** — does an App advertisement ride the existing
   federation card / relay advertisement surface (see
   `docs/RELAY-HANDSHAKE-DESIGN.md`, `36e4ee0` multi-transport advertisement), or a
   new channel? Strong prior: reuse the card/advertisement path.
3. **Usage attribution granularity** — per-intent-call vs per-session; how to map a
   raw intent dispatch in `activity.log` back to an App when two installed Apps share
   an intent (`project.query`). The manifest's `uses_projects` may be the disambiguator.
4. **Install trust** — installing runs `installs_skills` (drops files into
   `~/.claude/skills` etc.). What's the consent/trust gate? (Mirrors the connector
   consent work in the Entropy spike; worth a per-install confirmation.)
5. **Multi-framework** — Apps under `--for openclaw` vs `--for hermes`: per-framework
   `apps.json`, like the existing per-framework state dirs?

---

## Provenance

Brainstormed via the `superpowers:brainstorming` flow in the signal repo on
2026-06-11. Six clarifying questions, decisions locked one at a time. The signal
agent caught mid-brainstorm that this is an OGP-owned layer (Signal merely attaches),
and the work was transferred here rather than built in the wrong repo. The companion
app referenced during the brainstorm was initially the older `ogp-companion`
menu-bar repo; this brief is re-aligned to OGP's own current companion-app spec and
its CLI-not-HTTP drive contract.
