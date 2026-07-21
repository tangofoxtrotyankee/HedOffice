import { z } from "zod";
import { Id, TaskStatus } from "./primitives.js";

/**
 * Input schemas for the v1 MCP tool set (docs/ARCHITECTURE.md). These same Zod
 * schemas back the MCP tool definitions in Phase 1, so tool inputs and the
 * event log share one source of truth.
 *
 * Presence is intentionally absent: it is inferred, never set (ADR-003).
 *
 * Every free-text field is length-capped (docs/SECURITY.md, F3): the transport
 * caps the whole body at 2 MB, but a single agent must not be able to write a
 * 2 MB notebook or flood the log with oversized payloads, so each field also
 * fails closed at a sane per-field ceiling. Caps are character lengths (a UTF-8
 * byte is ≥1 char), comfortably above any legitimate use.
 */
export const MAX_NOTEBOOK_CHARS = 200_000;
export const MAX_TEXT_CHARS = 20_000;
export const MAX_TITLE_CHARS = 4_000;
export const MAX_SAY_CHARS = 10_000;

// notebook.*
export const NotebookReadInput = z.object({});
export const NotebookWriteInput = z.object({ content: z.string().max(MAX_NOTEBOOK_CHARS) });
export const NotebookAppendInput = z.object({ text: z.string().max(MAX_TEXT_CHARS) });

// task.*
export const TaskCreateInput = z.object({
  title: z.string().min(1).max(MAX_TITLE_CHARS),
  detail: z.string().max(MAX_TEXT_CHARS).optional(),
});
export const TaskUpdateInput = z.object({
  taskId: Id,
  status: TaskStatus.optional(),
  detail: z.string().max(MAX_TEXT_CHARS).optional(),
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
  text: z.string().min(1).max(MAX_SAY_CHARS),
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
