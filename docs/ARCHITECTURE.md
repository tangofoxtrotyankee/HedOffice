# HedOffice — Architecture

HedOffice is **one stateful MCP server**. The office is a *capability surface*:
each external agent is an MCP client that calls HedOffice's tools to read/write
its notebook, manage tasks, and speak/listen. Everything the user sees in a
cubicle is a **projection of a typed, append-only event log** in SQLite.

## Component diagram

```
                ┌──────────────────────── HedOffice (local app) ───────────────────────┐
 BYO Agent A ──▶│  MCP SERVER (Streamable HTTP, stateful)                               │
 (MCP client)   │   • transports map: Mcp-Session-Id → {McpServer, transport, agentId}  │
 BYO Agent B ──▶│   • per-session McpServer instance (state isolation)                  │
 (MCP client)   │   • tools: notebook.*, task.*, channel.*, presence implicit           │
                │                         │                                             │
                │                         ▼                                             │
                │   ORCHESTRATION CORE                                                  │
                │   • Event Log writer/reader (typed, append-only)                      │
                │   • Presence engine (infers status from MCP activity)                 │
                │   • Approval/permission gate (elicitation + policy)                   │
                │   • Audit logger                                                      │
                │                         │                                             │
                │        ┌────────────────┼─────────────────┐                          │
                │        ▼                ▼                 ▼                           │
                │   SQLite (events,   Audio Subsystem   Secrets (OS keychain)           │
                │   projections)      (provider iface)                                  │
                │                     • local: sherpa-onnx (STT/TTS/VAD)                │
                │                     • hosted: ElevenLabs                              │
                │                         │                                             │
                │                         ▼                                             │
                │   REACT UI (office floor, cubicles, notebook, tasks, terminal feed,   │
                │   presence, push-to-talk)  ◀── WebRTC/WebSocket audio + event stream  │
                └───────────────────────────────────────────────────────────────────────┘
```

## HedOffice-as-MCP-server

Using Streamable HTTP in **stateful** mode, the server assigns an
`Mcp-Session-Id` at `initialize` and stores a dedicated `McpServer` + transport
per session in a map (the SDK-documented per-session-instance factory pattern).
This gives **complete state isolation**: agent A's tool calls execute against a
different server instance, bound to a different `agentId`, than agent B's — so
A can never see B's notebook.

A cubicle ⇄ a persistent agent identity ⇄ (currently) one MCP session.

> Community reports (MCP GitHub discussion #1677) show tool-call responses
> occasionally mis-routing when a single server instance is shared — which is
> exactly why we use one instance per session. The Phase 1 harness must cover this.

## Per-agent identity vs. session

Sessions are **ephemeral** (an agent may disconnect/reconnect); the **cubicle is
durable**. We map a stable `agentId` (assigned when the user registers an agent
+ its bearer token) to whatever session is currently live. **All event-log rows
are keyed by `agentId`, not `sessionId`**, so reconnects preserve
notebook/task/transcript history.

## Data model (SQLite)

Use **WAL mode** for concurrent read performance. Events are immutable;
projections are derived and disposable (can always be replayed).

**Source of truth:**
- `events` — append-only typed log. Columns: `event_id` (autoincrement, total
  order), `agent_id`, `stream_id` (e.g. cubicle id), `type`, `payload` (JSON),
  `ts`, `actor` (`user` | `agent` | `system`), `correlation_id`.

**Read-model / projection tables** (rebuilt from events, for fast UI queries):
- `notebooks` (agent_id, content, updated_at)
- `tasks` (id, agent_id, title, status, …)
- `transcripts` (agent_id, turn, role, text, audio_ref)
- `agents` (agent_id, name, token_hash, created_at)
- `presence` (agent_id, status, last_activity)

**Cost (logged in v1, surfaced in v2 Finance):**
- `cost_ledger` (agent_id, ts, model, input_tokens, output_tokens, usd)

## Typed event schema (examples)

Every interaction is an event. Illustrative `type` + `payload`:

- `agent.registered` → `{ agentId, name }`
- `agent.connected` / `agent.disconnected` → `{ agentId, sessionId }`
- `presence.changed` → `{ agentId, from, to, reason }` (e.g. `idle`→`running`, reason `tool_call_inflight`)
- `notebook.written` → `{ agentId, prevHash, newHash, byteLen }`
- `task.created` → `{ taskId, agentId, title }`
- `task.updated` → `{ taskId, agentId, field, old, new }`
- `tool.called` → `{ agentId, tool, argsHash, callId }`
- `tool.result` → `{ agentId, callId, ok, durationMs }`
- `channel.user_spoke` → `{ agentId, transcript, audioRef, sttMs }`
- `channel.agent_said` → `{ agentId, text, ttsMs, voiceId, provider }`
- `approval.requested` / `approval.resolved` → `{ agentId, action, decision }`
- `cost.recorded` → `{ agentId, model, inputTokens, outputTokens, usd }`
- `audit.security_event` → `{ agentId, kind, detail }`

Because routing, departments, and agent-to-agent messages in v2 are just new
event types + a router that subscribes to existing events, the v2 path stays clean.

## Audio subsystem

Embedded local engine: **`sherpa-onnx-node`** — streaming STT
(Zipformer/Moonshine), TTS (Kokoro/Piper/VITS), and Silero VAD in one offline,
CPU-capable native Node addon. Default TTS **Kokoro-82M** (natural, ~2× real-time
on CPU, Apache-2.0) with **Piper** as the ultra-low-latency fallback.

**Pluggable provider abstraction** — two interfaces both engines implement:

```ts
interface SttProvider {
  // streaming: push PCM frames, get incremental + final transcripts
  startStream(opts): SttSession;          // emits 'partial' | 'final'
}
interface TtsProvider {
  synthesize(text, opts): AsyncIterable<AudioChunk>; // streaming chunks
  cancel(): void;                          // REQUIRED for barge-in
}
```

Concrete impls: `LocalSttProvider`/`LocalTtsProvider` (sherpa-onnx) and
`ElevenLabsSttProvider`/`ElevenLabsTtsProvider` (hosted). Provider selection is
config + key presence. The interface **mandates `cancel()`** so barge-in works
identically across providers.

**TTS provider matrix (and where new engines slot in):**

| Provider | Runtime | Hardware | Role |
|---|---|---|---|
| Piper | ONNX / Node addon | CPU | low-latency default |
| Kokoro-82M | ONNX / Node addon | CPU | quality default |
| ElevenLabs | hosted API | none | hosted drop-in (BYO key) |
| **VoxCPM** *(potential)* | Python/PyTorch sidecar | NVIDIA GPU (~8 GB) | premium / voice-cloning, opt-in |

[VoxCPM](https://github.com/OpenBMB/VoxCPM) (Apache-2.0, 48 kHz, 30 languages,
voice cloning) is **TTS-only** and **GPU-bound** — official runtime is PyTorch +
CUDA, RTF ~0.30 on an RTX 4090 — so it can't be the CPU out-of-the-box default,
but it fits the `TtsProvider` slot as an optional premium engine running as a
local Python sidecar over IPC (supports `generate_streaming()`, so per-sentence
streaming + `cancel()` barge-in are feasible). It never replaces STT/VAD. Watch
the community CPU/ONNX ports (`VoxCPM.cpp`, ONNX variants) — if one matures with
usable CPU RTF, revisit it as a higher-quality CPU option.

**Loop:** renderer mic → (WebRTC or local WebSocket) → STT → transcript written
as a `channel.user_spoke` event the agent reads → agent calls `channel.say(text)`
→ TTS → audio streamed back to renderer. **Barge-in:** a VAD monitor runs on the
mic during TTS playback; on speech-start, immediately (a) flush the TTS playback
buffer, (b) call `TtsProvider.cancel()`, (c) emit a turn-change. **Cancel on
first VAD trigger, not on silence-end.**

**Latency budget (local):** target **<800 ms glass-to-glass**, ideally
~500–650 ms. The agent round-trip is BYO/external and outside our control, so
HedOffice **voices the first sentence as soon as it arrives** — stream TTS per
sentence chunk — rather than waiting for the full response.

## v1 tool set

- `notebook.read()` → returns the agent's notebook content.
- `notebook.write({ content })` / `notebook.append({ text })` → persists context/memory.
- `task.create({ title, detail? })`, `task.update({ taskId, status?, detail? })`, `task.list()`.
- `channel.listen({ sinceEventId?, waitMs? })` → returns recent user utterances
  (pulls `channel.user_spoke` events since a cursor); with `waitMs` (≤25 s) it
  **long-polls**, holding until an utterance arrives — near-real-time delivery
  without hammering.
- `channel.say({ text, voiceId? })` → enqueues text for TTS playback (emits `channel.agent_said`).
- `cubicle.status()` → optional, lets the agent read its own presence/task summary.
- `cubicle.brief()` → the agent's onboarding read: its operator-authored
  **charter** (role/boundaries doc, `charter.written` events), its permission
  stage, and how the gated tools behave (docs/INTEGRATION.md).

> **Presence is NOT a tool — it is inferred.** There is deliberately **no
> `presence.set`**.

## Presence inference

The presence engine derives status from MCP activity, without agent cooperation:

- `connected & no recent calls` → **idle**
- `tool call in-flight` (esp. a long `channel.listen` long-poll or a task update) → **running/thinking**
- `received a user utterance but no `channel.say` within N seconds` → **thinking**
- `agent awaits an approval (elicitation pending)` → **blocked**
- `ping fails / transport.onclose` → **offline**

Signals: last-call timestamp, count of in-flight requests on the session,
elicitation/approval state, periodic `ping` (a standard MCP ping should return
in 2–5 s; longer indicates an unhealthy/blocked agent). Each transition emits a
`presence.changed` event the UI subscribes to. Expose **"last activity Xs ago"**
alongside the discrete badge so the user has ground truth.

### State ↔ glyph mapping (5 states)

The five states are the `PresenceStatus` enum in
`packages/schema/src/primitives.ts`; the UI renders each as a distinct glyph +
color + optional motion ([DESIGN.md §presence](DESIGN.md), ADR-009):

| State | Glyph | Inferred from |
|---|---|---|
| `running` | `◉` | tool call in-flight |
| `thinking` | `◐` | user utterance awaiting `channel.say`, or reasoning/streaming |
| `idle` | `○` | connected, no in-flight calls |
| `blocked` | `▓` | elicitation / approval pending |
| `offline` | `·` | `ping` fails / `transport.onclose` |

**Implementation status:** `PresenceEngine` (`packages/core/src/presence.ts`)
infers all five states (Phase 3), with precedence
`offline > blocked > running > thinking > idle`. `thinking` comes from
`ChannelService.userSpoke` (a user utterance awaiting a reply); `blocked` from
the `ApprovalGate` while a mutating tool awaits the human. The schema enum
already included all five, so this was added inference rules, not a schema change.

## How a BYO agent connects (openclaw/Hermes-style)

The external agent adds HedOffice as a Streamable HTTP MCP server with a bearer
header:

```
mcp.servers.hedoffice = {
  url: "http://127.0.0.1:4317/mcp",
  transport: "streamable-http",
  headers: { Authorization: "Bearer <per-agent token from HedOffice>" }
}
```

On connect, the agent issues `initialize`; HedOffice assigns an `Mcp-Session-Id`,
creates a per-session `McpServer` bound to that agent's `agentId`, and the agent
discovers HedOffice's tools. From then on, the agent's own inference loop decides
when to read its notebook, update tasks, listen, or speak — **HedOffice never
runs inference.**
