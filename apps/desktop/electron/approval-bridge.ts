import type { ApprovalRequest } from "@hedoffice/core";
import type { ApprovalDecision } from "@hedoffice/schema";

/**
 * Bridges the core `ApprovalGate` to the human in the renderer. When the gate
 * needs a decision it calls `approver(req)`, which forwards the request to the
 * renderer (via `notify`) and returns a Promise that stays pending — flipping the
 * cubicle to `blocked` — until the renderer calls back through `resolve()`. Pure
 * (no electron), so it's unit-tested headlessly.
 */
export interface ApprovalBridge {
  approver: (req: ApprovalRequest) => Promise<ApprovalDecision>;
  /** Settle a pending request from the renderer. Returns false if unknown. */
  resolve: (approvalId: string, decision: ApprovalDecision) => boolean;
  pendingIds: () => string[];
}

export function createApprovalBridge(
  notify: (req: ApprovalRequest) => void,
): ApprovalBridge {
  const pending = new Map<string, (d: ApprovalDecision) => void>();
  return {
    approver: (req) =>
      new Promise<ApprovalDecision>((resolve) => {
        pending.set(req.approvalId, resolve);
        notify(req);
      }),
    resolve: (approvalId, decision) => {
      const settle = pending.get(approvalId);
      if (!settle) return false;
      pending.delete(approvalId);
      settle(decision);
      return true;
    },
    pendingIds: () => [...pending.keys()],
  };
}
