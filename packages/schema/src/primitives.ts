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

/**
 * Staged-permission model for a BYO agent (docs/SECURITY.md, docs/INTEGRATION.md).
 * New agents start at `observe` (read-only); the operator promotes them as trust
 * is earned. The stage sets the *default* approval policy for mutating tools —
 * per-tool overrides still win.
 *
 * - `observe`     → mutating tools are denied (read + channel only)
 * - `supervised`  → mutating tools prompt the human approver
 * - `autonomous`  → mutating tools auto-allow (still fully audit-logged)
 */
export const PermissionStage = z.enum(["observe", "supervised", "autonomous"]);
export type PermissionStage = z.infer<typeof PermissionStage>;

/** Resolution of an approval gate. */
export const ApprovalDecision = z.enum(["allow", "deny"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;
