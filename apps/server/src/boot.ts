import { Office } from "@hedoffice/core";
import { HedOfficeServer } from "@hedoffice/mcp-server";
import { attachAdminApi } from "./admin.js";
import { seedAgentsFromEnv, type SeededAgent } from "./env-agents.js";

export interface BootOptions {
  /** Register a "demo" agent and return its token (for a test deploy). */
  demoAgent?: boolean;
  /** SQLite location; defaults to in-memory. Use a mounted volume in cloud. */
  location?: string;
  /**
   * Enables the operator admin API (`/admin/agents…`) guarded by this bearer
   * token. Leave unset to keep the admin surface off entirely. The admin API
   * carries no secrets — agent tokens are provisioned only via env seeding.
   */
  adminToken?: string;
  /** Env source for agent seeding (HEDOFFICE_AGENT_TOKEN_*); default process.env. */
  env?: Record<string, string | undefined>;
}

export interface Booted {
  server: HedOfficeServer;
  office: Office;
  demoToken?: string;
  /** Agents provisioned from env vars this boot (names/stages — never tokens). */
  seededAgents: SeededAgent[];
}

/**
 * Build a headless HedOffice MCP server suitable for a cloud deploy. DNS-rebinding
 * protection (a localhost defense) is disabled because the public Host header
 * sits behind a proxy; protection in cloud relies on per-agent bearer tokens.
 * The caller binds it with `server.listen(port, "0.0.0.0")`.
 */
export function bootHedOffice(opts: BootOptions = {}): Booted {
  const office = new Office({ location: opts.location });
  const server = new HedOfficeServer({ office, enableDnsRebindingProtection: false });
  if (opts.adminToken) attachAdminApi(server.app, office, opts.adminToken);
  // Secrets come from the environment (Railway Variables): provision/rotate
  // agents from HEDOFFICE_AGENT_TOKEN_* before anything else runs.
  const seededAgents = seedAgentsFromEnv(office, opts.env ?? process.env);
  // Only seed the demo agent into an EMPTY registry — never alongside real
  // env-provisioned agents, and never re-minted on a persistent-DB restart.
  const demoToken =
    opts.demoAgent && office.agents.list().length === 0
      ? office.registerAgent("demo").token
      : undefined;
  return { server, office, demoToken, seededAgents };
}
