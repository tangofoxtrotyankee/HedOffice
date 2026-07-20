import { randomBytes, randomUUID } from "node:crypto";
import type { EventStore } from "@hedoffice/event-store";
import { PermissionStage } from "@hedoffice/schema";
import { cubicleOf, sha256 } from "./ids.js";

export interface RegisteredAgent {
  agentId: string;
  /** The bearer token the agent presents on the MCP connection. Shown once. */
  token: string;
}

export interface AgentRecord {
  agentId: string;
  name: string;
  createdAt: number;
  stage: PermissionStage;
  /** False once the token has been revoked; the agent can no longer connect. */
  active: boolean;
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

  register(name: string, stage: PermissionStage = "supervised"): RegisteredAgent {
    const agentId = randomUUID();
    const token = randomBytes(32).toString("hex");
    this.store.db
      .prepare(
        `INSERT INTO agents (agent_id, name, token_hash, created_at, stage)
         VALUES (@agentId, @name, @tokenHash, @createdAt, @stage)`,
      )
      .run({ agentId, name, tokenHash: sha256(token), createdAt: Date.now(), stage });
    this.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "system",
      type: "agent.registered",
      payload: { agentId, name },
    });
    return { agentId, token };
  }

  list(): AgentRecord[] {
    const rows = this.store.db
      .prepare(
        `SELECT agent_id AS agentId, name, created_at AS createdAt, stage, token_hash AS tokenHash
         FROM agents ORDER BY created_at ASC`,
      )
      .all() as Array<AgentRecord & { tokenHash: string | null }>;
    return rows.map(({ tokenHash, ...rest }) => ({ ...rest, active: tokenHash !== null }));
  }

  get(agentId: string): AgentRecord | undefined {
    return this.list().find((a) => a.agentId === agentId);
  }

  /**
   * Revoke an agent's bearer token (kill switch). The row and its cubicle
   * history remain; the agent simply can no longer authenticate. Live MCP
   * sessions are not force-closed here — the server layer owns those.
   */
  revoke(agentId: string): boolean {
    const row = this.store.db
      .prepare(`SELECT name, token_hash AS tokenHash FROM agents WHERE agent_id = ?`)
      .get(agentId) as { name: string; tokenHash: string | null } | undefined;
    if (!row || row.tokenHash === null) return false;
    this.store.db
      .prepare(`UPDATE agents SET token_hash = NULL WHERE agent_id = ?`)
      .run(agentId);
    this.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "system",
      type: "agent.revoked",
      payload: { agentId, name: row.name },
    });
    return true;
  }

  /** Mint a fresh token for an existing agent, invalidating the old one. */
  rotateToken(agentId: string): string | undefined {
    if (!this.has(agentId)) return undefined;
    const token = randomBytes(32).toString("hex");
    this.store.db
      .prepare(`UPDATE agents SET token_hash = ? WHERE agent_id = ?`)
      .run(sha256(token), agentId);
    return token;
  }

  stageOf(agentId: string): PermissionStage | undefined {
    const row = this.store.db
      .prepare(`SELECT stage FROM agents WHERE agent_id = ?`)
      .get(agentId) as { stage: string } | undefined;
    return row ? PermissionStage.parse(row.stage) : undefined;
  }

  /** Move an agent along the staged-permission ladder (docs/SECURITY.md). */
  setStage(agentId: string, to: PermissionStage): boolean {
    const from = this.stageOf(agentId);
    if (from === undefined) return false;
    if (from === to) return true;
    this.store.db
      .prepare(`UPDATE agents SET stage = ? WHERE agent_id = ?`)
      .run(to, agentId);
    this.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "system",
      type: "agent.stage_changed",
      payload: { agentId, from, to },
    });
    return true;
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
