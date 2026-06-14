# harness

Headless test/benchmark scripts:
- **Phase 1:** spin up 3+ mock MCP clients concurrently; prove isolated
  notebook/task state, correct response routing, session cleanup on
  `onclose`, and live presence in logs.
- **Phase 2:** measure voice glass-to-glass latency (target <800 ms) and
  verify barge-in.

_Placeholder — no code yet. See [docs/ROADMAP.md](../../docs/ROADMAP.md)._
