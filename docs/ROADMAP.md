# HedOffice — Roadmap

Phased build plan for v1. Each phase has a **deliverable** and an **exit-gate**
that must pass before moving on. The ordering is deliberate: **de-risk first,
UI last.** The two hardest problems — the local voice loop and one MCP server
fanning out to many isolated agent clients — are built and proven as headless
spikes (Phases 1–2) before any React work.

> Phases 0–3 are **headless**. Do not write UI code until the many-client MCP
> core (Phase 1) and the measured voice loop (Phase 2) are independently proven.

---

## Phase 0 — Foundations & contracts  (1–2 wks)

Monorepo (pnpm workspaces), TypeScript strict. **Zod schemas as the single
source of truth** for both MCP tool inputs and the event schema. Define the
typed event-log schema and the SQLite DDL.

- [ ] pnpm workspace + TS strict config wired
- [ ] `packages/schema` — Zod event + tool schemas (compiling)
- [ ] `packages/event-store` — SQLite DDL + append-only log + projections (WAL mode)
- [ ] Append/replay tested

**Exit-gate:** compiling schema package + empty event store with append/replay
tested.

## Phase 1 — MCP-server-with-many-clients core  (HEADLESS, 2–3 wks)

*De-risk the hardest backend problem first.* Stand up the HedOffice MCP server
(Streamable HTTP, **stateful**) with a `transports`/`servers` map keyed by
`Mcp-Session-Id`, **one `McpServer` per session**. Implement the initial
notebook + task tools. Implement presence inference (last-call time, in-flight
count, ping).

- [ ] Stateful Streamable HTTP server, per-session `McpServer` factory
- [ ] `notebook.*` and `task.*` tools
- [ ] Presence inference engine (no `presence.set` tool)
- [ ] Multi-client test harness in `tools/harness`

**Exit-gate:** a CLI/script spins up **3+ mock MCP clients** concurrently, each
with **isolated** notebook/task state; tool calls route back to the correct
client; sessions clean up on `transport.onclose`; live presence shows in logs.

## Phase 2 — Local voice loop  (HEADLESS, 2–3 wks)

*De-risk the hardest UX problem.* Build the audio pipeline behind the provider
interface: mic → VAD (Silero) → STT (streaming) → text → (to agent) → agent
text → TTS (Kokoro/Piper) → playback, with **barge-in** (VAD-triggered TTS
flush). Wire ElevenLabs as a second provider to prove the abstraction.

- [ ] `packages/audio` provider interfaces + local impl (sherpa-onnx)
- [ ] Barge-in: cancel on first VAD trigger (sub-100 ms target)
- [ ] ElevenLabs provider as second implementation
- [ ] Latency benchmark script in `tools/harness`

**Exit-gate:** a headless "talk to an echo agent" demo with **measured
glass-to-glass latency** and working interruption. Target **<800 ms**, ideally
~500–650 ms.

## Phase 3 — Integration spine  (1–2 wks)

Connect the voice loop to the MCP layer: voice input becomes an event the agent
reads (`channel.listen`), and the agent's reply (via `channel.say`) is voiced
back. Full audit logging + approval-gate (elicitation) for sensitive tools.

- [ ] `channel.listen` / `channel.say` tools wired to the audio subsystem
- [ ] Audit logging of every tool call / result / approval
- [ ] Elicitation-based approval gate (default `prompt`, never `auto`)

**Exit-gate:** speak into a cubicle and a **real BYO agent** (e.g. an
openclaw-style client) responds in voice.

## Phase 4 — Office UX (React)  (3–4 wks)

Now build the spatial UI: office floor view, cubicles, walk-in interaction,
notebook/task panels, live terminal feed (event stream), presence avatars,
push-to-talk + open-mic modes.

> The desktop shell framework (Electron vs Tauri) is **deferred** — see
> [DECISIONS.md ADR-005](DECISIONS.md). It must be chosen before this phase.

**Exit-gate:** the full single-agent office experience.

## Phase 5 — Hardening & release  (2 wks)

Threat-model pass, secret-storage audit, tool-permission gates, packaging
(installers), docs, GitHub open-source release.

**Exit-gate:** v1.0.

---

## Benchmark gates (these change the plan)

- **Audio:** if **warm local glass-to-glass > ~1 s** on the reference laptop →
  make **Piper** the default and prompt for a hosted provider.
- **MCP isolation:** if the Phase 1 harness **can't cleanly isolate/route 3+
  concurrent clients** → escalate to a **process-per-agent** model before
  proceeding.
- **Event schema:** if v2 routing would require reshaping events → revisit the
  schema **before** UI work, not after.
