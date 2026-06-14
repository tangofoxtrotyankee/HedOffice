import type { CubicleDetailView, CubicleView } from "@hedoffice/schema";

/**
 * The IPC contract between the Electron main process (which runs
 * `@hedoffice/core` + the MCP server) and the renderer. Pure types + channel
 * names only — **browser-safe** (no Node/SQLite/electron imports), so the
 * renderer can import it. ADR-005: the shell is Electron.
 */

export const IPC = {
  getFloor: "hedoffice:get-floor",
  getDetail: "hedoffice:get-detail",
  registerAgent: "hedoffice:register-agent",
} as const;

export interface RegisteredAgentDTO {
  agentId: string;
  token: string;
}

/** The API the preload script exposes on `window.hedoffice`. */
export interface HedofficeApi {
  getFloor(): Promise<CubicleView[]>;
  getDetail(agentId: string): Promise<CubicleDetailView>;
  registerAgent(name: string): Promise<RegisteredAgentDTO>;
}

declare global {
  interface Window {
    /** Present only inside the Electron shell (set by the preload script). */
    hedoffice?: HedofficeApi;
  }
}
