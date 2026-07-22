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

- [x] pnpm workspace + TS strict config wired
- [x] `packages/schema` — Zod event + tool schemas (compiling)
- [x] `packages/event-store` — SQLite DDL + append-only log (WAL mode); projection
  table DDL defined, population deferred to Phase 1+
- [x] Append/replay tested

**Exit-gate:** ✅ compiling schema package + event store with append/replay
tested (`pnpm -r build && pnpm -r typecheck && pnpm -r test` green; 15 tests).

## Phase 1 — MCP-server-with-many-clients core  (HEADLESS, 2–3 wks)

*De-risk the hardest backend problem first.* Stand up the HedOffice MCP server
(Streamable HTTP, **stateful**) with a `transports`/`servers` map keyed by
`Mcp-Session-Id`, **one `McpServer` per session**. Implement the initial
notebook + task tools. Implement presence inference (last-call time, in-flight
count, ping).

- [x] Stateful Streamable HTTP server, per-session `McpServer` factory
- [x] `notebook.*` and `task.*` tools (+ `cubicle.status`)
- [x] Presence inference engine (no `presence.set` tool)
- [x] Multi-client test harness in `tools/harness`

**Exit-gate:** ✅ `tools/harness` (`pnpm --filter @hedoffice/harness multi-client`)
spins up 3+ mock MCP clients concurrently, each with **isolated** notebook/task
state; tool calls route back to the correct client; sessions clean up on
`transport.onclose`; live presence transitions show in logs. Covered by 13
integration/unit tests (8 core + 5 server).

## Phase 2 — Local voice loop  (HEADLESS, 2–3 wks)

*De-risk the hardest UX problem.* Build the audio pipeline behind the provider
interface: mic → VAD (Silero) → STT (streaming) → text → (to agent) → agent
text → TTS (Kokoro/Piper) → playback, with **barge-in** (VAD-triggered TTS
flush). Wire ElevenLabs as a second provider to prove the abstraction.

- [x] `packages/audio` provider interfaces (`SttProvider`/`TtsProvider`/
  `VadDetector`/`PlaybackSink`) + voice loop with per-sentence streaming
- [x] Barge-in: cancel on first VAD trigger (not silence-end) — tested
- [x] Latency benchmark in `tools/harness` (`voice-loop`) over a modeled clock
- [ ] **On-device (real-hardware task):** `LocalStt/TtsProvider` (sherpa-onnx,
  Kokoro/Piper) + `ElevenLabsTtsProvider`, real mic, measured glass-to-glass on
  the reference laptop. The interfaces + loop are ready; this swaps modeled
  timings for real ones.
- [ ] *(potential)* VoxCPM as an optional GPU TTS provider — Python sidecar over
  IPC, gated on GPU presence (see [ARCHITECTURE.md](ARCHITECTURE.md) provider
  matrix). Not a dependency; default stays Kokoro/Piper.

**Exit-gate:** ✅ headless "talk to an echo agent" demo
(`pnpm --filter @hedoffice/harness voice-loop`) with per-stage glass-to-glass
latency under the **<800 ms** budget (Piper-profile ~395 ms, Kokoro-profile
~720 ms, *modeled*) and barge-in interrupting on first VAD trigger. 11 tests.
*Real measured latency on hardware is the on-device task above.*

## Phase 3 — Integration spine  (1–2 wks)

Connect the voice loop to the MCP layer: voice input becomes an event the agent
reads (`channel.listen`), and the agent's reply (via `channel.say`) is voiced
back. Full audit logging + approval-gate (elicitation) for sensitive tools.

- [x] `channel.listen` / `channel.say` tools (core `ChannelService`) bridging the
  voice loop and the agent
- [x] Audit logging of every tool call / result / approval (`tool.called`,
  `tool.result`, `approval.requested`, `approval.resolved`, `audit.security_event`)
- [x] Approval gate (`ApprovalGate`) for record-mutating tools — per-agent/tool
  policy, **default `prompt`, never `auto`**; `channel.say` is *not* gated
  (conversation, not a record mutation)
- [x] `PresenceEngine` extended to the full **5-state** model: `thinking` (user
  utterance awaiting reply) and `blocked` (approval pending), with precedence
  `offline > blocked > running > thinking > idle`

**Exit-gate:** ✅ headless integration harness
(`pnpm --filter @hedoffice/harness integration`): speak into a cubicle → a BYO
MCP client hears it (`channel.listen`), replies (`channel.say`) and the reply is
voiced (glass-to-glass ~395 ms), while a mutating tool passes through the human
approval gate — all captured in the event log. 25 tests (16 core + 9 server).
*Note:* the gate's human surface is the UI in Phase 4 (MCP elicitation / approval
modal); the gate logic + audit are done here. Voicing a **real** agent end-to-end
also needs the on-device audio engines (Phase 2 on-device item).

## Phase 4 — Office UX (React)  (3–4 wks)

Build the spatial UI to the **[Visual Design System](DESIGN.md)** — a "warm
mission-control TUI": a character-cell grid, box-drawing cubicles, glyph-based
presence, and the warm cream/charcoal + hero-orange palette. Sequenced *after*
the headless Phases 2–3 (UI last). Follows the design plan's four build stages,
each with its own benchmark gate:

- **Stage 1 — Prove the core:** ✅ character-cell grid, light + dark token files
  ([DESIGN.md §tokens](DESIGN.md)), JetBrains Mono at the type scale, floor view +
  **at-rest cubicles** with the 5 presence glyphs (`apps/desktop`, Vite + React).
  *Gate met:* the floor reads clearly in **grayscale** / plain text — status is
  glyph-distinct (`pnpm --filter @hedoffice/desktop preview-floor`); box-drawing
  aligns on a fixed 27-cell grid at `--lh-box` (1.15). 7 geometry tests; the app
  builds and includes a light/dark toggle + a grayscale check.
- **Stage 2 — Walk in:** ✅ click a cubicle to expand into a heavy-bordered
  workspace (Notebook / Tasks / Terminal / Talk) in a rounded modal; terminal feed
  as a dark inset with colored verb glyphs, blinking cursor + typewriter reveal;
  talk panel with a level meter; and the **approval-gate modal** surfacing the
  Phase 3 gate.
  *Gate met:* the approval box reads unmistakably in monochrome (verbatim action +
  ✓/✗ glyph-coded choices — `pnpm --filter @hedoffice/desktop preview-walkin`);
  all motion respects `prefers-reduced-motion`. 6 panel tests.
- **Stage 3 — Warmth & polish:** ✅ slow per-state status motion (pulse / spin /
  attention; `idle`/`offline` static), hover/focus lifts, the opt-in scanline
  toggle, the numbered **department rail** (with floor filtering) and the rounded
  **bottom control bar** with invert-on-active toggle chips.
  *Gate met:* the only continuous motion is the feed cursor + slow status glyphs
  (calm); `prefers-reduced-motion` removes all of it. 3 rail/motion tests.
- **Stage 4 — v2 scaffolding (additive):** ✅ double-line `╔═╗` department rooms
  and rounded `╭─╮` informal rooms (`Room`), tee-joined wall boards
  (`╠═ board ═╣`), and agent-to-agent connector glyphs (`├─▶`, `╪`) — container
  styles only (`room.ts`), toggled in the UI.
  *Gate met:* the v2 preview composes the **unchanged** v1 `CubicleCard` inside v2
  rooms (`pnpm --filter @hedoffice/desktop preview-rooms`) — zero token/cubicle
  changes. 4 room tests.

**Phase 4 exit-gate:** ✅ the full single-agent office experience — floor, walk-in,
warmth/motion, and the v2-ready container grammar — all to the Visual Design
System. Runs in the browser via Vite; the shell wraps it at Phase 5.

> The desktop shell framework (Electron vs Tauri) is **deferred** — see
> [DECISIONS.md ADR-005](DECISIONS.md). Stages 1–3 run in the browser via Vite
> and depend on no shell APIs; the shell must be chosen before packaging/release
> (and for `safeStorage`-backed secrets, Phase 5).

**Exit-gate:** the full single-agent office experience, built to
[DESIGN.md](DESIGN.md) (Stages 1–3 complete; Stage 4 is v2 prep).

## Phase 5 — Hardening & release  (2 wks)

Threat-model pass, secret-storage audit, tool-permission gates, packaging
(installers), docs, GitHub open-source release.

> **Superseded/expanded:** Phase 5's full requirement set (R5.1–R5.6), testing
> plan (including three new adversarial harness proofs) and exit gate now live
> in **[ROADMAP_PHASES_5-10.md](ROADMAP_PHASES_5-10.md)**, which extends this
> roadmap through Phase 10. The checklist below remains as the running status.

- [x] **Desktop shell — Electron** (ADR-005 locked): main process runs core + MCP
  server, exposes read-models to a sandboxed renderer over a typed IPC contract;
  `electron:dev` launch path. (`apps/desktop/electron/`)
- [x] **Secret storage:** `SecretStore` interface + `ElectronSecretStore`
  (`safeStorage`, encrypted userData file, no plaintext fallback); main-process only.
- [x] **Approval gate ↔ renderer IPC:** the renderer's `ApprovalModal` is now the
  real human gate — an `ApprovalBridge` forwards pending approvals to the modal and
  resolves the gate on the user's decision; the floor refreshes on every event.
- [x] **Audio providers scaffolded:** `ElevenLabsTtsProvider` (streaming + cancel,
  unit-tested against a fake socket) + `selectTtsProvider` policy + sherpa-onnx
  `Local*Provider` skeletons. On-device wiring + real latency is a dev-machine task
  ([TESTING.md §4](TESTING.md)).
- [x] **Threat model** (STRIDE, R5.1): six threat areas with cited
  mitigations/gaps + a ranked 18-fix list ([SECURITY.md](SECURITY.md)).
- [x] **Session hardening** (R5.2, Prompt 5B): idle-timeout expiry, origin-change
  replay rejection with a `security.violation` event, and an optional
  per-request bearer re-check (`HEDOFFICE_REQUIRE_TOKEN=1`) — plus the
  fail-closed approval gate, per-field input caps, constant-time token
  comparison, `chmod 0600` on the DB, and the hosted origin allowlist.
- [x] **Kill switch** (R5.6, Prompt 5C): global `killAll`/`liftKill` and
  per-cubicle `suspend`/`resume`, event-sourced so the CLI and a live server
  agree, wired to admin endpoints + the CLI. New adversarial harness:
  `pnpm --filter @hedoffice/harness security`.
- [ ] On-device audio: implement the sherpa-onnx bodies + measure glass-to-glass
- [ ] Packaging (`electron-builder`) + installers, docs, OSS release
- [ ] Remaining hardening (tracked in [SECURITY.md](SECURITY.md)): rate limiting
  (F4), SSE ticket (F10), helmet/CSP/CORS (F16), renderer IPC token (F18)

**Exit-gate:** v1.0. *(Electron packaging + on-device audio require a real
desktop/display, so they're built here and verified on a developer machine.)*

---

## Phases 6–10 — From pre-alpha to the AI-native business

Defined in full in **[ROADMAP_PHASES_5-10.md](ROADMAP_PHASES_5-10.md)**
(requirements, testing, exit gates, build prompts). In brief:

- **Phase 6 — Company Library:** the governance library formalised — fixed
  layout, `charters/self`, hash manifest, `library.written` (prev→new hash) /
  `library.proposal` event flow. **Code done** (`library://…` MCP resources,
  the `library.propose` → approve/reject flow via admin API + CLI, proofs in
  `packages/mcp-server/src/library-resources.test.ts`). *Remaining (MD, Prompt
  6C): author the real `constitution.md` / `ethics.md` and seed the layout.*
- **Phase 7 — Staged Permissions Enforcement:** the five-stage ladder
  (Observe → Draft → Recommend → Queue → Execute) enforced server-side per tool
  call; migrates the current `observe`/`supervised`/`autonomous` stages.
- **Phase 8 — Inter-Cubicle Routing:** thin v2 slice — point-to-point typed
  routes, inboxes, handoffs, thread view; no rooms, no broadcast.
- **Phase 9 — External Event Intake:** HMAC-verified webhooks (LeadLocator,
  Stripe, email) normalised into the log and routed by MD-owned decision trees,
  quarantined as untrusted content.
- **Phase 10 — Division Pilot:** 30 days of real workflows, promotion by
  evidence, weekly ops review, written verdict.

## Benchmark gates (these change the plan)

- **Audio:** if **warm local glass-to-glass > ~1 s** on the reference laptop →
  make **Piper** the default and prompt for a hosted provider.
- **MCP isolation:** if the Phase 1 harness **can't cleanly isolate/route 3+
  concurrent clients** → escalate to a **process-per-agent** model before
  proceeding.
- **Event schema:** if v2 routing would require reshaping events → revisit the
  schema **before** UI work, not after.
