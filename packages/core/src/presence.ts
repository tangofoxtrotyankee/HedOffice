import type { EventStore } from "@hedoffice/event-store";
import type { PresenceStatus } from "@hedoffice/schema";
import { cubicleOf } from "./ids.js";

export interface PresenceSnapshot {
  agentId: string;
  status: PresenceStatus;
  /** Epoch ms of the last observed MCP activity. */
  lastActivity: number;
  /** Number of in-flight tool calls on the agent's session. */
  inFlight: number;
}

interface PresenceState {
  connected: boolean;
  inFlight: number;
  /** Pending approval gates (elicitation) — drives the `blocked` state. */
  blocked: number;
  /** A user utterance is awaiting an agent reply — drives `thinking`. */
  awaitingReply: boolean;
  lastActivity: number;
  status: PresenceStatus;
}

/**
 * Infers cubicle presence from MCP activity — never self-reported (ADR-003).
 * The full 5-state model (precedence high→low): `offline` (not connected),
 * `blocked` (approval/elicitation pending), `running` (>=1 in-flight tool call),
 * `thinking` (heard a user utterance, no reply yet), `idle` (connected, quiet).
 * `blocked`/`thinking` are wired in Phase 3 where the signals exist.
 *
 * Each transition appends a `presence.changed` event and notifies `onChange`.
 */
export class PresenceEngine {
  private readonly states = new Map<string, PresenceState>();

  constructor(
    private readonly store: EventStore,
    private readonly onChange?: (snap: PresenceSnapshot, reason: string) => void,
  ) {}

  private state(agentId: string): PresenceState {
    let s = this.states.get(agentId);
    if (!s) {
      s = {
        connected: false,
        inFlight: 0,
        blocked: 0,
        awaitingReply: false,
        lastActivity: 0,
        status: "offline",
      };
      this.states.set(agentId, s);
    }
    return s;
  }

  private derive(s: PresenceState): PresenceStatus {
    if (!s.connected) return "offline";
    if (s.blocked > 0) return "blocked";
    if (s.inFlight > 0) return "running";
    if (s.awaitingReply) return "thinking";
    return "idle";
  }

  private recompute(agentId: string, reason: string): void {
    const s = this.state(agentId);
    const next = this.derive(s);
    if (next === s.status) return;
    const from = s.status;
    s.status = next;
    this.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "system",
      type: "presence.changed",
      payload: { agentId, from, to: next, reason },
    });
    this.onChange?.(this.snapshot(agentId), reason);
  }

  connect(agentId: string): void {
    const s = this.state(agentId);
    s.connected = true;
    s.lastActivity = Date.now();
    this.recompute(agentId, "connected");
  }

  disconnect(agentId: string): void {
    const s = this.state(agentId);
    s.connected = false;
    s.inFlight = 0;
    s.lastActivity = Date.now();
    this.recompute(agentId, "transport_closed");
  }

  callStart(agentId: string): void {
    const s = this.state(agentId);
    s.inFlight += 1;
    s.lastActivity = Date.now();
    this.recompute(agentId, "tool_call_inflight");
  }

  callEnd(agentId: string): void {
    const s = this.state(agentId);
    s.inFlight = Math.max(0, s.inFlight - 1);
    s.lastActivity = Date.now();
    this.recompute(agentId, "tool_call_settled");
  }

  /** A user utterance arrived; the agent owes a reply → `thinking`. */
  userSpoke(agentId: string): void {
    const s = this.state(agentId);
    s.awaitingReply = true;
    s.lastActivity = Date.now();
    this.recompute(agentId, "user_spoke");
  }

  /** The agent replied (e.g. `channel.say`); clears the pending reply. */
  agentReplied(agentId: string): void {
    const s = this.state(agentId);
    s.awaitingReply = false;
    s.lastActivity = Date.now();
    this.recompute(agentId, "agent_said");
  }

  /** An approval gate opened → `blocked` until resolved. */
  blockStart(agentId: string): void {
    const s = this.state(agentId);
    s.blocked += 1;
    s.lastActivity = Date.now();
    this.recompute(agentId, "approval_pending");
  }

  /** An approval gate resolved. */
  blockEnd(agentId: string): void {
    const s = this.state(agentId);
    s.blocked = Math.max(0, s.blocked - 1);
    s.lastActivity = Date.now();
    this.recompute(agentId, "approval_resolved");
  }

  snapshot(agentId: string): PresenceSnapshot {
    const s = this.state(agentId);
    return {
      agentId,
      status: s.status,
      lastActivity: s.lastActivity,
      inFlight: s.inFlight,
    };
  }

  /** Milliseconds since the agent's last observed activity. */
  idleMs(agentId: string, now = Date.now()): number {
    return now - this.state(agentId).lastActivity;
  }

  all(): PresenceSnapshot[] {
    return [...this.states.keys()].map((id) => this.snapshot(id));
  }
}
