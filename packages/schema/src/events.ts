import { z } from "zod";
import {
  Actor,
  ApprovalDecision,
  Id,
  PresenceStatus,
} from "./primitives.js";

/**
 * The typed, append-only event log is the single source of truth (ADR-001).
 * Every interaction is one event. Payload shapes mirror docs/ARCHITECTURE.md.
 *
 * Note: payloads keep their documented fields (e.g. `agentId`) even where they
 * duplicate the envelope columns, so the wire shape stays faithful to the spec.
 */

// --- Per-type payload schemas -------------------------------------------------

export const AgentRegistered = z.object({ agentId: Id, name: z.string() });
export const AgentConnected = z.object({ agentId: Id, sessionId: Id });
export const AgentDisconnected = z.object({ agentId: Id, sessionId: Id });

export const PresenceChanged = z.object({
  agentId: Id,
  from: PresenceStatus,
  to: PresenceStatus,
  reason: z.string(),
});

export const NotebookWritten = z.object({
  agentId: Id,
  prevHash: z.string().nullable(),
  newHash: z.string(),
  byteLen: z.number().int().nonnegative(),
});

export const TaskCreated = z.object({
  taskId: Id,
  agentId: Id,
  title: z.string(),
});
export const TaskUpdated = z.object({
  taskId: Id,
  agentId: Id,
  field: z.string(),
  old: z.unknown(),
  new: z.unknown(),
});

export const ToolCalled = z.object({
  agentId: Id,
  tool: z.string(),
  argsHash: z.string(),
  callId: Id,
});
export const ToolResult = z.object({
  agentId: Id,
  callId: Id,
  ok: z.boolean(),
  durationMs: z.number().nonnegative(),
});

export const ChannelUserSpoke = z.object({
  agentId: Id,
  transcript: z.string(),
  audioRef: z.string().nullable(),
  sttMs: z.number().nonnegative(),
});
export const ChannelAgentSaid = z.object({
  agentId: Id,
  text: z.string(),
  ttsMs: z.number().nonnegative(),
  voiceId: z.string().nullable(),
  provider: z.string(),
});

export const ApprovalRequested = z.object({ agentId: Id, action: z.string() });
export const ApprovalResolved = z.object({
  agentId: Id,
  action: z.string(),
  decision: ApprovalDecision,
});

export const CostRecorded = z.object({
  agentId: Id,
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  usd: z.number().nonnegative(),
});

export const AuditSecurityEvent = z.object({
  agentId: Id,
  kind: z.string(),
  detail: z.string(),
});

// --- Discriminated union of (type, payload) ----------------------------------

export const EventBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent.registered"), payload: AgentRegistered }),
  z.object({ type: z.literal("agent.connected"), payload: AgentConnected }),
  z.object({ type: z.literal("agent.disconnected"), payload: AgentDisconnected }),
  z.object({ type: z.literal("presence.changed"), payload: PresenceChanged }),
  z.object({ type: z.literal("notebook.written"), payload: NotebookWritten }),
  z.object({ type: z.literal("task.created"), payload: TaskCreated }),
  z.object({ type: z.literal("task.updated"), payload: TaskUpdated }),
  z.object({ type: z.literal("tool.called"), payload: ToolCalled }),
  z.object({ type: z.literal("tool.result"), payload: ToolResult }),
  z.object({ type: z.literal("channel.user_spoke"), payload: ChannelUserSpoke }),
  z.object({ type: z.literal("channel.agent_said"), payload: ChannelAgentSaid }),
  z.object({ type: z.literal("approval.requested"), payload: ApprovalRequested }),
  z.object({ type: z.literal("approval.resolved"), payload: ApprovalResolved }),
  z.object({ type: z.literal("cost.recorded"), payload: CostRecorded }),
  z.object({ type: z.literal("audit.security_event"), payload: AuditSecurityEvent }),
]);
export type EventBody = z.infer<typeof EventBody>;

/** All known event type strings, derived from the union (single source). */
export const EVENT_TYPES = EventBody.options.map(
  (o) => o.shape.type.value,
) as readonly EventBody["type"][];

export type EventType = EventBody["type"];

// --- Envelope: the columns every event carries -------------------------------

export const Envelope = z.object({
  /** Stable, durable agent identity — log rows key off this, not sessionId. */
  agentId: Id,
  /** Stream the event belongs to, e.g. a cubicle id. */
  streamId: Id,
  /** Who caused it. */
  actor: Actor,
  /** Optional id linking a request/response or a causal chain. */
  correlationId: Id.optional(),
});

/** An event ready to be appended (no eventId/ts — the store assigns those). */
export const NewEvent = z.intersection(Envelope, EventBody);
export type NewEvent = z.infer<typeof NewEvent>;

/** An event read back from the store (with total-order id + timestamp). */
export const StoredEvent = z.intersection(
  Envelope.extend({
    /** Autoincrement primary key — defines the global total order. */
    eventId: z.number().int().positive(),
    /** Epoch milliseconds when the event was appended. */
    ts: z.number().int().nonnegative(),
  }),
  EventBody,
);
export type StoredEvent = z.infer<typeof StoredEvent>;
