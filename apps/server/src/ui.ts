import type express from "express";
import type { Request, Response, NextFunction } from "express";
import {
  buildCubicleDetail,
  buildFloorView,
  createApprovalBridge,
  type ApprovalBridge,
  type ApprovalRequest,
  type Office,
} from "@hedoffice/core";
import { ApprovalDecision } from "@hedoffice/schema";

/**
 * The operator web-UI API: what the browser renderer (served statically at `/`)
 * talks to. Guarded by the same operator token as the admin API — via the
 * Authorization header, or `?token=` for the SSE stream (EventSource cannot set
 * headers; over HTTPS the query token only surfaces in server logs — noted in
 * docs/DEPLOY.md).
 *
 * Secret-free like the admin API: nothing here creates or returns a token.
 *
 * Surfaces:
 * - GET  /ui/api/floor                     → { floor: CubicleView[] }
 * - GET  /ui/api/detail/:agentId           → CubicleDetailView
 * - POST /ui/api/approvals/:approvalId     → settle a pending approval
 * - POST /ui/api/say/:agentId              → user text into a cubicle channel
 * - GET  /ui/api/events                    → SSE: `update` pings (presence),
 *   `approval` requests (replayed for late connectors), `approval-resolved`
 *
 * Returns the approval bridge whose `approver` the caller wires into the
 * office's ApprovalGate — browser decisions settle it via the POST route.
 */

/** Wire shape of an approval sent to the renderer (mirrors ApprovalRequestDTO
 *  in the desktop ipc-contract; defined locally so the server never imports
 *  renderer code). */
interface ApprovalDTO {
  approvalId: string;
  agentId: string;
  action: string;
  tool: string;
}

const toDTO = (r: ApprovalRequest): ApprovalDTO => ({
  approvalId: r.approvalId,
  agentId: r.agentId,
  action: r.action,
  tool: r.tool,
});

export function attachUiApi(
  app: express.Express,
  office: Office,
  adminToken: string,
  updateListeners: Set<() => void>,
): ApprovalBridge {
  const clients = new Set<Response>();

  const send = (res: Response, event: string, data: unknown = {}): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const broadcast = (event: string, data: unknown = {}): void => {
    for (const client of clients) send(client, event, data);
  };

  const inner = createApprovalBridge((req) => broadcast("approval", toDTO(req)));
  // Every successful resolution — operator click OR the boot-level timeout
  // auto-deny — must clear the prompt in every connected browser, so the
  // broadcast lives on resolve() itself, not on the POST route.
  const bridge: ApprovalBridge = {
    ...inner,
    resolve: (approvalId, decision) => {
      const ok = inner.resolve(approvalId, decision);
      if (ok) broadcast("approval-resolved", { approvalId });
      return ok;
    },
  };
  updateListeners.add(() => broadcast("update"));

  const requireUi = (req: Request, res: Response, next: NextFunction): void => {
    const h = req.headers.authorization;
    const header = typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7) : undefined;
    const query = typeof req.query.token === "string" ? req.query.token : undefined;
    if ((header ?? query) !== adminToken) {
      office.store.append({
        agentId: "admin",
        streamId: "security",
        actor: "system",
        type: "audit.security_event",
        payload: { agentId: "admin", kind: "ui_auth_failed", detail: req.path },
      });
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };

  app.get("/ui/api/floor", requireUi, (_req, res) => {
    res.json({ floor: buildFloorView(office.store) });
  });

  app.get("/ui/api/detail/:agentId", requireUi, (req, res) => {
    const agentId = req.params.agentId ?? "";
    if (!office.agents.has(agentId)) {
      res.status(404).json({ error: "unknown agent" });
      return;
    }
    res.json(buildCubicleDetail(office.store, agentId));
  });

  app.post("/ui/api/approvals/:approvalId", requireUi, (req, res) => {
    const decision = ApprovalDecision.safeParse(req.body?.decision);
    if (!decision.success) {
      res.status(400).json({ error: "decision must be allow|deny" });
      return;
    }
    const approvalId = req.params.approvalId ?? "";
    if (!bridge.resolve(approvalId, decision.data)) {
      res.status(404).json({ error: "unknown or already-resolved approval" });
      return;
    }
    res.json({ ok: true });
  });

  app.post("/ui/api/say/:agentId", requireUi, (req, res) => {
    const agentId = req.params.agentId ?? "";
    if (!office.agents.has(agentId)) {
      res.status(404).json({ error: "unknown agent" });
      return;
    }
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "text (string) is required" });
      return;
    }
    const eventId = office.channel.userSpoke(agentId, text);
    res.json({ ok: true, eventId });
  });

  app.get("/ui/api/events", requireUi, (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Defeat proxy buffering (Railway edge) so events flush immediately.
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    clients.add(res);
    // A late-connecting (or reloaded) operator still sees open approvals.
    for (const pending of bridge.pending()) send(res, "approval", toDTO(pending));
    const heartbeat = setInterval(() => res.write(": hb\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });
  });

  return bridge;
}
