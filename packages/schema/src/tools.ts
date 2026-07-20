import { z } from "zod";
import { Id, TaskStatus } from "./primitives.js";

/**
 * Input schemas for the v1 MCP tool set (docs/ARCHITECTURE.md). These same Zod
 * schemas back the MCP tool definitions in Phase 1, so tool inputs and the
 * event log share one source of truth.
 *
 * Presence is intentionally absent: it is inferred, never set (ADR-003).
 */

// notebook.*
export const NotebookReadInput = z.object({});
export const NotebookWriteInput = z.object({ content: z.string() });
export const NotebookAppendInput = z.object({ text: z.string() });

// task.*
export const TaskCreateInput = z.object({
  title: z.string().min(1),
  detail: z.string().optional(),
});
export const TaskUpdateInput = z.object({
  taskId: Id,
  status: TaskStatus.optional(),
  detail: z.string().optional(),
});
export const TaskListInput = z.object({});

// channel.*
export const ChannelListenInput = z.object({
  /** Return user utterances after this event cursor; omitted = from start. */
  sinceEventId: z.number().int().nonnegative().optional(),
  /** Long-poll: wait up to this many ms for a new utterance. */
  waitMs: z.number().int().nonnegative().optional(),
});
export const ChannelSayInput = z.object({
  text: z.string().min(1),
  voiceId: z.string().optional(),
});

// cubicle.*
export const CubicleStatusInput = z.object({});
export const CubicleBriefInput = z.object({});

// library.* — the shared governance library (read-only for agents)
export const LibraryListInput = z.object({});
export const LibraryReadInput = z.object({
  /** Doc path, e.g. "constitution.md" or "decision_trees/user_registered.md". */
  path: z.string().min(1),
});

/** Registry of tool name -> input schema, for wiring MCP tool defs in Phase 1. */
export const TOOL_INPUTS = {
  "notebook.read": NotebookReadInput,
  "notebook.write": NotebookWriteInput,
  "notebook.append": NotebookAppendInput,
  "task.create": TaskCreateInput,
  "task.update": TaskUpdateInput,
  "task.list": TaskListInput,
  "channel.listen": ChannelListenInput,
  "channel.say": ChannelSayInput,
  "cubicle.status": CubicleStatusInput,
  "cubicle.brief": CubicleBriefInput,
  "library.list": LibraryListInput,
  "library.read": LibraryReadInput,
} as const;

export type ToolName = keyof typeof TOOL_INPUTS;
export const TOOL_NAMES = Object.keys(TOOL_INPUTS) as ToolName[];
