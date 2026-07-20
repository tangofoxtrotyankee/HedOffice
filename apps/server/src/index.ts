import { bootHedOffice } from "./boot.js";

/**
 * Cloud/Railway entrypoint. Reads `PORT` (Railway injects it) and `HOST`, boots
 * the headless MCP server bound to `0.0.0.0`, and (into an empty registry only)
 * registers a demo agent so a remote BYO agent can connect immediately.
 *
 * Env:
 * - `HEDOFFICE_DB`          — SQLite path (mounted volume) for persistence.
 * - `HEDOFFICE_ADMIN_TOKEN` — enables `/admin/agents…` (register/revoke/stage/
 *   charter) guarded by this bearer token. Without it, use the local CLI
 *   (`pnpm --filter @hedoffice/server agents …`) against the same DB.
 * - `HEDOFFICE_DEMO_AGENT`  — set to `0` to never seed the demo agent.
 *
 * NOTE: cloud deploy is a *later* option (the master plan ships local-first). A
 * publicly exposed office means untrusted agents can reach its tools — keep the
 * per-agent token secret, and prefer the local app for real use.
 */
const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? "0.0.0.0";

const { server, office, demoToken } = bootHedOffice({
  demoAgent: process.env.HEDOFFICE_DEMO_AGENT !== "0",
  location: process.env.HEDOFFICE_DB,
  adminToken: process.env.HEDOFFICE_ADMIN_TOKEN,
});

server
  .listen(port, host)
  .then((bound) => {
    console.log(`HedOffice MCP server listening on http://${host}:${bound}`);
    console.log(`  health:   GET  /healthz`);
    console.log(`  mcp:      POST /mcp   (Streamable HTTP)`);
    if (process.env.HEDOFFICE_ADMIN_TOKEN) {
      console.log(`  admin:    /admin/agents (bearer: HEDOFFICE_ADMIN_TOKEN)`);
    }
    if (demoToken) console.log(`  demo agent bearer token: ${demoToken}`);
    const agents = office.agents.list();
    if (agents.length > 0) {
      console.log(`  registered agents: ${agents.map((a) => `${a.name} (${a.stage}${a.active ? "" : ", revoked"})`).join(", ")}`);
    }
  })
  .catch((err) => {
    console.error("HedOffice server failed to start:", err);
    process.exit(1);
  });

const shutdown = (): void => {
  void server.close().finally(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
