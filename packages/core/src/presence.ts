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
  lastActivity: number;
  status: PresenceStatus;
}

/**
 * Infers cubicle presence from MCP activity — never self-reported (ADR-003).
 * v1 (Phase 1) derives: offline (not connected), running (>=1 in-flight call),
 * idle (connected, none in-flight). `thinking`/`blocked` arrive with the voice
 * channel and approval gate in Phase 3.
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
      s = { connected: false, inFlight: 0, lastActivity: 0, status: "offline" };
      this.states.set(agentId, s);
    }
    return s;
  }

  private derive(s: PresenceState): PresenceStatus {
    if (!s.connected) return "offline";
    if (s.inFlight > 0) return "running";
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
