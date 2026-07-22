import { randomUUID } from "node:crypto";
import type { EventStore } from "@hedoffice/event-store";
import { sha256 } from "./ids.js";

export interface LibraryDocMeta {
  path: string;
  byteLen: number;
  updatedAt: number;
}

/** A library doc as advertised in the connect-time manifest (R6.5). */
export interface ManifestEntry {
  /** Storage path, e.g. "constitution.md" or "processes/welcome.md". */
  path: string;
  /** The MCP resource URI an agent reads it at. */
  uri: string;
  /** SHA-256 of the current content — lets an agent detect a change. */
  sha256: string;
  byteLen: number;
}

export interface LibraryManifest {
  entries: ManifestEntry[];
  /** The connecting cubicle's own charter, resolved server-side (charters/self). */
  self: ManifestEntry;
}

export interface LibraryProposalRecord {
  proposalId: string;
  agentId: string;
  path: string;
  content: string;
  rationale: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  createdAt: number;
  resolvedAt: number | null;
}

interface ProposalRow {
  proposal_id: string;
  agent_id: string;
  path: string;
  content: string;
  rationale: string;
  status: string;
  reason: string | null;
  created_at: number;
  resolved_at: number | null;
}

function rowToProposal(r: ProposalRow): LibraryProposalRecord {
  return {
    proposalId: r.proposal_id,
    agentId: r.agent_id,
    path: r.path,
    content: r.content,
    rationale: r.rationale,
    status: r.status as LibraryProposalRecord["status"],
    reason: r.reason,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
}

/** Paths are vault-style relative markdown paths: "constitution.md",
 *  "decision_trees/user_registered.md". Normalized, no traversal, no leading
 *  slash. */
const PATH_RE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i;

export function isValidLibraryPath(path: string): boolean {
  return PATH_RE.test(path) && !path.split("/").some((seg) => seg === "." || seg === "..");
}

/** The MCP resource URI a library doc is read at (Phase 6 R6.2). */
export function libraryUri(path: string): string {
  return `library://${path}`;
}

/**
 * The shared governance library — the office's "vault" of operator-authored
 * documents (constitution, ethics, goals, decision trees, process docs).
 * Office-wide and read-only for agents (exposed as `library://…` MCP resources,
 * Phase 6). Only operator surfaces (CLI / admin API) write directly; agents may
 * *propose* edits, which change nothing until the MD approves (R6.4). Every
 * write/delete emits `library.written` (prevHash→newHash, the tamper-evident
 * change history); proposals emit `library.proposal` /
 * `library.proposal_rejected`.
 */
export class LibraryStore {
  constructor(private readonly store: EventStore) {}

  private get db() {
    return this.store.db;
  }

  list(): LibraryDocMeta[] {
    const rows = this.db
      .prepare(
        `SELECT path, LENGTH(CAST(content AS BLOB)) AS byteLen, updated_at AS updatedAt
         FROM library_docs ORDER BY path ASC`,
      )
      .all() as LibraryDocMeta[];
    return rows;
  }

  read(path: string): string | undefined {
    const row = this.db
      .prepare(`SELECT content FROM library_docs WHERE path = ?`)
      .get(path) as { content: string } | undefined;
    return row?.content;
  }

  /**
   * Resolve a resource URI path to content (Phase 6 R6.2). Accepts the exact
   * storage path ("constitution.md") or the friendly form without the .md
   * suffix ("constitution", "processes/welcome"). Returns undefined if absent.
   */
  resolve(path: string): string | undefined {
    return this.read(path) ?? this.read(`${path}.md`);
  }

  /**
   * The manifest handed to an agent on connect: every library doc's path, read
   * URI and content hash, plus the agent's own charter as `charters/self`.
   */
  manifest(selfCharter: string): LibraryManifest {
    const entries = this.list().map((d) => ({
      path: d.path,
      uri: libraryUri(d.path),
      sha256: sha256(this.read(d.path) ?? ""),
      byteLen: d.byteLen,
    }));
    return {
      entries,
      self: {
        path: "charters/self",
        uri: libraryUri("charters/self"),
        sha256: sha256(selfCharter),
        byteLen: Buffer.byteLength(selfCharter, "utf8"),
      },
    };
  }

  /**
   * Operator write. `proposedBy` credits an agent whose approved proposal drove
   * the edit (null for a direct operator write). Emits `library.written` with
   * the before/after hashes; `correlationId` links it to the proposal, if any.
   */
  write(path: string, content: string, opts: { proposedBy?: string; proposalId?: string } = {}): void {
    if (!isValidLibraryPath(path)) {
      throw new Error(`invalid library path: "${path}"`);
    }
    const prev = this.read(path);
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO library_docs (path, content, updated_at)
         VALUES (@path, @content, @now)
         ON CONFLICT(path) DO UPDATE SET content = @content, updated_at = @now`,
      )
      .run({ path, content, now });
    this.store.append({
      agentId: "office",
      streamId: "library",
      actor: "user",
      ...(opts.proposalId && { correlationId: opts.proposalId }),
      type: "library.written",
      payload: {
        path,
        prevHash: prev === undefined ? null : sha256(prev),
        newHash: sha256(content),
        byteLen: Buffer.byteLength(content, "utf8"),
        proposedBy: opts.proposedBy ?? null,
      },
    });
  }

  delete(path: string): boolean {
    const prev = this.read(path);
    const info = this.db.prepare(`DELETE FROM library_docs WHERE path = ?`).run(path);
    if (info.changes === 0) return false;
    this.store.append({
      agentId: "office",
      streamId: "library",
      actor: "user",
      type: "library.written",
      payload: {
        path,
        prevHash: prev === undefined ? null : sha256(prev),
        newHash: null,
        byteLen: 0,
        proposedBy: null,
      },
    });
    return true;
  }

  // --- proposals (Phase 6 R6.4) ----------------------------------------------

  /**
   * An agent proposes a library edit. Stored as pending and logged as
   * `library.proposal`; it changes nothing until the MD approves. Returns the
   * new proposal id.
   */
  propose(agentId: string, path: string, content: string, rationale: string): string {
    if (!isValidLibraryPath(path)) {
      throw new Error(`invalid library path: "${path}"`);
    }
    const proposalId = randomUUID();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO library_proposals
           (proposal_id, agent_id, path, content, rationale, status, reason, created_at, resolved_at)
         VALUES (@proposalId, @agentId, @path, @content, @rationale, 'pending', NULL, @now, NULL)`,
      )
      .run({ proposalId, agentId, path, content, rationale, now });
    this.store.append({
      agentId,
      streamId: "library",
      actor: "agent",
      correlationId: proposalId,
      type: "library.proposal",
      payload: { proposalId, agentId, path, newHash: sha256(content), rationale },
    });
    return proposalId;
  }

  getProposal(proposalId: string): LibraryProposalRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM library_proposals WHERE proposal_id = ?`)
      .get(proposalId) as ProposalRow | undefined;
    return row ? rowToProposal(row) : undefined;
  }

  listProposals(opts: { status?: LibraryProposalRecord["status"]; agentId?: string } = {}): LibraryProposalRecord[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (opts.status) {
      where.push("status = @status");
      params.status = opts.status;
    }
    if (opts.agentId) {
      where.push("agent_id = @agentId");
      params.agentId = opts.agentId;
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM library_proposals ${clause} ORDER BY created_at ASC`)
      .all(params) as ProposalRow[];
    return rows.map(rowToProposal);
  }

  /**
   * Approve a pending proposal: apply its content to the library (crediting the
   * proposer) and mark it approved. Returns false if it's missing or already
   * resolved. Never auto-applies — this is only reachable from an operator
   * surface (admin API / CLI).
   */
  approveProposal(proposalId: string): boolean {
    const p = this.getProposal(proposalId);
    if (!p || p.status !== "pending") return false;
    this.write(p.path, p.content, { proposedBy: p.agentId, proposalId });
    this.db
      .prepare(`UPDATE library_proposals SET status = 'approved', resolved_at = ? WHERE proposal_id = ?`)
      .run(Date.now(), proposalId);
    return true;
  }

  /** Reject a pending proposal with a reason the agent can read. Applies nothing. */
  rejectProposal(proposalId: string, reason: string): boolean {
    const p = this.getProposal(proposalId);
    if (!p || p.status !== "pending") return false;
    this.db
      .prepare(`UPDATE library_proposals SET status = 'rejected', reason = ?, resolved_at = ? WHERE proposal_id = ?`)
      .run(reason, Date.now(), proposalId);
    this.store.append({
      agentId: p.agentId,
      streamId: "library",
      actor: "user",
      correlationId: proposalId,
      type: "library.proposal_rejected",
      payload: { proposalId, agentId: p.agentId, path: p.path, reason },
    });
    return true;
  }
}
