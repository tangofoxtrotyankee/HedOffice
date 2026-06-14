# @hedoffice/core

Orchestration core: owns the event store and ties together agent registration,
per-cubicle notebook/task state, the voice/text channel, the approval gate, and
presence inference. Holds no MCP concerns, so it is testable headlessly. Status:
**Phases 1 & 3 — implemented.**

## Contents

- `office.ts` — `Office` facade: `store`, `agents`, `cubicles`, `presence`.
- `agents.ts` — `AgentRegistry`: mints a per-agent bearer token (only the
  SHA-256 hash is persisted) and resolves a presented token to its `agentId`.
- `cubicle.ts` — `CubicleState`: notebook read/write/append + task
  create/update/list, all scoped to one `agentId` (cubicle isolation). Notebook
  content lives in the `notebooks` projection; the log records `notebook.written`
  integrity hashes. Tasks are fully event-sourced.
- `presence.ts` — `PresenceEngine`: infers the **5-state** model
  (`offline > blocked > running > thinking > idle`) from MCP activity and emits
  `presence.changed` events. No `presence.set` (ADR-003).
- `channel.ts` — `ChannelService`: the voice↔MCP bridge. `userSpoke`
  (→ `channel.user_spoke`, marks `thinking`), `listen` (cursor-based, for the
  agent's `channel.listen`), `agentSaid` (→ `channel.agent_said`, clears `thinking`).
- `approvals.ts` — `ApprovalGate`: routes record-mutating tools through a human
  decision (`auto`/`prompt`/`deny`, default `prompt`); emits `approval.requested`/
  `approval.resolved`, flips presence to `blocked` while pending. `MUTATING_TOOLS`
  lists the gated tools (`channel.say` is intentionally not one).

```ts
import { Office } from "@hedoffice/core";
const office = new Office({ onPresenceChange: (s, r) => console.log(s, r) });
const { agentId, token } = office.registerAgent("Ada");
```

## Develop

```sh
pnpm --filter @hedoffice/core build
pnpm --filter @hedoffice/core test
```

See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
