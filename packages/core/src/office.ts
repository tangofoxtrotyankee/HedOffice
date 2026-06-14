import { EventStore } from "@hedoffice/event-store";
import { AgentRegistry } from "./agents.js";
import { CubicleState } from "./cubicle.js";
import { PresenceEngine, type PresenceSnapshot } from "./presence.js";

export interface OfficeOptions {
  /** SQLite location; defaults to an in-memory store. */
  location?: string;
  /** Notified on every inferred presence transition. */
  onPresenceChange?: (snap: PresenceSnapshot, reason: string) => void;
}

/**
 * The orchestration core: owns the event store and ties together agent
 * registration, per-cubicle notebook/task state, and presence inference.
 * The MCP server layer (packages/mcp-server) drives this; it holds no MCP
 * concerns itself, so it is testable headlessly.
 */
export class Office {
  readonly store: EventStore;
  readonly agents: AgentRegistry;
  readonly cubicles: CubicleState;
  readonly presence: PresenceEngine;

  constructor(opts: OfficeOptions = {}) {
    this.store = new EventStore(opts.location);
    this.agents = new AgentRegistry(this.store);
    this.cubicles = new CubicleState(this.store);
    this.presence = new PresenceEngine(this.store, opts.onPresenceChange);
  }

  registerAgent(name: string) {
    return this.agents.register(name);
  }

  close(): void {
    this.store.close();
  }
}
