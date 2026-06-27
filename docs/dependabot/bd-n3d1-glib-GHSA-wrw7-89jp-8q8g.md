# Dependabot alert #6 — `glib` GHSA-wrw7-89jp-8q8g (bd-n3d1)

**Status:** PROPOSED bump — NOT auto-applied (per David's triage criteria, 2026-06-27).
**Severity:** moderate / medium. **Loop 2 hygiene, no rush.**
**Investigated:** 2026-06-27 by agent.ogp-a-dp-agent (verify-by-reading).

## The advisory
- **GHSA:** GHSA-wrw7-89jp-8q8g — "Unsoundness in `Iterator` and `DoubleEndedIterator`
  impls for `glib::VariantStrIter`".
- **Package:** `glib` (Rust crate). Vulnerable range `>= 0.15.0, < 0.20.0`; first patched **0.20.0**.
- **Manifest:** `ogp-companion/src-tauri/Cargo.lock`. Current locked version **0.18.5**.

## Triage criterion 1 — runtime vs dev/build-only
- Dependabot scope = **runtime**, BUT it is a **transitive** dependency, not a direct one.
- Direct deps in `ogp-companion/src-tauri/Cargo.toml` are only: `tauri`, `tauri-build`,
  `tauri-plugin-updater`, `tauri-plugin-process`. No `glib`/`gtk` direct dep.
- `glib 0.18.5` is pulled in **only via the Linux GTK/WebKit stack**: consumers in Cargo.lock are
  `gtk`, `gdk`, `gdkx11`, `gdk-pixbuf`, `gio`, `pango`, `cairo-rs`, `atk`, `javascriptcore-rs`,
  `libappindicator`, `webkit2gtk`, `soup3` — i.e. the Linux Tauri backend.

## Triage criterion 2 — is the vulnerable code path reachable?
- **No.** `grep -rn` across `ogp-companion/src-tauri/src/` for `VariantStrIter`, `glib::Variant`,
  `VariantStr`, and even bare `glib` → **0 matches**. OGP companion code never constructs or
  iterates a `glib::Variant`/`VariantStrIter`. The unsoundness is in those iterator impls
  specifically; our code doesn't touch them.
- **Platform note:** David's companion deploy target is **macOS**, where Tauri uses WKWebView,
  not the GTK/WebKit-GTK backend — so `glib` isn't on the actual runtime path on the primary
  platform at all. It's only ever linked when building the Linux variant.

## Recommendation (PROPOSE — do not auto-apply)
- **Risk in practice: very low.** Transitive-only, unreachable code path, not on the macOS runtime path.
- **Suggested fix when convenient (normal Loop 2 cadence):** bump the GTK stack so `glib >= 0.20.0`
  resolves. This is a transitive bump — likely needs `cargo update -p glib` (may be constrained by
  `gtk`/`webkit2gtk` semver) or a Tauri/`gtk` minor bump. Verify `cargo build` + `cargo tree -i glib`
  afterward to confirm 0.20.x resolved and nothing else broke.
- **Do NOT** merge the raw Dependabot PR without that build verification (transitive bumps on the
  GTK stack can cascade). Crypto/federation surface is untouched — no escalate-before-merge concern here.

## Evidence
- `gh api repos/dp-pcs/ogp/dependabot/alerts/6` → glib 0.18.5, runtime/transitive, patched 0.20.0.
- `grep -rln "glib" ogp-companion/src-tauri/src/` → 0 files.
- Cargo.lock reverse-dep consumers = Linux GTK/WebKit stack only.
