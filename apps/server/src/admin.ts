import type express from "express";
import type { Request, Response, NextFunction } from "express";
import type { Office } from "@hedoffice/core";
import { isValidLibraryPath } from "@hedoffice/core";
import { PermissionStage } from "@hedoffice/schema";
import { safeEqual } from "./auth.js";

/**
 * Operator-only HTTP surface for managing agents on a *running* server —
 * the practical path on a cloud deploy (Railway) where there is no local CLI.
 *
 * Disabled unless an admin token is configured; every route requires
 * `Authorization: Bearer <adminToken>`. This token is the operator's key —
 * never give it to an agent.
 *
 * SECRET-FREE BY DESIGN: no route here creates, returns, or accepts an agent
 * token. Registration and rotation happen only through environment seeding
 * (Railway Variables → HEDOFFICE_AGENT_TOKEN_*, see env-agents.ts) or the
 * local CLI. The API covers the non-secret lifecycle: list, stage, charter,
 * and revoke (the kill switch).
 */
export function attachAdminApi(
  app: express.Express,
  office: Office,
  adminToken: string,
): void {
  const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    const h = req.headers.authorization;
    const token = typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7) : undefined;
    if (!safeEqual(token, adminToken)) {
      office.store.append({
        agentId: "admin",
        streamId: "security",
        actor: "system",
        type: "audit.security_event",
        payload: { agentId: "admin", kind: "admin_auth_failed", detail: req.path },
      });
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };

  // --- kill switch & suspension (docs/SECURITY.md R5.6) ----------------------

  /** Engage the global kill switch: drop every session, refuse new connections. */
  app.post("/admin/killswitch", requireAdmin, (req, res) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "admin killswitch";
    const sessionsClosed = office.control.killAll(reason);
    res.json({ ok: true, active: true, sessionsClosed });
  });

  /** Lift the kill switch and allow connections again. */
  app.post("/admin/killswitch/restore", requireAdmin, (req, res) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "admin restore";
    office.control.liftKill(reason);
    res.json({ ok: true, active: false });
  });

  /** Freeze one cubicle: its agent's tool calls are refused until resumed. */
  app.post("/admin/agents/:id/suspend", requireAdmin, (req, res) => {
    const id = req.params.id ?? "";
    if (!office.agents.has(id)) {
      res.status(404).json({ error: "unknown agent" });
      return;
    }
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "admin suspend";
    office.control.suspend(id, reason);
    office.control.forceDisconnect(id);
    res.json({ ok: true, agentId: id, suspended: true });
  });

  /** Unfreeze a previously-suspended cubicle. */
  app.post("/admin/agents/:id/resume", requireAdmin, (req, res) => {
    const id = req.params.id ?? "";
    if (!office.agents.has(id)) {
      res.status(404).json({ error: "unknown agent" });
      return;
    }
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "admin resume";
    office.control.resume(id, reason);
    res.json({ ok: true, agentId: id, suspended: false });
  });

  app.get("/admin/agents", requireAdmin, (_req, res) => {
    res.json({ agents: office.agents.list() });
  });

  app.post("/admin/agents/:id/revoke", requireAdmin, (req, res) => {
    const id = req.params.id ?? "";
    const done = office.agents.revoke(id);
    if (!done) {
      res.status(404).json({ error: "unknown or already-revoked agent" });
      return;
    }
    // Kill the live session too — revocation must take effect immediately, not
    // only on the agent's next reconnect (docs/SECURITY.md F5).
    const sessionsClosed = office.control.forceDisconnect(id);
    res.json({ ok: true, sessionsClosed });
  });

  app.post("/admin/agents/:id/stage", requireAdmin, (req, res) => {
    const stageParse = PermissionStage.safeParse(req.body?.stage);
    if (!stageParse.success) {
      res.status(400).json({ error: "invalid stage", allowed: PermissionStage.options });
      return;
    }
    if (!office.agents.setStage((req.params.id ?? ""), stageParse.data)) {
      res.status(404).json({ error: "unknown agent" });
      return;
    }
    res.json({ agentId: (req.params.id ?? ""), stage: stageParse.data });
  });

  app.get("/admin/agents/:id/charter", requireAdmin, (req, res) => {
    if (!office.agents.has((req.params.id ?? ""))) {
      res.status(404).json({ error: "unknown agent" });
      return;
    }
    res.json({ agentId: (req.params.id ?? ""), charter: office.cubicles.charterRead((req.params.id ?? "")) });
  });

  app.put("/admin/agents/:id/charter", requireAdmin, (req, res) => {
    if (!office.agents.has((req.params.id ?? ""))) {
      res.status(404).json({ error: "unknown agent" });
      return;
    }
    const content = typeof req.body?.content === "string" ? req.body.content : undefined;
    if (content === undefined) {
      res.status(400).json({ error: "content (string) is required" });
      return;
    }
    office.cubicles.charterWrite((req.params.id ?? ""), content);
    res.json({ ok: true, byteLen: Buffer.byteLength(content, "utf8") });
  });

  // --- governance library (shared docs; operator-authored, agent-readable) ----
  // Doc paths contain slashes, so they ride in the wildcard tail of the route.

  app.get("/admin/library", requireAdmin, (_req, res) => {
    res.json({ docs: office.library.list() });
  });

  // --- library proposals (Phase 6 R6.4) --------------------------------------
  // Registered before the /admin/library/* wildcard so "proposals" isn't read
  // as a doc path.

  app.get("/admin/library/proposals", requireAdmin, (req, res) => {
    const status = req.query.status;
    const filter =
      status === "pending" || status === "approved" || status === "rejected"
        ? ({ status } as const)
        : {};
    res.json({ proposals: office.library.listProposals(filter) });
  });

  app.post("/admin/library/proposals/:id/approve", requireAdmin, (req, res) => {
    if (!office.library.approveProposal(req.params.id ?? "")) {
      res.status(404).json({ error: "unknown or already-resolved proposal" });
      return;
    }
    res.json({ ok: true, applied: true });
  });

  app.post("/admin/library/proposals/:id/reject", requireAdmin, (req, res) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "rejected";
    if (!office.library.rejectProposal(req.params.id ?? "", reason)) {
      res.status(404).json({ error: "unknown or already-resolved proposal" });
      return;
    }
    res.json({ ok: true, applied: false });
  });

  app.get("/admin/library/*", requireAdmin, (req, res) => {
    const path = (req.params as Record<string, string>)[0] ?? "";
    const content = office.library.read(path);
    if (content === undefined) {
      res.status(404).json({ error: "unknown doc", path });
      return;
    }
    res.json({ path, content });
  });

  app.put("/admin/library/*", requireAdmin, (req, res) => {
    const path = (req.params as Record<string, string>)[0] ?? "";
    if (!isValidLibraryPath(path)) {
      res.status(400).json({ error: "invalid doc path", path });
      return;
    }
    const content = typeof req.body?.content === "string" ? req.body.content : undefined;
    if (content === undefined) {
      res.status(400).json({ error: "content (string) is required" });
      return;
    }
    office.library.write(path, content);
    res.json({ ok: true, path, byteLen: Buffer.byteLength(content, "utf8") });
  });

  app.delete("/admin/library/*", requireAdmin, (req, res) => {
    const path = (req.params as Record<string, string>)[0] ?? "";
    if (!office.library.delete(path)) {
      res.status(404).json({ error: "unknown doc", path });
      return;
    }
    res.json({ ok: true, path });
  });
}
