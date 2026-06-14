import { randomBytes, randomUUID } from "node:crypto";
import type { EventStore } from "@hedoffice/event-store";
import { cubicleOf, sha256 } from "./ids.js";

export interface RegisteredAgent {
  agentId: string;
  /** The bearer token the agent presents on the MCP connection. Shown once. */
  token: string;
}

/**
 * Registers BYO agents and authenticates their bearer tokens.
 *
 * A token is minted once at registration; only its SHA-256 hash is persisted
 * (docs/SECURITY.md). The plaintext token is returned to the caller and never
 * stored. Token -> agentId resolution hashes the presented token and looks it
 * up, so the registry holds no plaintext secrets at rest.
 */
export class AgentRegistry {
  constructor(private readonly store: EventStore) {}

  register(name: string): RegisteredAgent {
    const agentId = randomUUID();
    const token = randomBytes(32).toString("hex");
    this.store.db
      .prepare(
        `INSERT INTO agents (agent_id, name, token_hash, created_at)
         VALUES (@agentId, @name, @tokenHash, @createdAt)`,
      )
      .run({ agentId, name, tokenHash: sha256(token), createdAt: Date.now() });
    this.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "system",
      type: "agent.registered",
      payload: { agentId, name },
    });
    return { agentId, token };
  }

  /** Resolve a presented bearer token to its agentId, or undefined if invalid. */
  resolveToken(token: string): string | undefined {
    const row = this.store.db
      .prepare(`SELECT agent_id AS agentId FROM agents WHERE token_hash = ?`)
      .get(sha256(token)) as { agentId: string } | undefined;
    return row?.agentId;
  }

  has(agentId: string): boolean {
    const row = this.store.db
      .prepare(`SELECT 1 FROM agents WHERE agent_id = ?`)
      .get(agentId);
    return row !== undefined;
  }
}
