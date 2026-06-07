# Totogi Design System

> Vertical AI for telecom. A living digital twin that sits above fragmented BSS/OSS stacks and gives AI the semantic foundation it needs to operate across the entire business.

This folder is the Totogi design system. It contains every token, asset, guideline, and recreated UI component needed to build on-brand interfaces, decks, and marketing artifacts for Totogi and its flagship product, **BSS Magic**.

---

## Company context

Totogi is a vertical-AI company focused exclusively on telecommunications. The problem telcos face isn't a lack of AI tools — it's that AI can't work at scale across fragmented legacy systems that don't share a common understanding of the business.

Totogi's flagship product, **BSS Magic**, creates a unified **telco ontology** — a living digital twin built on open industry standards — that sits above existing systems and gives AI the semantic foundation it needs to operate across the entire stack. Totogi works with tier-one operators to connect systems from **Amdocs, Ericsson, Huawei, Salesforce,** and other vendors, enabling new AI capabilities in production **without replacing a single system**.

The Totogi story stacks three layers:

1. **Data layer** — the existing, fragmented BSS/OSS/data systems.
2. **Telco ontology layer** — Totogi's unified semantic model of a telco.
3. **AI layer** — agents and tools that reason, generate production-grade code, and orchestrate changes across the stack.

### Product surfaces represented
- **Totogi marketing website** (totogi.com) — the primary surface captured in the Figma source. Contains home, company, product, resources, blog, podcast, case study and FAQ templates.
- **BSS Magic** — named product line, spoken about throughout. No product UI is in the attached sources; we only have marketing surfaces and product copy.
- **Totogi Charging / Charging-as-a-Service / 5G Advanced / Wholesale Platform / Whoosh! / Plan AI** — adjacent products referenced on the site but not individually designed.

### Sources
- **Figma file** (mounted read-only): `Totogi website.fig` — 2 pages, 124 top-level frames. Focus pages: `/Page-1`.
- **Uploaded brand assets** (`uploads/`): Poppins + Space Grotesk fonts, Totogi wordmark (purple/white), five SVG gradient swatches used across the site.
- Website URL: https://totogi.com

Neither a codebase nor a deck template were attached.

---

## Index

| File | Purpose |
|---|---|
| `README.md` | This file — brand, visuals, voice, index. |
| `SKILL.md` | Agent Skill descriptor — makes this folder usable as a Claude Skill. |
| `colors_and_type.css` | All color tokens, font-face declarations, type ramp, spacing, radii, shadows, buttons. **Import this first.** |
| `fonts/` | Poppins (8 weights + italic) and Space Grotesk (variable). |
| `assets/` | Wordmark logos, signature gradient swatches, network/constellation background imagery, ontology line art. |
| `preview/` | Design-system reference cards (colors, type, buttons, spacing, etc). |
| `ui_kits/website/` | React-ish recreation of key Totogi marketing surfaces: hero, features, three-pillar section, FAQ, CTA, footer. Open `index.html`. |
| `ads/` | Paid-media ad-creative system — composition map, layout spec, machine-readable coordinates per ad × per size. See `ads/README` below. |

---

## Paid-media ad system (`ads/`)

Source of truth for Totogi Ontology's paid-ad creatives across **LinkedIn Ads** (1200×1200, 960×1200, 1200×628) and **Influ2** cross-platform (1080×1080, 1200×628, 300×600, 160×600, 300×250, 728×90, 970×250, 320×50).

| File | Purpose |
|---|---|
| `ads/composition-map.json` | Per-ad composition variant, background, logo variant, image anchor. Hand-maintained. |
| `ads/ad-copy.md` | Lead message, signature, CTA for each of the 13 round-2 ads. |
| `ads/layout_system_1200_square.md` | Canonical 1200×1200 master layout (variants A–I). |
| `ads/layout_system_all_sizes.md` | Multi-size extension — rules for every size we ship. |
| `ads/ad-size-layouts.json` | Machine-readable per-ad × per-size coordinates for Codex/Illustrator MCP automation. |
| `assets/ad-images/` | Approved Gemini visuals (2048×2048). |
| `assets/ad-backgrounds/<size>/` | Gradient + solid backgrounds regenerated at every target aspect ratio. |
| `preview/ads-all-sizes.html` | Live rendered preview: 13 ads × 10 sizes = 130 creatives, filterable. |

---

## Content fundamentals

**Voice: confident, grown-up, B2B.** Totogi is selling AI to tier-one telcos — the copy reads like an enterprise vendor who knows the jargon and respects the buyer's time. It is **not** playful, emoji-laden, or "hey friend"-casual.

### Examples
- Headline: *"AI that works"* — short, punchy, declarative. Paired with a subhead that does the actual explaining.
- Subhead: *"Totogi helps the world's leading CSPs move from pilots to operational AI that drives real results in weeks. We turn semantic inconsistency in fragmented, multi-vendor BSS/OSS stacks into a single, actionable AI-ready source of truth."*
- Section title: *"AI that shows up in your P&L"* — commercial outcomes, not tech-for-tech's-sake.
- Section title: *"Single, actionable AI source of truth"* — long noun phrases are fine.
- Benefits bullets: *"Compress multi-year migration timelines into weeks." / "Let AI map, validate, and reconcile data between stacks." / "De-risk cutovers and unlock savings faster."* — imperative, verb-led, measurable.
- CTA labels: **Book a Demo** (observed in Figma as the slightly stylised *"Book a DEmo"*; treat "Book a Demo" as correct), *See how BSS Magic works*, *Read the blog*, *Find out more*, *Resources*.

### Tone rules
- **"We" and "you"** — Totogi uses "we" for the company and "your" for the buyer (*"your stack," "your business"*). First-person singular "I" is not used. Prefer "your team," "your business," "your P&L."
- **Sentence case** for marketing headlines, navigation, buttons. Title Case only for proper nouns (Totogi, BSS Magic, CSP, AI, 5G SA, MVNO).
- **Use the vocabulary.** CSP (communications service provider), BSS/OSS, ontology, semantic, operational AI, cutover, tier-1, multi-vendor, ripping and replacing. Never dumb it down.
- **Outcomes over features.** "Turn AI into real business outcomes" / "AI that shows up in your P&L" / "results in weeks."
- **No emoji.** None appear anywhere in the Figma file; do not introduce them.
- **No exclamation marks** except on product names that include one (`Whoosh!`).
- **Em-dashes are fine** and common — sentences often use them for aside or consequence.
- **Numbers as digits** for proof points (8-month project → 14 days, tier-1, 5G).
- **Capitalised abbreviations stay capitalised** (AI, BSS, OSS, CSP, MVNO, API, SA).
- **Sparing curly quotes** (the Figma uses them — `'` and `"`).

### Vibe
Serious, quick, commercial. "We already know you're skeptical of telco AI; here's how it actually ships." Headlines are punchy; body text is dense but friendly.

---

## Visual foundations

### Palette
Six core colors used in a deliberate ratio.

| Role | Hex | Use | Share |
|---|---|---|---|
| **Totogi Purple** | `#802DC8` | Primary brand, light-bg CTAs, badges, accents | ~20% |
| **Totogi Navy** | `#001D3D` | Dark sections, footer, hero gradient bottom | ~20% |
| **White** | `#FFFFFF` | Canvas, card surfaces | ~20% |
| **Totogi Pink** | `#EF50FF` | Dark-bg CTAs, the signature wedge/flag on feature cards, hyperlink arrows on purple | ~10% |
| **Soft Lilac** | `#ECE1F0` | Tinted light surface | ~5% |
| **Accent Red** | `#FF4F59` | Timeline marker dots only | ~5% |

Supporting grays: `#1F1F1F` body text, `#4B5563` muted meta, `#F5F5FA` panel bg, `#CDC9ED` hairlines/dividers.

### Signature gradients
Five gradient SVGs ship with the brand, all from `uploads/`, and are mirrored in `assets/`:
- `gradient-purple-to-navy.svg` — top-to-bottom purple→navy; used as hero backdrop.
- `gradient-pink-to-navy.svg` + `gradient-pink-to-navy-bl.svg` — pink→navy diagonals for dark section headers.
- `gradient-white-to-lilac.svg` — `#FFFFFF 19%` → `#F5F5FA 72%`; the default page background.
- `solid-purple.svg` — the plain `#802DC8` swatch.

**Hero grid background** (`assets/hero-grid.svg` + `--grad-hero-grid`) — the totogi.com homepage hero. A `245deg` navy→pink diagonal (`#001D3D 42.63% → #EF50FF 87.11%`) overlaid with a dot-and-line "constellation" grid and faded to navy from the top edge. Use the `.hero-grid` / `.hero-grid__pattern` / `.hero-grid__content` utility trio — see `preview/hero-grid.html`. This is the current homepage hero; the older `--grad-hero` (navy→purple, vertical) remains the deck/section hero.

### Typography
Two families, clear roles.

- **Space Grotesk Bold** — `display / h1 / h2 / h3` only. 56–72 px, `line-height: 1.2`, `letter-spacing: 0.01em`. Used for every marketing section hero.
- **Poppins** — everything else. Body 18/1.6 (`.t-lead`), 16/1.5 (`.t-body`), card titles 24/1.3 Bold, buttons 16/1.3 Medium or Bold, captions 14/1.5. Nine weights are shipped (Light 300 through Black 900).

No italics except for occasional prose emphasis; never for titles.

### Spacing
- **Section to section:** 220 px (110 top + 110 bottom). This is the dominant vertical rhythm.
- **Content padding inside a card:** 40 px.
- **Section title → description:** 30 px.
- **Card gaps:** 20 / 16 / 12 px.
- **4-pt base** grid underneath everything.

### Backgrounds
- **Default page:** `linear-gradient(#FFFFFF 19%, #F5F5FA 72%)` — top-to-bottom white to barely-tinted gray. Never pure `#FFFFFF` on long marketing pages.
- **Hero:** `linear-gradient(#001C3D 33%, #7339A6 100%)` navy-to-purple, overlaid with a white dot-grid "constellation" (extracted at `assets/demo-backdrop.png` and `assets/hero-network-image.png` — the latter is a wireframe drone; use only when the concept calls for it).
- **Homepage hero (grid):** `var(--grad-hero-grid)` — a `245deg` navy→pink diagonal — overlaid with `assets/hero-grid.svg` (purple/lilac dot-and-line grid) and faded to navy at the top edge. Ship it with the `.hero-grid` utility trio (`.hero-grid` + `.hero-grid__pattern` + `.hero-grid__content`). This is the live totogi.com homepage hero.
- **Section framing:** two **vertical hairlines** at `x=129` and `x=1309` on a 1440-wide canvas — faint purple (`rgba(128,45,200,0.5)`, 0.5px) — run the full length of most sections. They're the single strongest layout motif; every UI kit section uses them.
- **Feature panels:** white cards with `box-shadow: 0 4px 25px rgba(0,0,0,0.05)` and a **27.5 px pink wedge** along the top (the wedge has a notch in the bottom-left corner — see `.wedge-pink`).

### Corners & cards
- **Pill CTAs** — all buttons are full-pill `border-radius: 50px`. No square or slightly-rounded buttons exist.
- **Badges** — 4 px radius, 1 px purple border, lilac-050 fill, purple-900 text.
- **Cards** — 8 px (foundations grid), 12 px (preview insets), 20 px (large CTA cards), 50 px (pill). No "rounded-corner left-border accent" cards.
- **Images** — 10 px radius by default, never circular except the big ontology diagram (440×440 circle).

### Buttons & hover
- **Dark-bg primary (on hero / dark sections):** pink `#EF50FF` fill, white text, no shadow. Hover → purple `#803CCA`.
- **Light-bg primary (on white / lilac sections):** white fill, dark-ink text, `box-shadow: 0 4px 10px rgba(0,0,0,0.15)`. Hover → purple fill with white text.
- **No ghost / outline / text-only buttons** at the marketing level — every CTA is a pill.
- **Hover on a link or arrow link:** purple text + arrow + underline (observed: "Save with serverless →").

### Press / active states
Not specified in the source. Recommended: `transform: translateY(1px)` and darken fill one step on `:active`; defer to component judgment.

### Shadows
Three used consistently:
- `0 4px 25px rgba(0,0,0,0.05)` — card / feature panel (soft).
- `0 4px 10px rgba(0,0,0,0.15)` — white pill CTA on light.
- `0 4px 6px -2px rgba(16,24,40,0.05), 0 12px 16px -4px rgba(16,24,40,0.1)` — raised swatch in the color-style spec (tightly-stacked two-tier).

### Transparency & blur
Transparency is used sparingly: the 50%-opacity purple hairlines, the 20%-opacity constellation pattern over the hero gradient, 0.05 alpha shadow. **No backdrop-blur** used.

### Imagery
- **Wireframe / monochrome 3D** for hero (see `assets/hero-network-image.png` — a wireframe drone). Cool, technical.
- **Photographic / warm telecom abstract** for feature sections (see `assets/charging-feature.jpg`, `feature-image-secondary.jpg`). Cooler purples and warm neutrals.
- **Abstract network/constellation line art** over dark backgrounds (`demo-backdrop.png`).
- Every photo has a **pink wedge** pinned to one corner of its containing card.

### Animation
The static Figma source doesn't specify motion. Recommended house style for any animated work:
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (gentle ease-out) for UI; `cubic-bezier(0.65, 0, 0.35, 1)` for hero reveals.
- Durations: 180 ms (hover), 260 ms (enter), 420 ms (hero).
- Prefer **fade + 8 px translate-y** entries over bounces. No bounces.
- Hover: background/color cross-fade; no scale.

### Layout rules
- **1440 px design width**, content grid `129 → 1309` (~1181 px, flanked by the two hairlines).
- **Two vertical hairlines** mentioned above are a *fixed* layout element — ship them on every full-width section.
- **Sections span full bleed**; content is max-width `~1200 px` centered inside.
- **Fixed nav:** top-of-page, transparent over hero, switches to white with shadow when scrolled.

---

## Iconography

Totogi uses **two distinct icon families** depending on the surface.

### 1 · Presentation family (primary for decks + marketing)
Duotone line icons with **purple stroke (2.4 px on a 64 grid)** and **2–4 accent dots** in `#EF50FF`, `#FF4F59`, and `#802DC8`. Telecom-native subject matter: servers, cell towers, signal bars, AI chips, orchestration loops, radar/network graphs, dashboards, satellite orbits, cloud + device. See `preview/iconography.html` for 10 reference symbols you can copy. On dark surfaces the stroke flips to white; the accent dots stay the same colors.

### 2 · UI family (web / app)
Totogi's Figma uses Phosphor + Flaticon-sourced line icons for compact UI chrome (nav chevrons, mail/phone, FAQ plus). Recommended substitute for new work: **[Lucide](https://lucide.dev)** at 20–24 px, `color: var(--totogi-purple)` on light, `#fff` on dark. Flag the substitution to the user — the brand's original set is Phosphor/Flaticon and we're approximating.
- **Use `assets/totogi-logo-purple.png`** on light backgrounds, `assets/totogi-logo-white.png` on dark. Both are 400×220 with transparent backgrounds. The wordmark is the **only** logomark; there is no separate icon/monogram mark.
- **Do NOT use emoji.** None appear in source materials.
- **No unicode-as-icons** ( ✓ ✗ → ).  Use real SVG chevrons / arrows. An inline arrow used by Totogi is a 9.9 × 9.9 px 45° vector (`→`), always purple.

---

## Fonts — substitution note

All font files are the **original .ttfs** uploaded by you (`uploads/`). No substitution was needed. If you regenerate from Google Fonts in the future:
- **Poppins** — [Google Fonts](https://fonts.google.com/specimen/Poppins) (9 weights + italics).
- **Space Grotesk** — [Google Fonts](https://fonts.google.com/specimen/Space+Grotesk) (variable, 300–700).

---

## Caveats
- The Figma is the **only** source of truth shipped — no production CSS, no Storybook, no codebase, no brand guidelines PDF. Some inferences (animation, press states, hover fallbacks) are judgment calls rather than observed.
- The icons in Figma reference Flaticon/Phosphor IDs rather than shipping a dedicated icon set. We recommend Lucide as a close match but flag this as a substitution — ask the brand team for the real icon set.
- No component library / UI kit for BSS Magic's actual product UI was provided. The marketing-site UI kit is what we have.
