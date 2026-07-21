import type { EventStore } from "@hedoffice/event-store";
import { cubicleOf } from "./ids.js";

/**
 * Force-disconnects live MCP sessions. The server layer (packages/mcp-server)
 * owns the sockets, so it registers this callback; the core only knows "drop
 * this agent" / "drop everyone" and how many were closed. `"*"` = all sessions.
 */
export type ForceDisconnect = (target: string | "*") => number;

/**
 * Append a `security.violation` event — a *blocked* security-relevant action
 * (session replay, failed token re-check, fail-closed approval). Distinct from
 * the informational `audit.security_event`. Lives on the "security" stream.
 */
export function appendSecurityViolation(
  store: EventStore,
  agentId: string,
  kind: string,
  detail: string,
  origin: string | null = null,
): void {
  store.append({
    agentId,
    streamId: "security",
    actor: "system",
    type: "security.violation",
    payload: { agentId, kind, detail, origin },
  });
}

/**
 * The office kill switch and per-cubicle suspension (Phase 5, R5.6).
 *
 * State is **event-sourced**, not in-memory: `isKilled()` / `isSuspended()`
 * read the latest relevant event from the shared log. That is what lets the
 * operator CLI (a separate process from the running server, sharing the SQLite
 * file in WAL mode) freeze an agent and have the live server honour it on the
 * next call — no IPC, no restart. The server additionally registers a
 * `ForceDisconnect` so engaging the switch drops open sockets immediately;
 * without it, existing sessions are simply refused on their next tool call.
 */
export class OfficeControl {
  private disconnect?: ForceDisconnect;

  constructor(private readonly store: EventStore) {}

  /** The server wires this so kill/revoke can drop live sockets immediately. */
  setForceDisconnect(fn: ForceDisconnect): void {
    this.disconnect = fn;
  }

  /** Force-close an agent's sessions (or all with "*"); returns the count. */
  forceDisconnect(target: string | "*"): number {
    return this.disconnect?.(target) ?? 0;
  }

  // --- global kill switch ----------------------------------------------------

  /** Engage the kill switch: drop every live session, refuse new ones. */
  killAll(reason: string): number {
    const sessionsClosed = this.forceDisconnect("*");
    this.store.append({
      agentId: "system",
      streamId: "system",
      actor: "system",
      type: "system.killswitch",
      payload: { reason, active: true, sessionsClosed },
    });
    return sessionsClosed;
  }

  /** Lift the kill switch: allow connections again. */
  liftKill(reason: string): void {
    this.store.append({
      agentId: "system",
      streamId: "system",
      actor: "system",
      type: "system.killswitch",
      payload: { reason, active: false, sessionsClosed: 0 },
    });
  }

  isKilled(): boolean {
    const row = this.store.db
      .prepare(
        `SELECT payload FROM events WHERE type = 'system.killswitch'
         ORDER BY event_id DESC LIMIT 1`,
      )
      .get() as { payload: string } | undefined;
    if (!row) return false;
    try {
      return (JSON.parse(row.payload) as { active?: boolean }).active === true;
    } catch {
      return false;
    }
  }

  // --- per-cubicle suspend ---------------------------------------------------

  /** Freeze one cubicle: its agent's tool calls are refused until resumed. */
  suspend(agentId: string, reason: string): void {
    this.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "system",
      type: "cubicle.suspend",
      payload: { agentId, reason },
    });
  }

  /** Unfreeze a previously-suspended cubicle. */
  resume(agentId: string, reason: string): void {
    this.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "system",
      type: "cubicle.resume",
      payload: { agentId, reason },
    });
  }

  isSuspended(agentId: string): boolean {
    const row = this.store.db
      .prepare(
        `SELECT type FROM events
         WHERE agent_id = ? AND type IN ('cubicle.suspend', 'cubicle.resume')
         ORDER BY event_id DESC LIMIT 1`,
      )
      .get(agentId) as { type: string } | undefined;
    return row?.type === "cubicle.suspend";
  }

  /** Record a blocked, security-relevant action (see appendSecurityViolation). */
  violation(agentId: string, kind: string, detail: string, origin: string | null = null): void {
    appendSecurityViolation(this.store, agentId, kind, detail, origin);
  }
}
