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

  constructor(private readonly opts: HedOfficeServerOptions = {}) {
    this.office = opts.office ?? new Office();
    this.app = express();
    this.app.use(express.json());
    this.app.post("/mcp", (req, res) => void this.handlePost(req, res));
    this.app.get("/mcp", (req, res) => void this.handleSessionRequest(req, res));
    this.app.delete("/mcp", (req, res) => void this.handleSessionRequest(req, res));
    // Liveness + a tiny landing payload (used by cloud health checks).
    this.app.get("/healthz", (_req, res) => {
      res.json({ ok: true, sessions: this.sessions.size });
    });
    this.app.get("/", (_req, res) => {
      res.json({ name: "hedoffice", status: "ok", mcp: "/mcp" });
    });
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  private bearer(req: Request): string | undefined {
    const h = req.headers.authorization;
    return typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7) : undefined;
  }

  private async handlePost(req: Request, res: Response): Promise<void> {
    const sid = req.headers["mcp-session-id"];
    const existing = typeof sid === "string" ? this.sessions.get(sid) : undefined;
    if (existing) {
      await existing.transport.handleRequest(req, res, req.body);
      return;
    }

    if (sid === undefined && isInitializeRequest(req.body)) {
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
        this.sessions.set(newSid, { transport, server, agentId });
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
    await session.transport.handleRequest(req, res);
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
        resolve(addr.port);
      });
    });
  }

  async close(): Promise<void> {
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
