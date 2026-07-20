import type { EventStore } from "@hedoffice/event-store";
import { sha256 } from "./ids.js";

export interface LibraryDocMeta {
  path: string;
  byteLen: number;
  updatedAt: number;
}

/** Paths are vault-style relative markdown paths: "constitution.md",
 *  "decision_trees/user_registered.md". Normalized, no traversal, no leading
 *  slash. */
const PATH_RE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i;

export function isValidLibraryPath(path: string): boolean {
  return PATH_RE.test(path) && !path.split("/").some((seg) => seg === "." || seg === "..");
}

/**
 * The shared governance library — the office's "vault" of operator-authored
 * documents (constitution, ethics, authority limits, decision trees, process
 * docs). Office-wide and read-only for agents (served via `library.*` tools);
 * only operator surfaces (CLI / admin API) write. Every write/delete emits
 * `library.written` with a content hash, so the append-only log is the
 * tamper-evident change history.
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

  write(path: string, content: string): void {
    if (!isValidLibraryPath(path)) {
      throw new Error(`invalid library path: "${path}"`);
    }
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
      type: "library.written",
      payload: {
        path,
        newHash: sha256(content),
        byteLen: Buffer.byteLength(content, "utf8"),
      },
    });
  }

  delete(path: string): boolean {
    const info = this.db.prepare(`DELETE FROM library_docs WHERE path = ?`).run(path);
    if (info.changes === 0) return false;
    this.store.append({
      agentId: "office",
      streamId: "library",
      actor: "user",
      type: "library.written",
      payload: { path, newHash: null, byteLen: 0 },
    });
    return true;
  }
}
