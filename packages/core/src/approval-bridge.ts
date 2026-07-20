import type { ApprovalDecision } from "@hedoffice/schema";
import type { ApprovalRequest } from "./approvals.js";

/**
 * Bridges the core `ApprovalGate` to a human surface (the Electron renderer or
 * the web UI's SSE stream). When the gate needs a decision it calls
 * `approver(req)`, which forwards the request to the surface (via `notify`) and
 * returns a Promise that stays pending — flipping the cubicle to `blocked` —
 * until the surface calls back through `resolve()`. Pure (no electron, no
 * express), so it's unit-tested headlessly.
 */
export interface ApprovalBridge {
  approver: (req: ApprovalRequest) => Promise<ApprovalDecision>;
  /** Settle a pending request from the human surface. Returns false if unknown. */
  resolve: (approvalId: string, decision: ApprovalDecision) => boolean;
  pendingIds: () => string[];
  /** Full pending requests — lets a reconnecting UI replay open approvals. */
  pending: () => ApprovalRequest[];
}

export function createApprovalBridge(
  notify: (req: ApprovalRequest) => void,
): ApprovalBridge {
  const pending = new Map<
    string,
    { req: ApprovalRequest; settle: (d: ApprovalDecision) => void }
  >();
  return {
    approver: (req) =>
      new Promise<ApprovalDecision>((resolve) => {
        pending.set(req.approvalId, { req, settle: resolve });
        notify(req);
      }),
    resolve: (approvalId, decision) => {
      const entry = pending.get(approvalId);
      if (!entry) return false;
      pending.delete(approvalId);
      entry.settle(decision);
      return true;
    },
    pendingIds: () => [...pending.keys()],
    pending: () => [...pending.values()].map((e) => e.req),
  };
}
