import { chmodSync } from "node:fs";
import Database from "better-sqlite3";
import { NewEvent, StoredEvent } from "@hedoffice/schema";
import { DDL } from "./ddl.js";

/**
 * Best-effort `chmod 0600` on the SQLite file and its WAL/SHM sidecars. The
 * sidecars may not exist yet (created lazily), and some filesystems reject
 * chmod (e.g. certain mounts) — neither is fatal, so failures are swallowed.
 */
function restrictFilePermissions(location: string): void {
  for (const path of [location, `${location}-wal`, `${location}-shm`]) {
    try {
      chmodSync(path, 0o600);
    } catch {
      // sidecar absent or filesystem doesn't support chmod — ignore.
    }
  }
}

/** Filters for replaying a slice of the log, in total order. */
export interface ReadOptions {
  /** Only events with eventId strictly greater than this cursor. */
  afterEventId?: number;
  /** Restrict to one agent (cubicle identity). */
  agentId?: string;
  /** Restrict to one stream. */
  streamId?: string;
  /** Restrict to one or more event types. */
  type?: string | readonly string[];
  /** Cap the number of rows returned. */
  limit?: number;
}

/** Shape of a row as stored in the `events` table. */
interface EventRow {
  event_id: number;
  agent_id: string;
  stream_id: string;
  type: string;
  payload: string;
  ts: number;
  actor: string;
  correlation_id: string | null;
}

function rowToStored(row: EventRow): StoredEvent {
  return StoredEvent.parse({
    eventId: row.event_id,
    agentId: row.agent_id,
    streamId: row.stream_id,
    type: row.type,
    payload: JSON.parse(row.payload),
    ts: row.ts,
    actor: row.actor,
    ...(row.correlation_id !== null && { correlationId: row.correlation_id }),
  });
}

/**
 * The append-only event log on better-sqlite3.
 *
 * `events` is the source of truth (ADR-001); reads replay it in total order.
 * Uses WAL mode for concurrent-read performance. Events are immutable — there
 * is intentionally no update or delete API.
 */
export class EventStore {
  readonly db: Database.Database;

  /** @param location file path, or ":memory:" for an ephemeral store. */
  constructor(location = ":memory:") {
    this.db = new Database(location);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(DDL);
    this.migrate();
    // Restrict the on-disk log (and its WAL/SHM sidecars) to the owning user
    // (docs/SECURITY.md T5.1 / F15). The DB holds notebooks, transcripts and
    // charters in cleartext; a same-user process is the trust boundary, but a
    // stray group/other-readable file should not widen it.
    if (location !== ":memory:") restrictFilePermissions(location);
  }

  /**
   * Additive migrations for databases created before a column existed
   * (CREATE TABLE IF NOT EXISTS never alters an existing table).
   */
  private migrate(): void {
    const agentCols = (
      this.db.pragma("table_info(agents)") as Array<{ name: string }>
    ).map((c) => c.name);
    if (!agentCols.includes("stage")) {
      this.db.exec(
        `ALTER TABLE agents ADD COLUMN stage TEXT NOT NULL DEFAULT 'supervised'
         CHECK (stage IN ('observe','supervised','autonomous'))`,
      );
    }
  }

  /** Validate and append one event; returns it with its assigned id and ts. */
  append(event: NewEvent): StoredEvent {
    const e = NewEvent.parse(event);
    const ts = Date.now();
    const info = this.db
      .prepare(
        `INSERT INTO events (agent_id, stream_id, type, payload, ts, actor, correlation_id)
         VALUES (@agentId, @streamId, @type, @payload, @ts, @actor, @correlationId)`,
      )
      .run({
        agentId: e.agentId,
        streamId: e.streamId,
        type: e.type,
        payload: JSON.stringify(e.payload),
        ts,
        actor: e.actor,
        correlationId: e.correlationId ?? null,
      });
    return {
      ...e,
      eventId: Number(info.lastInsertRowid),
      ts,
    } as StoredEvent;
  }

  /** Append many events atomically (all-or-nothing). */
  appendMany(events: readonly NewEvent[]): StoredEvent[] {
    const tx = this.db.transaction((batch: readonly NewEvent[]) =>
      batch.map((e) => this.append(e)),
    );
    return tx(events);
  }

  /** Replay a slice of the log in total order (oldest first). */
  read(opts: ReadOptions = {}): StoredEvent[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (opts.afterEventId !== undefined) {
      where.push("event_id > @afterEventId");
      params.afterEventId = opts.afterEventId;
    }
    if (opts.agentId !== undefined) {
      where.push("agent_id = @agentId");
      params.agentId = opts.agentId;
    }
    if (opts.streamId !== undefined) {
      where.push("stream_id = @streamId");
      params.streamId = opts.streamId;
    }
    if (opts.type !== undefined) {
      const types = Array.isArray(opts.type) ? opts.type : [opts.type];
      const placeholders = types.map((_, i) => `@type${i}`);
      where.push(`type IN (${placeholders.join(", ")})`);
      types.forEach((t, i) => {
        params[`type${i}`] = t;
      });
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = opts.limit !== undefined ? "LIMIT @limit" : "";
    if (opts.limit !== undefined) params.limit = opts.limit;

    const rows = this.db
      .prepare(
        `SELECT * FROM events ${clause} ORDER BY event_id ASC ${limit}`,
      )
      .all(params) as EventRow[];
    return rows.map(rowToStored);
  }

  /**
   * Fold the log into a derived state — the basis for every projection.
   * Replays in total order, applying `reducer` to each event.
   */
  replay<T>(
    reducer: (state: T, event: StoredEvent) => T,
    initial: T,
    opts: ReadOptions = {},
  ): T {
    return this.read(opts).reduce(reducer, initial);
  }

  /** Total number of events (optionally filtered). */
  count(opts: ReadOptions = {}): number {
    return this.read(opts).length;
  }

  close(): void {
    this.db.close();
  }
}
