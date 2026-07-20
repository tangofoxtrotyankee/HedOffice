import { EventStore } from "@hedoffice/event-store";
import { AgentRegistry } from "./agents.js";
import { ApprovalGate, type Approver } from "./approvals.js";
import { ChannelService } from "./channel.js";
import { CubicleState } from "./cubicle.js";
import { PresenceEngine, type PresenceSnapshot } from "./presence.js";
import type { ApprovalPolicy, PermissionStage } from "@hedoffice/schema";

export interface OfficeOptions {
  /** SQLite location; defaults to an in-memory store. */
  location?: string;
  /** Notified on every inferred presence transition. */
  onPresenceChange?: (snap: PresenceSnapshot, reason: string) => void;
  /** Approval-gate config for mutating tools (default policy `prompt`). */
  approval?: { defaultPolicy?: ApprovalPolicy; approver?: Approver };
}

/**
 * The orchestration core: owns the event store and ties together agent
 * registration, per-cubicle notebook/task state, the voice/text channel, the
 * approval gate, and presence inference. The MCP server layer
 * (packages/mcp-server) drives this; it holds no MCP concerns itself, so it is
 * testable headlessly.
 */
export class Office {
  readonly store: EventStore;
  readonly agents: AgentRegistry;
  readonly cubicles: CubicleState;
  readonly presence: PresenceEngine;
  readonly channel: ChannelService;
  readonly approvals: ApprovalGate;

  constructor(opts: OfficeOptions = {}) {
    this.store = new EventStore(opts.location);
    this.agents = new AgentRegistry(this.store);
    this.cubicles = new CubicleState(this.store);
    this.presence = new PresenceEngine(this.store, opts.onPresenceChange);
    this.channel = new ChannelService(this.store, this.presence);
    this.approvals = new ApprovalGate(this.store, this.presence, {
      // The agent's staged-permission level drives the default gate policy
      // (observe → deny, supervised → prompt, autonomous → auto) unless the
      // caller pins an explicit defaultPolicy or per-tool override.
      ...(opts.approval?.defaultPolicy === undefined && {
        stageLookup: (agentId: string) => this.agents.stageOf(agentId),
      }),
      ...opts.approval,
    });
  }

  registerAgent(name: string, stage?: PermissionStage) {
    return this.agents.register(name, stage);
  }

  close(): void {
    this.store.close();
  }
}
