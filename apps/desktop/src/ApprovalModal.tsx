import type { ReactNode } from "react";

/**
 * The approval-gate modal — the safety-critical surface for the Phase 3
 * `ApprovalGate`. Strongest border, glyph- AND color-coded choices, the
 * requested action shown verbatim in a feed-style inset. Legible in monochrome
 * (the glyphs ✓ / ✗ carry the meaning; color is reinforcement).
 */
export function ApprovalModal({
  action,
  onResolve,
}: {
  action: string;
  onResolve: (decision: "allow" | "deny") => void;
}): ReactNode {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="approval required">
      <div className="approval">
        <div className="approval-title">
          <span style={{ color: "var(--feedback-warn)" }}>⚠</span> APPROVAL REQUIRED
        </div>
        <div className="approval-sub">the agent wants to:</div>
        <pre className="approval-action">{action}</pre>
        <div className="approval-actions">
          <button className="btn btn-approve" onClick={() => onResolve("allow")} autoFocus>
            [ <span style={{ color: "var(--feedback-success)" }}>✓</span> Approve ]
          </button>
          <button className="btn btn-deny" onClick={() => onResolve("deny")}>
            [ <span style={{ color: "var(--feedback-error)" }}>✗</span> Deny ]
          </button>
        </div>
      </div>
    </div>
  );
}
