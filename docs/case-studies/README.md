# OGP Development Case Studies

This directory contains sanitized debugging notes from real-world OGP development and deployment challenges. These documents capture the messy reality of building federated AI systems — including the false starts, red herrings, and lessons learned.

> **⚠️ Note:** These files are sanitized versions of internal debugging notes. System-specific details (file paths, PIDs, API key fragments, port numbers) have been removed or generalized to protect operational security while preserving the technical narrative.

---

## Contents

| File | Description |
|------|-------------|
| `OpenClaw_Stability_Fix_Summary.md` | Comprehensive analysis of OpenClaw 2026.4.5 regression bugs encountered during OGP development. Includes root cause analysis, mitigations, and wrapper script implementation. |
| `CRASH_RESOLUTION_20260407.md` | Quick reference guide for the same stability issues — condensed version for immediate action. |
| `crash_observations.md` | Raw timeline and observations from the debugging session. Shows the iterative process of elimination that ultimately cleared OGP of suspicion. |
| `OpenClaw_Hermes_Status_Report_20260407.md` | Comparative analysis of OpenClaw vs. Hermes gateway stability during federation testing. Includes fact-check of an AI-drafted article that was substantially wrong. |

---

## Context

These documents were created on April 7, 2026, during intensive OGP federation testing. The initial hypothesis was that OGP's dual-assistant setup (OpenClaw + Hermes) was causing gateway instability. **The reality:** OpenClaw 2026.4.5 had known regression bugs affecting all users.

**Key Lesson:** When debugging complex systems, correlation is not causation. The OGP work exposed OpenClaw bugs faster due to higher load, but didn't create them.

---

## Related Article

The debugging narrative behind these files is documented in:

**"[Case Study] When Your AI Tools Keep Crashing: A Meta-Debugging Loop with OpenClaw and Claude"**

This Substack article tells the story of using Claude (via Dispatch) to diagnose OpenClaw crashes while OpenClaw was down, then using OpenClaw/Claude Code to fix OGP bugs, then back to Claude when OpenClaw crashed again — a meta-loop that became the only way forward.

---

**Why These Are Here:**

The article promised these files would be "available in dp-pcs/ogp." Rather than leave them as unverified claims, we're publishing the sanitized source material. Real debugging is messy. Real systems fail in unexpected ways. Federation requires resilience not just in protocol design, but in the development process itself.
