import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server as HttpServer } from "node:http";
import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { Office } from "@hedoffice/core";
import { registerCubicleTools } from "./tools.js";

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  agentId: string;
  /** The HTTP Origin seen at initialize (null for non-browser clients). */
  origin: string | null;
  /** Epoch ms of the last request on this session (for idle expiry). */
  lastSeen: number;
}

export interface HedOfficeServerOptions {
  /** Reuse an existing Office (event store). Defaults to a fresh in-memory one. */
  office?: Office;
  /**
   * Restrict the Origin header (DNS-rebinding protection, per the 2025-11-25
   * spec). When set, requests with a present-but-unlisted Origin get 403.
   */
  allowedOrigins?: string[];
  /** Override the allowed Host list. Defaults to the bound 127.0.0.1:<port>. */
  allowedHosts?: string[];
  /**
   * DNS-rebinding protection (localhost defense). Default `true` for local use;
   * set `false` for a cloud deploy behind a proxy, where the public Host header
   * would otherwise be rejected and protection relies on bearer tokens instead.
   */
  enableDnsRebindingProtection?: boolean;
  /**
   * Idle session expiry (R5.2 / F11). A session with no request for this long is
   * force-closed and flips to `offline`. Default 30 min. Set small in tests.
   */
  idleTimeoutMs?: number;
  /**
   * Per-request bearer re-check (R5.2 / F13). When true, every request on an
   * existing session must still carry a bearer that resolves to the session's
   * bound agent — a stolen session id alone is no longer sufficient. Enabled on
   * the hosted deploy via HEDOFFICE_REQUIRE_TOKEN=1.
   */
  requireToken?: boolean;
}

function jsonRpcError(code: number, message: string) {
  return { jsonrpc: "2.0", error: { code, message }, id: null };
}

/**
 * The HedOffice MCP server: one stateful Streamable HTTP endpoint that many BYO
 * agents connect to as clients. Each `initialize` mints a session and a
 * dedicated `McpServer` instance bound to the caller's `agentId`, stored in a
 * `sessions` map and torn down on `transport.onclose` (ADR-002). This per-session
 * factory is what guarantees state isolation between cubicles.
 */
export class HedOfficeServer {
  readonly office: Office;
  readonly app: express.Express;
  private readonly sessions = new Map<string, Session>();
  private httpServer?: HttpServer;
  private boundHost?: string;
  private uiRoot?: string;
  private readonly idleTimeoutMs: number;
  private readonly requireToken: boolean;
  private sweeper?: ReturnType<typeof setInterval>;

  constructor(private readonly opts: HedOfficeServerOptions = {}) {
    this.office = opts.office ?? new Office();
    this.idleTimeoutMs = opts.idleTimeoutMs ?? 30 * 60_000;
    this.requireToken = opts.requireToken ?? false;
    // The kill switch / revoke path drops live sockets through this hook
    // (the core owns policy in the event log; the server owns the sessions).
    this.office.control.setForceDisconnect((target) => this.closeSessions(target));
    this.app = express();
    // 2mb: room for large charters/notebook payloads; still a sane abuse cap.
    this.app.use(express.json({ limit: "2mb" }));
    this.app.post("/mcp", (req, res) => void this.handlePost(req, res));
    this.app.get("/mcp", (req, res) => void this.handleSessionRequest(req, res));
    this.app.delete("/mcp", (req, res) => void this.handleSessionRequest(req, res));
    // Liveness + a tiny landing payload (used by cloud health checks).
    this.app.get("/healthz", (_req, res) => {
      res.json({ ok: true, sessions: this.sessions.size });
    });
    this.app.get("/", (_req, res, next) => {
      if (this.uiRoot) {
        next(); // fall through to the express.static mount from serveUi()
        return;
      }
      res.json({ name: "hedoffice", status: "ok", mcp: "/mcp" });
    });
  }

  /**
   * Mount the built office UI (index.html + hashed assets) at the root. Safe to
   * call once, before listen(): /mcp, /healthz and any /admin or /ui/api routes
   * are registered earlier on the stack, so they always win over static files.
   */
  serveUi(root: string): void {
    this.uiRoot = root;
    this.app.use(express.static(root, { index: "index.html" }));
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  private bearer(req: Request): string | undefined {
    const h = req.headers.authorization;
    return typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7) : undefined;
  }

  private originOf(req: Request): string | null {
    const o = req.headers.origin;
    return typeof o === "string" ? o : null;
  }

  /**
   * Per-request checks on an already-established session (R5.2). Returns false
   * (and has already written the response) when the request must be refused:
   * the office is killed, the session id is being replayed from a different
   * origin than it was bound to, or per-request token re-check is on and fails.
   * A blocked replay/re-check is logged as a `security.violation`.
   */
  private guardSession(session: Session, req: Request, res: Response): boolean {
    if (this.office.control.isKilled()) {
      res.status(503).json(jsonRpcError(-32002, "Service unavailable: kill switch engaged"));
      return false;
    }
    const reqOrigin = this.originOf(req);
    if (session.origin !== null && reqOrigin !== null && reqOrigin !== session.origin) {
      this.office.control.violation(
        session.agentId,
        "session_replay_origin",
        `session used from origin ${reqOrigin}, bound to ${session.origin}`,
        reqOrigin,
      );
      res.status(403).json(jsonRpcError(-32003, "Forbidden: session origin mismatch"));
      return false;
    }
    if (this.requireToken) {
      const token = this.bearer(req);
      const who = token ? this.office.agents.resolveToken(token) : undefined;
      if (who !== session.agentId) {
        this.office.control.violation(
          session.agentId,
          "token_recheck_failed",
          "per-request bearer re-check did not resolve to the bound agent",
          reqOrigin,
        );
        res.status(401).json(jsonRpcError(-32001, "Unauthorized: token re-check failed"));
        return false;
      }
    }
    session.lastSeen = Date.now();
    return true;
  }

  private async handlePost(req: Request, res: Response): Promise<void> {
    const sid = req.headers["mcp-session-id"];
    const existing = typeof sid === "string" ? this.sessions.get(sid) : undefined;
    if (existing) {
      if (!this.guardSession(existing, req, res)) return;
      await existing.transport.handleRequest(req, res, req.body);
      return;
    }

    if (sid === undefined && isInitializeRequest(req.body)) {
      if (this.office.control.isKilled()) {
        res.status(503).json(jsonRpcError(-32002, "Service unavailable: kill switch engaged"));
        return;
      }
      await this.initializeSession(req, res);
      return;
    }

    res.status(400).json(jsonRpcError(-32000, "Bad Request: no valid session id"));
  }

  private async initializeSession(req: Request, res: Response): Promise<void> {
    const token = this.bearer(req);
    const agentId = token ? this.office.agents.resolveToken(token) : undefined;
    if (!agentId) {
      this.office.store.append({
        agentId: token ? "unknown" : "anonymous",
        streamId: "security",
        actor: "system",
        type: "audit.security_event",
        payload: { agentId: "unknown", kind: "auth_failed", detail: "invalid bearer token" },
      });
      res.status(401).json(jsonRpcError(-32001, "Unauthorized: invalid bearer token"));
      return;
    }

    const server = new McpServer({ name: "hedoffice", version: "0.0.0" });
    registerCubicleTools(server, agentId, this.office);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: this.opts.enableDnsRebindingProtection ?? true,
      allowedHosts: this.allowedHosts(),
      allowedOrigins: this.opts.allowedOrigins,
      onsessioninitialized: (newSid) => {
        this.sessions.set(newSid, {
          transport,
          server,
          agentId,
          origin: this.originOf(req),
          lastSeen: Date.now(),
        });
        this.office.presence.connect(agentId);
      },
    });

    transport.onclose = () => {
      const id = transport.sessionId;
      if (id && this.sessions.delete(id)) {
        this.office.presence.disconnect(agentId);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  private async handleSessionRequest(req: Request, res: Response): Promise<void> {
    const sid = req.headers["mcp-session-id"];
    const session = typeof sid === "string" ? this.sessions.get(sid) : undefined;
    if (!session) {
      res.status(400).send("Invalid or missing session id");
      return;
    }
    if (!this.guardSession(session, req, res)) return;
    await session.transport.handleRequest(req, res);
  }

  /**
   * Force-close sessions for one agent (revoke) or all of them ("*", kill
   * switch). Collect targets first, then close — `transport.close()` fires
   * `onclose`, which mutates the sessions map. Returns the count closed.
   */
  private closeSessions(target: string | "*"): number {
    const targets = [...this.sessions.values()].filter(
      (s) => target === "*" || s.agentId === target,
    );
    for (const s of targets) void s.transport.close();
    return targets.length;
  }

  /** Close sessions idle longer than the configured timeout (R5.2 / F11). */
  private sweepIdle(): void {
    const now = Date.now();
    for (const s of [...this.sessions.values()]) {
      if (now - s.lastSeen > this.idleTimeoutMs) {
        this.office.store.append({
          agentId: s.agentId,
          streamId: "security",
          actor: "system",
          type: "audit.security_event",
          payload: {
            agentId: s.agentId,
            kind: "session_idle_expired",
            detail: `no activity for > ${this.idleTimeoutMs}ms`,
          },
        });
        void s.transport.close();
      }
    }
  }

  private allowedHosts(): string[] | undefined {
    if (this.opts.allowedHosts) return this.opts.allowedHosts;
    return this.boundHost ? [this.boundHost, this.boundHost.replace("127.0.0.1", "localhost")] : undefined;
  }

  /**
   * Bind to a port (0 = ephemeral) and host (default loopback). Resolves with the
   * actual port. Use `0.0.0.0` for a cloud deploy.
   */
  listen(port = 0, host = "127.0.0.1"): Promise<number> {
    return new Promise((resolve) => {
      this.httpServer = this.app.listen(port, host, () => {
        const addr = this.httpServer!.address() as AddressInfo;
        this.boundHost = `127.0.0.1:${addr.port}`;
        // Sweep for idle sessions. Interval is the min of the timeout and 60 s,
        // so a short test timeout still expires promptly. unref() so the timer
        // never keeps the process alive on its own.
        const period = Math.min(this.idleTimeoutMs, 60_000);
        this.sweeper = setInterval(() => this.sweepIdle(), period);
        this.sweeper.unref?.();
        resolve(addr.port);
      });
    });
  }

  async close(): Promise<void> {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = undefined;
    }
    for (const session of this.sessions.values()) {
      await session.transport.close();
    }
    this.sessions.clear();
    await new Promise<void>((resolve) => {
      if (this.httpServer) this.httpServer.close(() => resolve());
      else resolve();
    });
    this.office.close();
  }
}
