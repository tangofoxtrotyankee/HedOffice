# @hedoffice/schema

Zod schemas — the **single source of truth** for both MCP tool inputs and the
typed event-log schema (ADR-001/ADR-004). Status: **Phase 0 — implemented.**

## Contents

- `primitives.ts` — `Actor`, `PresenceStatus`, `TaskStatus`, `ApprovalPolicy`,
  `ApprovalDecision`, `Id`.
- `events.ts` — per-type payload schemas + the `EventBody` discriminated union,
  the `Envelope`, and the `NewEvent` / `StoredEvent` schemas. `EVENT_TYPES` is
  derived from the union, so the type list has one source.
- `tools.ts` — input schemas for the v1 tool set, plus the `TOOL_INPUTS`
  registry used to wire MCP tool definitions in Phase 1.

```ts
import { NewEvent, StoredEvent, TOOL_INPUTS } from "@hedoffice/schema";
```

## Develop

```sh
pnpm --filter @hedoffice/schema build
pnpm --filter @hedoffice/schema test
```

See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
