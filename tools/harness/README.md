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

## `voice-loop` (Phase 2 — done)

Drives the voice loop with synthetic providers; prints the modeled glass-to-glass
latency (Piper/Kokoro profiles, both <800 ms) and demonstrates barge-in.

```sh
pnpm --filter @hedoffice/harness voice-loop
```

## `integration` (Phase 3 — done)

The integration spine: speak into a cubicle → a live BYO MCP client hears it
(`channel.listen`), replies (`channel.say`) and the reply is voiced, while a
record-mutating tool passes through the human approval gate — all captured in the
event log.

```sh
pnpm --filter @hedoffice/harness integration
```

## Phase 4+ (planned)

Real on-device audio benchmarking (sherpa-onnx) once those providers land.

See [docs/ROADMAP.md](../../docs/ROADMAP.md).
