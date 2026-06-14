# @hedoffice/event-store

The append-only event log + derived projection tables, on `better-sqlite3`
(WAL mode). The `events` table is the source of truth; projections are
disposable and replayable (ADR-001). Status: **Phase 0 — append/replay
implemented; projection population is Phase 1+.**

## Usage

```ts
import { EventStore } from "@hedoffice/event-store";

const store = new EventStore(":memory:"); // or a file path

store.append({
  agentId: "agent-1",
  streamId: "cubicle-1",
  actor: "agent",
  type: "notebook.written",
  payload: { agentId: "agent-1", prevHash: null, newHash: "abc", byteLen: 3 },
});

// Replay (fold) the log into a projection:
const latestHash = store.replay<string | null>(
  (state, e) => (e.type === "notebook.written" ? e.payload.newHash : state),
  null,
  { agentId: "agent-1" },
);
```

API: `append`, `appendMany` (atomic), `read` (cursor/agent/stream/type filters),
`replay` (fold), `count`, `close`. Events are immutable — there is no update or
delete. `ddl.ts` holds the SQLite schema (events + projection tables).

## Develop

```sh
pnpm --filter @hedoffice/event-store build
pnpm --filter @hedoffice/event-store test
```

See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
