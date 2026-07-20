# HedOffice

A virtual workplace for your AI Agents.

> **Status:** pre-alpha · **Phases 0–4 complete; Phase 5 underway** — the
> MCP-server core (isolated cubicles + 5-state presence), the voice loop (STT/TTS/
> VAD abstraction, barge-in, <800 ms budget), the integration spine (voice ↔
> `channel.*` ↔ approval gate + audit), and the full "warm mission-control TUI"
> (floor, walk-in, warmth/motion, v2-ready rooms) all work, now rendered from live
> event-log data and wrapped in an **Electron shell** (ADR-005) with
> `safeStorage`-backed secrets. Remaining: on-device audio engines + Phase 5
> finish (threat model, packaging, release). Proofs:
> `pnpm --filter @hedoffice/harness multi-client` /
> `… voice-loop` / `… integration`, and
> `pnpm --filter @hedoffice/desktop preview-floor` / `… preview-walkin` /
> `… preview-rooms` (or `dev` for the live UI). See
> [`docs/ROADMAP.md`](docs/ROADMAP.md).

## What is HedOffice?

HedOffice is an open-source, **local-first** agent-orchestration app with an
office-style spatial UX. You bring your own (BYO) external agents; HedOffice
gives each one a **cubicle** — a persistent workspace with a notebook, task
list, terminal/observability feed, presence indicator, and a voice + text
channel.

The core architectural idea:

- **HedOffice is a single stateful [MCP](https://modelcontextprotocol.io) server.**
  Your external agents connect to it as **MCP clients** (Streamable HTTP
  transport).
- **One cubicle = one isolated MCP session**, keyed by `Mcp-Session-Id`. Each
  agent gets a dedicated server instance, so agent A can never see agent B's
  notebook.
- **Everything is a projection of a typed, append-only event log** stored in
  SQLite — the single source of truth. The voice loop runs **fully local**
  (embedded STT/TTS/VAD) out of the box, with a pluggable provider layer for
  hosted alternatives.
- HedOffice **never runs inference** — the agent's own loop decides when to
  read its notebook, update tasks, listen to the user, or speak.

## v1 scope

**In scope (single-user, single-agent cubicles):**
- One human user (the MD). N independent cubicles, each bound to exactly one BYO agent.
- Per-cubicle notebook, tasks, terminal feed, inferred presence, voice + text channel.
- Native local audio out of the box + pluggable provider layer (ElevenLabs as hosted example).
- BYO provider keys, stored in the OS keychain.
- Typed append-only event log (incl. per-agent token/cost logging) from day one.

**Deferred to v2:**
- Multi-agent rooms / departments, shared boards, agent-to-agent messaging,
  coordinator agents, multi-user roles, and the Finance *view* (cost data is
  *logged* in v1).

The design principle: **v1 captures everything as structured events so v2's
multi-agent layer is mostly routing pre-existing events**, not a re-architecture.

## Documentation

- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased build plan with deliverables and exit-gates
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components, data model, event schema, tools, presence
- [`docs/DESIGN.md`](docs/DESIGN.md) — the visual design system ("warm mission-control TUI"): palette, type, box-drawing layout, presence glyphs, tokens
- [`docs/INTEGRATION.md`](docs/INTEGRATION.md) — linking a BYO (Hermes/OpenClaw-style) agent: registration, charters, staged permissions, the `hermes-link` check
- [`docs/SECURITY.md`](docs/SECURITY.md) — threat model and v1 security baseline
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — architecture decision records (locked + open)
- [`docs/DEV_SETUP.md`](docs/DEV_SETUP.md) — toolchain, commands, and the headless proofs
- [`docs/TESTING.md`](docs/TESTING.md) — manual / on-device QA checklist (what CI can't verify)
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — optional cloud deploy on Railway: the MCP server **plus the office UI in the browser** (floor, walk-in panels, live approvals at `https://<app>/`)

## License

[MIT](LICENSE)
