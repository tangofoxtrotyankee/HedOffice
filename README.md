# HedOffice

A virtual workplace for your AI Agents.

> **Status:** pre-alpha · **Phases 0–2 (headless) complete** — the MCP-server core
> (many isolated agent cubicles + inferred presence) and the voice loop (STT/TTS/
> VAD abstraction, per-sentence streaming, barge-in, <800 ms latency budget) both
> work headlessly. Proofs: `pnpm --filter @hedoffice/harness multi-client` and
> `… voice-loop`. Next: Phase 3 (wire voice ↔ MCP) and on-device audio engines.
> See [`docs/ROADMAP.md`](docs/ROADMAP.md).

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
- [`docs/SECURITY.md`](docs/SECURITY.md) — threat model and v1 security baseline
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — architecture decision records (locked + open)
- [`docs/DEV_SETUP.md`](docs/DEV_SETUP.md) — intended toolchain (planned, not yet wired)

## License

[MIT](LICENSE)
