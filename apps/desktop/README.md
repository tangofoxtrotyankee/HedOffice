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
> [docs/DECISIONS.md ADR-005](../../docs/DECISIONS.md). Stages 1–3 run in the
> browser via Vite and use no shell APIs; the shell wraps this later.

## Status: **Stages 1–2 — done**

- **Stage 1** — floor view with at-rest cubicles + the 5 presence glyphs,
  light/dark tokens (`tokens.css`), JetBrains Mono. Cubicle geometry is pure
  (`cubicle.ts`), shared by the UI and a headless ASCII preview.
- **Stage 2** — "walk in": click a cubicle → expanded workspace (Notebook / Tasks /
  Terminal / Talk) in a heavy-bordered rounded modal; terminal feed (dark inset,
  colored verb glyphs, blinking cursor + typewriter); talk meter; and the
  **approval-gate modal** (`ApprovalModal`). Panel formatting is pure (`panel.ts`).

```sh
pnpm --filter @hedoffice/desktop dev             # Vite dev server (127.0.0.1:4318)
pnpm --filter @hedoffice/desktop preview-floor   # floor as text (grayscale proof)
pnpm --filter @hedoffice/desktop preview-walkin  # feed + approval box as text
pnpm --filter @hedoffice/desktop test            # geometry + panel tests
pnpm --filter @hedoffice/desktop build           # production bundle
```

Next: Stage 3 (warmth & polish — status motion, scanline toggle, department rail +
bottom bar).
