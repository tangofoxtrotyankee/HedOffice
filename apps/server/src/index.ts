import { bootHedOffice } from "./boot.js";
import { assertNoPlaintextSecrets, PlaintextSecretError } from "./preflight.js";

/**
 * Cloud/Railway entrypoint. Reads `PORT` (Railway injects it) and `HOST`, boots
 * the headless MCP server bound to `0.0.0.0`, and (opt-in, into an empty
 * registry only) registers a demo agent so a remote BYO agent can connect.
 *
 * Env:
 * - `HEDOFFICE_DB`             — SQLite path (mounted volume) for persistence.
 * - `HEDOFFICE_AGENT_TOKEN_<KEY>` (+ optional `…_NAME_<KEY>`, `…_STAGE_<KEY>`)
 *   — provision agents and their bearer secrets from Railway Variables
 *   (env-agents.ts). The ONLY way secrets enter a deployment.
 * - `HEDOFFICE_ADMIN_TOKEN`    — enables the secret-free admin API
 *   (`/admin/agents…`, `/admin/killswitch`) guarded by this bearer token.
 * - `HEDOFFICE_DEMO_AGENT`     — set to `1` to seed a demo agent (opt-in, F8);
 *   anything else (default) never seeds one.
 * - `HEDOFFICE_ALLOWED_ORIGINS` — comma-separated Origin allowlist; when set,
 *   DNS-rebinding protection is re-enabled for browser requests (F14).
 * - `HEDOFFICE_REQUIRE_TOKEN`  — set to `1` to re-check the bearer on every
 *   request, not just at initialize (F13).
 * - `HEDOFFICE_SESSION_IDLE_MS`— idle-session expiry (default 1800000 = 30 min).
 * - `HEDOFFICE_APPROVAL_TIMEOUT_MS` — unanswered web-UI approval prompts
 *   auto-deny after this long (default 300000 = 5 min).
 *
 * NOTE: cloud deploy is a *later* option (the master plan ships local-first). A
 * publicly exposed office means untrusted agents can reach its tools — keep the
 * per-agent token secret, and prefer the local app for real use.
 */
try {
  // Refuse to boot if a plaintext secrets file is sitting in the working dir.
  assertNoPlaintextSecrets();
} catch (err) {
  if (err instanceof PlaintextSecretError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? "0.0.0.0";

const allowedOrigins = (process.env.HEDOFFICE_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter((o) => o !== "");

const { server, office, demoToken, seededAgents, uiRoot } = bootHedOffice({
  demoAgent: process.env.HEDOFFICE_DEMO_AGENT === "1",
  location: process.env.HEDOFFICE_DB,
  adminToken: process.env.HEDOFFICE_ADMIN_TOKEN,
  approvalTimeoutMs: Number(process.env.HEDOFFICE_APPROVAL_TIMEOUT_MS ?? 300_000),
  ...(allowedOrigins.length > 0 && { allowedOrigins }),
  requireToken: process.env.HEDOFFICE_REQUIRE_TOKEN === "1",
  idleTimeoutMs: Number(process.env.HEDOFFICE_SESSION_IDLE_MS ?? 30 * 60_000),
});

server
  .listen(port, host)
  .then((bound) => {
    console.log(`HedOffice MCP server listening on http://${host}:${bound}`);
    console.log(`  health:   GET  /healthz`);
    console.log(`  mcp:      POST /mcp   (Streamable HTTP)`);
    if (process.env.HEDOFFICE_ADMIN_TOKEN) {
      console.log(`  admin:    /admin/agents (bearer: HEDOFFICE_ADMIN_TOKEN)`);
      console.log(`  ui api:   /ui/api (bearer or ?token=: HEDOFFICE_ADMIN_TOKEN)`);
    }
    if (uiRoot) {
      console.log(`  office ui: GET /  (serving ${uiRoot})`);
    } else {
      console.log(`  office ui: not found (build @hedoffice/desktop to serve it at /)`);
    }
    if (seededAgents.length > 0) {
      console.log(
        `  env-seeded agents: ${seededAgents
          .map((a) => `${a.name} (${a.stage}${a.created ? ", new" : ""})`)
          .join(", ")}`,
      );
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
