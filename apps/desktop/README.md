# @hedoffice/desktop

The React spatial UI — a **"warm mission-control TUI"** (office floor, box-drawing
cubicles, walk-in interaction, notebook/task panels, live terminal feed,
glyph-based presence, push-to-talk / open-mic) — and the desktop shell. Lands in
**Phase 4**, built to the full spec in [docs/DESIGN.md](../../docs/DESIGN.md).

Phase 4 follows the design plan's four build stages (see
[docs/ROADMAP.md](../../docs/ROADMAP.md)):

1. **Prove the core** — character-cell grid, light/dark tokens, floor + at-rest
   cubicle with the 5 presence glyphs (must read in grayscale + 16-color first).
2. **Walk in** — expanded cubicle, terminal feed (blinking cursor + typewriter),
   approval-gate modal.
3. **Warmth & polish** — hover/focus + slow status motion, opt-in scanlines,
   department rail + rounded bottom bar.
4. **v2 scaffolding** — double-line rooms, tee-joined wall boards, connectors
   (additive container styles only).

> **Shell framework (Electron vs Tauri) is DEFERRED** — see
> [docs/DECISIONS.md ADR-005](../../docs/DECISIONS.md). Headless Phases 0–3 must
> not depend on shell APIs.

_Placeholder — no code yet._
