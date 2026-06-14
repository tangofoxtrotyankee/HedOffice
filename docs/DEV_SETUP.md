# HedOffice — Dev Setup (planned)

> **Phase 0 code has landed.** The `schema` and `event-store` packages build,
> typecheck, and test. The commands below work. Later packages (`mcp-server`,
> `audio`, `core`, `desktop`, `harness`) are still skeletons.
>
> Note: pnpm blocks native postinstall scripts by default. `better-sqlite3` and
> `esbuild` are allowlisted via `onlyBuiltDependencies` in `pnpm-workspace.yaml`,
> so `pnpm install` builds the native SQLite addon automatically.

## Intended toolchain

- **Node.js** ≥ 20 LTS
- **pnpm** workspaces (monorepo)
- **TypeScript** strict mode
- **Zod** — schemas shared between MCP tool defs and the event log
- **better-sqlite3** (WAL mode) — event store + projections
- **@modelcontextprotocol/sdk** v1.x (pinned) — Streamable HTTP, stateful
- **sherpa-onnx-node** — local STT/TTS/VAD (Phase 2)

## Intended layout

See the skeleton under `packages/`, `apps/`, and `tools/`. Each leaf directory
has a `README.md` noting its purpose and the phase it lands in.

```
packages/
  schema/        Zod event + tool schemas                    (Phase 0)
  event-store/   better-sqlite3 append-only log + projections (Phase 0)
  mcp-server/    stateful Streamable HTTP MCP server          (Phase 1)
  audio/         Stt/Tts provider abstraction + impls         (Phase 2)
  core/          presence engine, approval gate, audit        (Phase 1–3)
apps/
  desktop/       React UI + shell — framework DEFERRED        (Phase 4)
tools/
  harness/       mock multi-client + latency benchmark        (Phase 1–2)
```

## Commands

```sh
pnpm install          # installs deps + builds the better-sqlite3 native addon
pnpm -r build         # tsc build, topological order
pnpm -r typecheck     # tsc --noEmit
pnpm -r test          # vitest
pnpm check            # build + typecheck + test
```

Run the headless proofs:

```sh
pnpm --filter @hedoffice/harness multi-client      # Phase 1: N isolated agents + presence
pnpm --filter @hedoffice/harness voice-loop        # Phase 2: echo-agent voice loop + barge-in
pnpm --filter @hedoffice/harness integration       # Phase 3: voice ↔ MCP ↔ approval gate
pnpm --filter @hedoffice/harness floor-view        # Live data: floor rendered from the event log
pnpm --filter @hedoffice/desktop preview-floor     # Phase 4 Stage 1: floor view as text
pnpm --filter @hedoffice/desktop preview-walkin    # Phase 4 Stage 2: feed + approval box as text
pnpm --filter @hedoffice/desktop preview-rooms     # Phase 4 Stage 4: v1 cubicles inside v2 rooms
pnpm --filter @hedoffice/desktop dev               # …or the live UI (Vite, 127.0.0.1:4318)
```

## Next increment

Phases 0–4 are complete, live data renders from the event log, and the **Electron
shell** (ADR-005) is scaffolded: the main process (`apps/desktop/electron/`) runs
core + the MCP server and feeds the sandboxed renderer over a typed IPC contract,
with `safeStorage`-backed secrets. What remains:
- **Renderer ↔ live events:** surface `channel.*` + approval requests to the
  renderer over IPC so the approval modal drives the real gate.
- **On-device audio:** implement `LocalStt/TtsProvider` (sherpa-onnx) + the
  ElevenLabs provider behind the Phase 2 interfaces; measure real glass-to-glass.
- **Phase 5 finish:** threat-model pass, packaging (`electron-builder`) +
  installers, and the OSS release. (Electron/audio need a real desktop to launch
  — built here, verified on a dev machine.) See [ROADMAP.md](ROADMAP.md).
