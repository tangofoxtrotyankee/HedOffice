# @hedoffice/harness

Headless test/benchmark scripts.

## `multi-client` (Phase 1 — done)

Spins up N mock MCP clients against one `HedOfficeServer` and proves the Phase 1
exit-gate: isolated per-cubicle state, correct response routing, live inferred
presence, and session cleanup on disconnect.

```sh
pnpm --filter @hedoffice/harness multi-client      # 3 agents (default)
pnpm --filter @hedoffice/harness multi-client 5    # N agents
```

It asserts as it goes and exits non-zero on any failure, so it doubles as a
smoke test.

## Phase 2 (planned)

A voice glass-to-glass latency benchmark (target <800 ms) + barge-in check, once
`packages/audio` exists.

See [docs/ROADMAP.md](../../docs/ROADMAP.md).
