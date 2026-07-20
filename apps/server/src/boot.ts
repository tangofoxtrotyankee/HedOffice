import { createApprovalBridge, Office, type ApprovalBridge } from "@hedoffice/core";
import { HedOfficeServer } from "@hedoffice/mcp-server";
import { attachAdminApi } from "./admin.js";
import { seedAgentsFromEnv, type SeededAgent } from "./env-agents.js";
import { attachUiApi } from "./ui.js";
import { resolveUiDist } from "./ui-dist.js";

export interface BootOptions {
  /** Register a "demo" agent and return its token (for a test deploy). */
  demoAgent?: boolean;
  /** SQLite location; defaults to in-memory. Use a mounted volume in cloud. */
  location?: string;
  /**
   * Enables the operator admin API (`/admin/agents…`) AND the operator web-UI
   * API (`/ui/api/…`), both guarded by this bearer token. Leave unset to keep
   * every operator surface off. Neither surface carries agent secrets — agent
   * tokens are provisioned only via env seeding.
   */
  adminToken?: string;
  /** Env source for agent seeding (HEDOFFICE_AGENT_TOKEN_*); default process.env. */
  env?: Record<string, string | undefined>;
  /** Test override for the UI static root (defaults to @hedoffice/desktop/dist). */
  uiDist?: string;
  /**
   * How long a `prompt` approval may sit unanswered in the web UI before it is
   * auto-denied (an unattended cloud deploy must not wedge agents forever).
   */
  approvalTimeoutMs?: number;
}

export interface Booted {
  server: HedOfficeServer;
  office: Office;
  demoToken?: string;
  /** Agents provisioned from env vars this boot (names/stages — never tokens). */
  seededAgents: SeededAgent[];
  /** The web-UI approval bridge (present when adminToken is set). */
  bridge?: ApprovalBridge;
  /** Absolute path of the static UI being served at `/`, if found. */
  uiRoot?: string;
}

/**
 * Build a headless HedOffice MCP server suitable for a cloud deploy. DNS-rebinding
 * protection (a localhost defense) is disabled because the public Host header
 * sits behind a proxy; protection in cloud relies on per-agent bearer tokens.
 * The caller binds it with `server.listen(port, "0.0.0.0")`.
 *
 * When `adminToken` is set the office UI becomes fully operational over HTTP:
 * static renderer at `/`, `/ui/api` (floor, detail, approvals, SSE events),
 * and the approval gate's human decisions arrive from the browser.
 */
export function bootHedOffice(opts: BootOptions = {}): Booted {
  // The update bus: "something changed" pings fanned out to SSE clients
  // (parity with the Electron shell, which pings the renderer on presence
  // transitions and lets it re-fetch).
  const updateListeners = new Set<() => void>();
  const office = new Office({
    location: opts.location,
    onPresenceChange: () => {
      for (const listener of updateListeners) listener();
    },
  });
  const server = new HedOfficeServer({ office, enableDnsRebindingProtection: false });

  let bridge: ApprovalBridge | undefined;
  let uiRoot: string | undefined;
  if (opts.adminToken) {
    attachAdminApi(server.app, office, opts.adminToken);
    bridge = attachUiApi(server.app, office, opts.adminToken, updateListeners);
    // The web UI is the human approver in cloud. Unanswered prompts deny after
    // a timeout so an unattended deploy can't leave agents blocked forever.
    const timeoutMs = opts.approvalTimeoutMs ?? 5 * 60_000;
    const webBridge = bridge;
    office.approvals.setApprover((req) => {
      const decision = webBridge.approver(req);
      const timer = setTimeout(() => webBridge.resolve(req.approvalId, "deny"), timeoutMs);
      return decision.finally(() => clearTimeout(timer));
    });
  }
  uiRoot = resolveUiDist(opts.uiDist);
  if (uiRoot) server.serveUi(uiRoot);

  // Secrets come from the environment (Railway Variables): provision/rotate
  // agents from HEDOFFICE_AGENT_TOKEN_* before anything else runs.
  const seededAgents = seedAgentsFromEnv(office, opts.env ?? process.env);
  // Only seed the demo agent into an EMPTY registry — never alongside real
  // env-provisioned agents, and never re-minted on a persistent-DB restart.
  const demoToken =
    opts.demoAgent && office.agents.list().length === 0
      ? office.registerAgent("demo").token
      : undefined;
  return { server, office, demoToken, seededAgents, bridge, uiRoot };
}
