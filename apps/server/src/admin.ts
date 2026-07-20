import type express from "express";
import type { Request, Response, NextFunction } from "express";
import type { Office } from "@hedoffice/core";
import { PermissionStage } from "@hedoffice/schema";

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
    if (token !== adminToken) {
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

  app.get("/admin/agents", requireAdmin, (_req, res) => {
    res.json({ agents: office.agents.list() });
  });

  app.post("/admin/agents/:id/revoke", requireAdmin, (req, res) => {
    const done = office.agents.revoke((req.params.id ?? ""));
    if (!done) {
      res.status(404).json({ error: "unknown or already-revoked agent" });
      return;
    }
    res.json({ ok: true });
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
}
