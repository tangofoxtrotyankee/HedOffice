import { Office } from "@hedoffice/core";
import { HedOfficeServer } from "@hedoffice/mcp-server";

export interface BootOptions {
  /** Register a "demo" agent and return its token (for a test deploy). */
  demoAgent?: boolean;
  /** SQLite location; defaults to in-memory. Use a mounted volume in cloud. */
  location?: string;
}

export interface Booted {
  server: HedOfficeServer;
  office: Office;
  demoToken?: string;
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
  const demoToken = opts.demoAgent ? office.registerAgent("demo").token : undefined;
  return { server, office, demoToken };
}
