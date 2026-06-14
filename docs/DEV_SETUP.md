# HedOffice — Dev Setup (planned)

> **Nothing here is wired up yet.** This repo is at Phase 0 (bootstrap): docs +
> an empty monorepo skeleton. This file records the *intended* toolchain so the
> first code increment has a target. Commands below will not work until the
> Phase 0 code lands.

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

## Planned first commands (once Phase 0 code lands)

```sh
pnpm install
pnpm -r build
pnpm -r test
```

## Next increment

Phase 0 code: `packages/schema` (Zod) + `packages/event-store` (better-sqlite3
append/replay, WAL) with tests, plus pnpm workspace wiring. See
[ROADMAP.md](ROADMAP.md).
