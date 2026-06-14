import { randomUUID } from "node:crypto";
import type { EventStore } from "@hedoffice/event-store";
import type { TaskStatus } from "@hedoffice/schema";
import { cubicleOf, sha256 } from "./ids.js";

export interface Task {
  id: string;
  agentId: string;
  title: string;
  status: TaskStatus;
  detail: string | null;
  updatedAt: number;
}

interface TaskRow {
  id: string;
  agent_id: string;
  title: string;
  status: string;
  detail: string | null;
  updated_at: number;
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    agentId: r.agent_id,
    title: r.title,
    status: r.status as TaskStatus,
    detail: r.detail,
    updatedAt: r.updated_at,
  };
}

/**
 * Per-cubicle notebook + task state. All operations are scoped to a single
 * `agentId`, so one agent can never read or mutate another's data (cubicle
 * isolation). Notebook content lives authoritatively in the `notebooks`
 * projection table; the event log records `notebook.written` with integrity
 * hashes (docs/ARCHITECTURE.md). Tasks are fully event-sourced.
 */
export class CubicleState {
  constructor(private readonly store: EventStore) {}

  private get db() {
    return this.store.db;
  }

  // --- notebook ---------------------------------------------------------------

  notebookRead(agentId: string): string {
    const row = this.db
      .prepare(`SELECT content FROM notebooks WHERE agent_id = ?`)
      .get(agentId) as { content: string } | undefined;
    return row?.content ?? "";
  }

  notebookWrite(agentId: string, content: string): void {
    const prev = this.notebookRead(agentId);
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO notebooks (agent_id, content, updated_at)
         VALUES (@agentId, @content, @now)
         ON CONFLICT(agent_id) DO UPDATE SET content = @content, updated_at = @now`,
      )
      .run({ agentId, content, now });
    this.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "agent",
      type: "notebook.written",
      payload: {
        agentId,
        prevHash: prev === "" ? null : sha256(prev),
        newHash: sha256(content),
        byteLen: Buffer.byteLength(content, "utf8"),
      },
    });
  }

  notebookAppend(agentId: string, text: string): string {
    const next = this.notebookRead(agentId) + text;
    this.notebookWrite(agentId, next);
    return next;
  }

  // --- tasks ------------------------------------------------------------------

  taskCreate(agentId: string, title: string, detail?: string): Task {
    const id = randomUUID();
    const now = Date.now();
    const status: TaskStatus = "open";
    this.db
      .prepare(
        `INSERT INTO tasks (id, agent_id, title, status, detail, updated_at)
         VALUES (@id, @agentId, @title, @status, @detail, @now)`,
      )
      .run({ id, agentId, title, status, detail: detail ?? null, now });
    this.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "agent",
      type: "task.created",
      payload: { taskId: id, agentId, title },
    });
    return { id, agentId, title, status, detail: detail ?? null, updatedAt: now };
  }

  taskUpdate(
    agentId: string,
    taskId: string,
    changes: { status?: TaskStatus; detail?: string },
  ): Task {
    const row = this.db
      .prepare(`SELECT * FROM tasks WHERE id = ? AND agent_id = ?`)
      .get(taskId, agentId) as TaskRow | undefined;
    if (!row) {
      throw new Error(`task ${taskId} not found for agent ${agentId}`);
    }
    const updates: Array<{ field: "status" | "detail"; old: unknown; next: unknown }> = [];
    if (changes.status !== undefined && changes.status !== row.status) {
      updates.push({ field: "status", old: row.status, next: changes.status });
    }
    if (changes.detail !== undefined && changes.detail !== row.detail) {
      updates.push({ field: "detail", old: row.detail, next: changes.detail });
    }
    const now = Date.now();
    for (const u of updates) {
      this.db
        .prepare(
          `UPDATE tasks SET ${u.field} = @value, updated_at = @now WHERE id = @id`,
        )
        .run({ value: u.next, now, id: taskId });
      this.store.append({
        agentId,
        streamId: cubicleOf(agentId),
        actor: "agent",
        type: "task.updated",
        payload: { taskId, agentId, field: u.field, old: u.old, new: u.next },
      });
    }
    return rowToTask(
      this.db
        .prepare(`SELECT * FROM tasks WHERE id = ?`)
        .get(taskId) as TaskRow,
    );
  }

  taskList(agentId: string): Task[] {
    const rows = this.db
      .prepare(`SELECT * FROM tasks WHERE agent_id = ? ORDER BY updated_at ASC`)
      .all(agentId) as TaskRow[];
    return rows.map(rowToTask);
  }
}
