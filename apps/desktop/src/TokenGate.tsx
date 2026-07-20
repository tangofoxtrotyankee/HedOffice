import { useState, type ReactNode } from "react";

/**
 * Operator login for the web-served UI: one field for the operator token
 * (HEDOFFICE_ADMIN_TOKEN on the server). Reuses the approval-modal chrome —
 * this is a gate, so it borrows the strongest border in the design system.
 */
export function TokenGate({
  error,
  onSubmit,
}: {
  error?: string;
  onSubmit: (token: string) => void;
}): ReactNode {
  const [value, setValue] = useState("");
  const submit = (): void => {
    if (value.trim()) onSubmit(value.trim());
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="operator access">
      <div className="approval">
        <div className="approval-title">
          <span style={{ color: "var(--feedback-info)" }}>⚙</span> OPERATOR ACCESS
        </div>
        <div className="approval-sub">
          enter the operator token for this office (HEDOFFICE_ADMIN_TOKEN):
        </div>
        <input
          className="token-input"
          type="password"
          value={value}
          autoFocus
          placeholder="operator token"
          aria-label="operator token"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        {error ? (
          <div className="token-error" role="alert">
            ✗ {error}
          </div>
        ) : null}
        <div className="approval-actions">
          <button className="btn btn-approve" onClick={submit}>
            [ <span style={{ color: "var(--feedback-success)" }}>✓</span> Connect ]
          </button>
        </div>
      </div>
    </div>
  );
}
