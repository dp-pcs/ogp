# MEMORY.md

> Persistent long-term memory. Append-only in spirit. Never overwrite from scratch.

## Rules (for the agent)

1. Append new facts; never rewrite the whole file.
2. Organize by section (Facts / Decisions / People / Context). Add sections as needed.
3. If compaction is needed, write to `memory/archives/YYYY-MM-DD-memory.md` first, then reduce.
4. Never use placeholder text. Empty is better than "(to be populated)" — the latter gets misread as "this file is empty, let me start fresh".

## Facts

### Repo Identity
- **Name**: @dp-pcs/ogp (Open Gateway Protocol)
- **Purpose**: Peer-to-peer federation daemon for OpenClaw AI gateways enabling cryptographically signed agent-to-agent messaging without central authority
- **Current Version**: 0.4.2 (shipping daily)
- **Package**: Published to npm as @dp-pcs/ogp
- **Repository**: https://github.com/dp-pcs/ogp

### Tech Stack
- **Language**: TypeScript
- **Runtime**: Node.js 18+
- **Web Framework**: Express
- **WebSocket**: ws library
- **Cryptography**: Ed25519 for signing/verification
- **Build**: TypeScript compiler (tsc)
- **Tests**: Vitest with coverage

### Architecture
- Runs as companion daemon alongside OpenClaw/Hermes instances on separate port
- Multi-framework support: OpenClaw (~/.ogp-openclaw/), Hermes (~/.ogp-hermes/), Standalone (~/.ogp/)
- Default ports: 18790 (OpenClaw), 18793 (Hermes)
- Central meta-config at ~/.ogp-meta/config.json
- LaunchAgent support for macOS automatic startup
- Public tunnel support (cloudflared/ngrok) for internet accessibility

### Key Features
- Cryptographically signed peer-to-peer messaging (Ed25519)
- Peer relationship management (request/approve/reject)
- Message verification and relay to OpenClaw agent
- Agent-comms policies for autonomous agent-to-agent communication
- Rendezvous server for peer discovery and invite codes (optional)
- OGP project collaboration (tool-agnostic cross-peer context sharing)

### Deployment
- Ships daily to npm
- Installs OGP skills to ~/.claude/skills/ and ~/.openclaw/skills/
- Skills version tracking: ogp 2.6.0, ogp-agent-comms 0.6.0, ogp-project 2.2.0 (for 0.4.2 release)

### Recent Work (from context)
- Federation message routing debugging between Apollo@Hermes and Junior@OpenClaw (Apr 8, 2026)
- Exposed token rotation: gateway auth token, hooks token, OGP daemon config (Apr 11, 2026)
- Git history cleanup to remove exposed tokens from CURRENT_WORK.md
- _2026-05-08_: First live remote multi-persona routing proof recorded: `Cosmo` sent a persona-targeted OGP message to David's `atlas` persona over the existing federation and Atlas acknowledged receipt. This is the first confirmed real-gateway evidence in this repo that `--to-agent` reached a non-primary advertised persona.

## Decisions

_2026-04-15_: Agent name chosen as "Relay" — fits the federation/message-routing purpose of OGP.

## People

- **David Proctor** (@lat3ntg3nius on X) — Author, VP of AI Center of Excellence at Trilogy
- **Trilogy AI COE** — Publishing context and methodology at trilogyai.substack.com

## Context

- OGP convergence mentioned in P-HERMES-04: both OpenClaw and Hermes converging on SKILL.md format + OGP compatibility
- Active build phase — code wins over docs when they conflict, file issues on GitHub
- Optimizes for: speed > correctness > cost (per USER.md)

## Artifacts

- _2026-04-30_: Shareable silent OGP overview demo video generated at `artifacts/ogp-overview-video/ogp-overview-demo.mp4` (63.8s, 1920x1080, H.264). Supporting files: `artifacts/ogp-overview-video/storyboard.md`, `artifacts/ogp-overview-video/narration.txt`, `artifacts/ogp-overview-video/slides/`, renderer at `scripts/render-ogp-overview-video.mjs`. Narrative: BGP-style signed scoped federation for AI gateways, covering discovery/approval, trust boundary, scope grants, agent-comms, project intents, multi-framework support, and multi-agent personas.
- _2026-04-30_: Animated cut generated at `artifacts/ogp-overview-video/ogp-overview-demo-animated.mp4` (62.6s, 1920x1080, H.264). Renderer now uses subtle motion on each slide plus directional `xfade` transitions instead of a raw slide concat.
