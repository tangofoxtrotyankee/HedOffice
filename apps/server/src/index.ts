import { bootHedOffice } from "./boot.js";

/**
 * Cloud/Railway entrypoint. Reads `PORT` (Railway injects it) and `HOST`, boots
 * the headless MCP server bound to `0.0.0.0`, and registers a demo agent so a
 * remote BYO agent can connect immediately.
 *
 * NOTE: cloud deploy is a *later* option (the master plan ships local-first). A
 * publicly exposed office means untrusted agents can reach its tools — keep the
 * per-agent token secret, and prefer the local app for real use.
 */
const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? "0.0.0.0";

const { server, demoToken } = bootHedOffice({ demoAgent: true, location: process.env.HEDOFFICE_DB });

server
  .listen(port, host)
  .then((bound) => {
    console.log(`HedOffice MCP server listening on http://${host}:${bound}`);
    console.log(`  health:   GET  /healthz`);
    console.log(`  mcp:      POST /mcp   (Streamable HTTP)`);
    if (demoToken) console.log(`  demo agent bearer token: ${demoToken}`);
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
