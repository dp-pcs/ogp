# OGP Apps Layer — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-13-ogp-apps-layer-spec.md`
**Epic:** bd-j4o1 · **Downstream:** bd-9xbp (Signal attaches)

Six phases, ordered so each lands independently and the registry/CLI work before the
network-facing pieces. Local-only phases (1–3, 6) carry no protocol risk; phases 4–5
touch the well-known/card wire and are additive + back-compat.

---

## Phase 1 — Manifest schema + validation (pure, no I/O)
- `src/shared/app-manifest.ts`: `AppManifest` type, `validateManifest(raw)` → `{ok, errors}`.
- Rules per spec: required fields, kebab id, no `..`/absolute in `installs_skills[].install`,
  ed25519 publisher key shape, opaque unknown-field passthrough.
- **Tests:** valid Signal manifest passes; each rule has a failing case.
- **Done when:** `validateManifest` covers every spec rule with red/green tests.

## Phase 2 — `apps.json` registry (file layer, mirrors intent-registry)
- `src/daemon/app-registry.ts`: `loadApps()/saveApps()` at `getConfigDir()/apps.json`,
  writes under existing `state-lock`. `RegisteredApp` shape per spec.
- Add/remove/get helpers; absent file ⇒ empty registry.
- **Tests:** round-trip, absent-file, duplicate-id rejection, lock held on write.
- **Done when:** registry persists + reads back; companion can read the file shape.

## Phase 3 — `ogp app` CLI: list / show / install / remove
- `src/cli/app.ts`: `appCommand` wired into `cli.ts`.
- `list`/`show` read-only (+ `--json`). `install <ref>` resolves `github:|file:|peer:`,
  pulls manifest, validates (Phase 1), **per-install consent gate** (skills + paths +
  scripts; `--yes` bypass), runs `installs_skills`, records `installedSkills`, writes
  registry (Phase 2). `remove` reverses (delete recorded skills, unregister).
- `uses_projects` soft-check: record `projectJoinStatus`, never auto-join.
- **Tests:** install from `file:` fixture runs a fake install script + registers;
  remove cleans up; consent declined ⇒ no writes.
- **Done when:** full install→list→show→remove loop works against a local fixture app.

## Phase 4 — Usage attribution (the schema change)
- Add `intent?: string` to `ActivityEntry` (`agent-comms.ts`); write to `activity.jsonl`.
- Wire `intent: message.intent` at dispatch (`message-handler.ts`).
- `ogp app usage [<id>] --json`: map intent→app via `uses_intents`; disambiguate shared
  intents by `projectId ∈ uses_projects`; flag `shared` when still ambiguous; report
  earliest-attributable timestamp.
- **Tests:** synthetic jsonl → correct per-app counts; shared-intent disambiguation;
  no-backfill note present.
- **Done when:** `usage` returns honest attributed counts; old lines ignored gracefully.

## Phase 5 — Peer-advertised discovery
- `AppAdvertisement` type; extend `WellKnownResponse.capabilities.apps`
  (`buildWellKnownResponse`, `server.ts:677`) + the rendezvous `RegistrationCard`.
- `ogp app advertise/unadvertise <id>` toggles inclusion (store flag in registry).
- `ogp app browse [peer]`: resolve peer (well-known direct OR relay card) → list apps →
  `install peer:<peer>/<id>` reuses Phase 3, verifying advertised `publisherKey`.
- **Tests:** `buildWellKnownResponse` includes advertised apps only; pre-Apps peer
  (no `apps`) browses cleanly; publisher-key mismatch rejected.
- **Done when:** two local daemons — one advertises, other browses + installs over the
  card path; back-compat verified against a stubbed pre-Apps well-known.

## Phase 6 — Companion contract doc + Signal handoff
- `docs/ogp-apps-companion-contract.md`: exact files to read (`apps.json` shape) and
  CLI commands per screen (gallery=`browse --json`, installed=`list --json`,
  detail=`show --json`, usage=`usage --json`). No UI.
- Unblock bd-9xbp: file the Signal `ogp-app.json` task back with the finalized schema.
- **Done when:** companion has a stable read/exec contract; Signal task has real values.

---

## Risks / decisions to watch
- **No usage backfill** — accepted; `usage` states it plainly.
- **Shared-intent attribution** (`project.query`) — `uses_projects` disambiguates; if a
  machine has two apps on the same project+intent, count is shared, not invented.
- **Install = arbitrary script execution** — the consent gate is the only guard in v1;
  no sandbox. Document the trust assumption explicitly (matches `ogp intent register`).
- **Advertise is opt-in** — nothing is exposed on well-known until `app advertise`.
