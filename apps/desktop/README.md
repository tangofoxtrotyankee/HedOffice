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

## Status: **Phase 4 complete (Stages 1–4)**

- **Stage 1** — floor view with at-rest cubicles + the 5 presence glyphs,
  light/dark tokens (`tokens.css`), JetBrains Mono. Cubicle geometry is pure
  (`cubicle.ts`), shared by the UI and a headless ASCII preview.
- **Stage 2** — "walk in": click a cubicle → expanded workspace (Notebook / Tasks /
  Terminal / Talk) in a heavy-bordered rounded modal; terminal feed (dark inset,
  colored verb glyphs, blinking cursor + typewriter); talk meter; and the
  **approval-gate modal** (`ApprovalModal`). Panel formatting is pure (`panel.ts`).
- **Stage 3** — warmth & polish: slow per-state status motion (`rail.ts`
  `PRESENCE_MOTION`), the numbered department rail (`DepartmentRail`, filters the
  floor), the rounded bottom control bar with invert-on-active toggle chips, and
  an opt-in scanline overlay. All motion respects `prefers-reduced-motion`.
- **Stage 4** — v2 scaffolding (additive): `Room` (double-line department /
  rounded informal) with tee-joined wall boards + connector glyphs (`room.ts`),
  composing the **unchanged** `CubicleCard` — toggle "╔ Rooms (v2)" in the bar.

```sh
pnpm --filter @hedoffice/desktop dev             # Vite dev server (127.0.0.1:4318)
pnpm --filter @hedoffice/desktop preview-floor   # floor as text (grayscale proof)
pnpm --filter @hedoffice/desktop preview-walkin  # feed + approval box as text
pnpm --filter @hedoffice/desktop preview-rooms   # v1 cubicles inside v2 rooms
pnpm --filter @hedoffice/desktop test            # geometry + panel + room tests
pnpm --filter @hedoffice/desktop build           # production bundle
```

## Electron shell (ADR-005 — Electron)

The main process (`electron/`) runs `@hedoffice/core` + the MCP server and exposes
the read-models to the renderer over a typed IPC contract; the renderer stays
sandboxed (`contextIsolation`, no `nodeIntegration`) and imports only pure view
types. Secrets sit behind a `SecretStore` — `ElectronSecretStore` (`safeStorage`)
in prod, `InMemorySecretStore` in dev/tests.

- `src/shell/ipc-contract.ts` — the IPC channels + `window.hedoffice` API (browser-safe).
- `electron/handlers.ts` — IPC handlers over an `Office` (unit-tested headlessly).
- `electron/secrets.ts` / `secrets-electron.ts` — secret storage.
- `electron/main.ts` / `preload.ts` — Electron glue (typechecked; launched via
  `electron:dev`, not CI). Packaging: `electron-builder.yml` + `npx electron-builder`.

> Electron can be typechecked + the main-process logic unit-tested here, but it
> can't be launched headlessly (no display). The renderer (`pnpm dev`) and the
> previews run anywhere.

Next: surface live `channel.*`/approval events to the renderer over IPC (the
approval modal → real gate), and the on-device audio engines.
