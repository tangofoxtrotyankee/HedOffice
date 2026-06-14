import { z } from "zod";

/** A non-empty identifier string (agentId, taskId, sessionId, …). */
export const Id = z.string().min(1);

/**
 * Who caused an event. Every row in the append-only log is attributed to one
 * of these. See docs/ARCHITECTURE.md (data model).
 */
export const Actor = z.enum(["user", "agent", "system"]);
export type Actor = z.infer<typeof Actor>;

/**
 * Inferred cubicle presence. HedOffice derives this from MCP activity — there
 * is deliberately no `presence.set` tool (ADR-003).
 */
export const PresenceStatus = z.enum([
  "idle",
  "thinking",
  "running",
  "blocked",
  "offline",
]);
export type PresenceStatus = z.infer<typeof PresenceStatus>;

/** Task lifecycle states for the per-cubicle task list. */
export const TaskStatus = z.enum(["open", "in_progress", "blocked", "done"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

/** Per-agent policy for a sensitive/mutating tool (docs/SECURITY.md). */
export const ApprovalPolicy = z.enum(["auto", "prompt", "deny"]);
export type ApprovalPolicy = z.infer<typeof ApprovalPolicy>;

/** Resolution of an approval gate. */
export const ApprovalDecision = z.enum(["allow", "deny"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;
