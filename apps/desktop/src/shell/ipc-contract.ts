import type {
  ApprovalDecision,
  CubicleDetailView,
  CubicleView,
} from "@hedoffice/schema";

/**
 * The IPC contract between the Electron main process (which runs
 * `@hedoffice/core` + the MCP server) and the renderer. Pure types + channel
 * names only — **browser-safe** (no Node/SQLite/electron imports), so the
 * renderer can import it. ADR-005: the shell is Electron.
 */

export const IPC = {
  // renderer -> main (invoke/handle)
  getFloor: "hedoffice:get-floor",
  getDetail: "hedoffice:get-detail",
  registerAgent: "hedoffice:register-agent",
  resolveApproval: "hedoffice:resolve-approval",
  // main -> renderer (send/on)
  approvalRequest: "hedoffice:approval-request",
  update: "hedoffice:update",
} as const;

export interface RegisteredAgentDTO {
  agentId: string;
  token: string;
}

/** A pending approval surfaced to the human (the renderer's approval modal). */
export interface ApprovalRequestDTO {
  approvalId: string;
  agentId: string;
  action: string;
  tool: string;
}

/** The API the preload script exposes on `window.hedoffice`. */
export interface HedofficeApi {
  getFloor(): Promise<CubicleView[]>;
  getDetail(agentId: string): Promise<CubicleDetailView>;
  registerAgent(name: string): Promise<RegisteredAgentDTO>;
  /** Settle a pending approval (from the approval modal). */
  resolveApproval(approvalId: string, decision: ApprovalDecision): Promise<void>;
  /** Subscribe to approval requests; returns an unsubscribe fn. */
  onApprovalRequest(cb: (req: ApprovalRequestDTO) => void): () => void;
  /** Subscribe to "floor changed" pings (re-fetch on fire); returns unsubscribe. */
  onUpdate(cb: () => void): () => void;
}

declare global {
  interface Window {
    /** Present only inside the Electron shell (set by the preload script). */
    hedoffice?: HedofficeApi;
  }
}
