# @hedoffice/core

Orchestration core: owns the event store and ties together agent registration,
per-cubicle notebook/task state, and presence inference. Holds no MCP concerns,
so it is testable headlessly. Status: **Phase 1 — implemented** (approval gate +
audit beyond tool calls land in Phase 3).

## Contents

- `office.ts` — `Office` facade: `store`, `agents`, `cubicles`, `presence`.
- `agents.ts` — `AgentRegistry`: mints a per-agent bearer token (only the
  SHA-256 hash is persisted) and resolves a presented token to its `agentId`.
- `cubicle.ts` — `CubicleState`: notebook read/write/append + task
  create/update/list, all scoped to one `agentId` (cubicle isolation). Notebook
  content lives in the `notebooks` projection; the log records `notebook.written`
  integrity hashes. Tasks are fully event-sourced.
- `presence.ts` — `PresenceEngine`: infers `offline`/`idle`/`running` from MCP
  activity and emits `presence.changed` events. No `presence.set` (ADR-003).

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
