import type { PresenceStatus, TaskStatus } from "./primitives.js";

/**
 * Read-model "view" types — the serializable shapes the UI renders. They are
 * pure (no Node/SQLite deps), so the browser renderer can import them while the
 * Node side (core) builds them from the event log. This is the data contract
 * across the (deferred) shell IPC boundary.
 */

export interface CubicleView {
  agentId: string;
  name: string;
  status: PresenceStatus;
  /** Short current-activity ticker (e.g. the latest tool called). */
  activity: string;
  tasksDone: number;
  tasksTotal: number;
  /** Epoch ms of the agent's last observed activity. */
  lastActivity: number;
}

export interface TaskView {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface FeedLineView {
  ts: number;
  /** `run` | `think` | `read` | `say` | `warn` | … */
  kind: string;
  detail: string;
}

export interface CubicleDetailView {
  agentId: string;
  notebook: string;
  tasks: TaskView[];
  /** Recent tool-call / channel activity, oldest first. */
  recent: FeedLineView[];
}
