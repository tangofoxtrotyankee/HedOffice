# HedOffice — Architecture Decision Records

Lightweight ADR log. Each record states the decision, its status, and the
reasoning. **Locked** decisions are settled for v1; **deferred/open** decisions
are tracked here so code increments know what not to assume.

---

## ADR-001 — Event log as the source of truth · **Locked**

A typed, append-only `events` table in SQLite is the single source of truth;
all UI-facing tables (`notebooks`, `tasks`, `transcripts`, `presence`, …) are
**disposable projections** rebuilt from events.

**Why:** it is the single most important decision for keeping v2 cheap —
departments, agent-to-agent messaging, and the Finance view all become
projections/routers over existing events, not a re-architecture. Adopt from
commit #1.

## ADR-002 — Per-session `McpServer` factory for state isolation · **Locked**

Run the server in **stateful** Streamable HTTP mode; create **one `McpServer` +
transport per session**, keyed by `Mcp-Session-Id`, stored in a `transports`
map; tear down on `transport.onclose`.

**Why:** complete state isolation between agents (A can't see B's notebook). A
single shared instance has documented response mis-routing (MCP discussion
#1677). **Escalation:** if the Phase 1 harness can't cleanly isolate/route 3+
concurrent clients, move to a **process-per-agent** model.

## ADR-003 — Presence is inferred, never self-reported · **Locked**

Presence (idle / thinking / running / blocked / offline) is derived from MCP
activity (last-call time, in-flight count, elicitation state, `ping`). There is
deliberately **no `presence.set` tool**.

**Why:** works with uncooperative/untrusted BYO agents; no agent cooperation
required. **Caveat:** heuristic — a deliberately-idle agent can look stuck.
Mitigate with thresholds + `ping`, and always expose "last activity Xs ago"
alongside the badge.

## ADR-004 — Core stack · **Locked**

TypeScript/Node + React. `@modelcontextprotocol/sdk` **v1.x** (Streamable HTTP,
stateful), Zod schemas shared between MCP tool defs and the event log.
`better-sqlite3` (synchronous, WAL mode) as event store + projections.
**sherpa-onnx** for embedded local STT/TTS/VAD; **Kokoro-82M** default TTS,
**Piper** low-latency fallback; ElevenLabs as the hosted provider example.

**Why:** the most mature MCP SDK; offline CPU-capable audio with no extra server
process; simplest path for an event-sourced local app. **Pin SDK versions** and
isolate transport/auth behind adapters — the next spec RC (2026-07-28) and a v2
SDK are announced, not shipped.

## ADR-005 — Desktop shell (Electron vs Tauri) · **DEFERRED**

The shell framework is **not chosen yet**. Lean **Electron** for v1
(`safeStorage`, mature native-module support, simplest path to bundle SQLite +
audio addons), accepting the larger bundle (~150–300 MB RAM / 100 MB+ installer
vs Tauri's ~30–50 MB / sub-10 MB). Tauri is the lighter alternative but adds
native-module/WebView friction.

**Constraint:** headless Phases 0–3 **must not depend on shell APIs.** Isolate
secret storage behind an interface (a plain Node keychain impl for headless dev;
the shell's `safeStorage` impl wired in at Phase 4). **Revisit and decide before
Phase 4.**

## ADR-006 — Local audio transport (WebRTC vs WebSocket) · **Open until Phase 2**

Lean **WebRTC** for the renderer↔audio path: the browser stack gives free echo
cancellation (AEC), noise suppression, and AGC, and it future-proofs for v2
multi-party rooms. A plain **WebSocket** (or in-shell IPC) path is an acceptable
simpler fallback for the single-user local case.

**Decide during Phase 2** based on the measured latency/quality trade-off on the
reference machine.
