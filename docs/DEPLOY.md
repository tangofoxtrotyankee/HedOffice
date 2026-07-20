# HedOffice — Cloud deploy (optional)

> **HedOffice is local-first.** Cloud deploy is a *later option* (per the master
> plan), and it ships **only the headless MCP server** — the Electron desktop UI
> is not server-deployable. Use this for a remote backend that BYO agents connect
> to; for real use, prefer the local app.

## What gets deployed

`@hedoffice/server` (`apps/server/`) — a thin entrypoint that boots the
orchestration core + the stateful Streamable HTTP MCP server, bound to
`0.0.0.0:$PORT`, with:
- `GET /healthz` → `{ ok, sessions }` (health check)
- `GET /` → `{ name, status, mcp }` (landing)
- `POST /mcp` → the MCP endpoint (per-agent bearer auth)

On first boot into an **empty registry** it registers a `demo` agent and logs
its bearer token so you can connect an agent immediately (a restart on a
persistent DB never re-seeds it; set `HEDOFFICE_DEMO_AGENT=0` to disable
entirely). For real agents, register named identities instead — see
[INTEGRATION.md](INTEGRATION.md) (CLI locally, or the `/admin/agents…` API
below on a deployed instance).

## Railway

The repo ships a `railway.json`:

```json
{
  "build":  { "builder": "RAILPACK", "buildCommand": "pnpm --filter @hedoffice/server... build" },
  "deploy": {
    "startCommand": "pnpm --filter @hedoffice/server start",
    "healthcheckPath": "/healthz",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

This fixes the "no start command" build failure: Railpack installs the pnpm
workspace (building the `better-sqlite3` native addon via `onlyBuiltDependencies`),
the `buildCommand` compiles just the server + its workspace deps, and the
`startCommand` runs `node dist/index.js`. Railway injects `PORT`, gates each
deploy on `/healthz`, and restarts on failure. Then **expose the service** (a
public domain) in the Railway UI.

### Secrets model — Railway Variables only

**All secrets are provisioned through Railway Variables (environment
variables). There is no public route that creates, rotates, or returns a
secret** — the admin API is deliberately secret-free (list / stage / charter /
revoke only). Agents and their bearer tokens are declared as variables and
seeded at boot:

```
HEDOFFICE_AGENT_TOKEN_<KEY>   (required) the agent's bearer secret, ≥32 chars
HEDOFFICE_AGENT_NAME_<KEY>    (optional) display name, defaults to <KEY>
HEDOFFICE_AGENT_STAGE_<KEY>   (optional) observe|supervised|autonomous
                              (new agents default to observe)
```

Seeding is idempotent (keyed by name): **to rotate a token, change the
variable and redeploy** — the old secret dies instantly, the agent's identity,
cubicle and history are preserved. A token under 32 chars fails the boot
loudly, and the health check keeps traffic off a misconfigured deploy.

### Step-by-step deploy runbook

1. **Create the project/service.** Railway dashboard → *New Project* →
   *Deploy from GitHub repo* → select this repo. Railway reads `railway.json`
   (Railpack build, workspace build/start commands, `/healthz` gating,
   restart-on-failure). No Dockerfile needed.
2. **Attach a volume** (service → *Settings* → *Volumes* → *Add volume*),
   mount path e.g. `/data`. SQLite in WAL mode is fine on a Railway volume.
   Without one, every restart/redeploy wipes all agents, notebooks and history.
3. **Set the Variables** (service → *Variables*):
   ```
   HEDOFFICE_DB              = /data/office.sqlite
   HEDOFFICE_DEMO_AGENT      = 0
   HEDOFFICE_AGENT_TOKEN_LEE = <openssl rand -hex 32>
   HEDOFFICE_AGENT_NAME_LEE  = Lee.
   HEDOFFICE_AGENT_STAGE_LEE = observe
   HEDOFFICE_ADMIN_TOKEN     = <openssl rand -hex 32>   # optional: enables the
                                                        # secret-free admin API
   ```
   Generate each secret locally (`openssl rand -hex 32`) and paste it in.
   Railway Variables are the single home for secrets — never commit them, and
   nothing in HedOffice will ever echo them back over HTTP.
4. **Keep it at 1 replica** (Railway's default). MCP sessions live in the
   server process and the store is a single SQLite file — multiple replicas
   would split sessions across processes and break request routing. Scale
   vertically if needed; multi-replica needs the v2 shared-session story.
5. **Deploy** (Railway auto-deploys on push; or *Deploy* in the UI), then
   **expose the service**: service → *Settings* → *Networking* → *Generate
   Domain*. Verify:
   ```sh
   curl https://<app>.up.railway.app/healthz     # → { "ok": true, ... }
   ```
   The deploy logs list the seeded agents by name/stage (never their tokens).
6. **Run the link check from your machine** before connecting the real agent
   (the token is the value you set in the Variable):
   ```sh
   pnpm --filter @hedoffice/harness hermes-link \
     https://<app>.up.railway.app/mcp $HEDOFFICE_AGENT_TOKEN_LEE
   ```
   Expect `10/10 checks passed` (mutating tools report *denied — correct*
   while the agent is at `observe` stage).
7. **Connect the agent** (see below and [INTEGRATION.md](INTEGRATION.md)),
   set its charter over the admin API, and promote its stage as trust grows:
   ```sh
   curl -X PUT -H "Authorization: Bearer $HEDOFFICE_ADMIN_TOKEN" -H "Content-Type: application/json" \
     -d '{"content":"# Lee.\n…"}' https://<app>.up.railway.app/admin/agents/<agentId>/charter
   curl -X POST -H "Authorization: Bearer $HEDOFFICE_ADMIN_TOKEN" -H "Content-Type: application/json" \
     -d '{"stage":"supervised"}' https://<app>.up.railway.app/admin/agents/<agentId>/stage
   ```
   (Find the `agentId` via `GET /admin/agents`.) Stage changes can also be
   made durable in the `HEDOFFICE_AGENT_STAGE_*` variable — when set, it is
   re-applied on every deploy.
8. **Kill switch:** `POST /admin/agents/<agentId>/revoke` disables the token
   immediately. To keep it dead across redeploys, also delete the
   `HEDOFFICE_AGENT_TOKEN_*` variable (env seeding re-arms the token on boot
   while the variable exists — the variables are the source of truth).

Env var reference:
- `PORT` — provided by Railway.
- `HOST` — defaults to `0.0.0.0`.
- `HEDOFFICE_DB` — SQLite path on the mounted volume (defaults to in-memory —
  state lost on every restart; always set this in cloud).
- `HEDOFFICE_AGENT_TOKEN_<KEY>` / `…_NAME_<KEY>` / `…_STAGE_<KEY>` — agent
  provisioning (see above). The only way agent secrets enter the system.
- `HEDOFFICE_ADMIN_TOKEN` — enables the **secret-free** operator admin API
  (`/admin/agents…`: list / stage / charter / revoke), guarded by this bearer
  token. Unset = no admin surface. It is not an agent token.
- `HEDOFFICE_DEMO_AGENT` — set `0` to never seed the demo agent (recommended
  in cloud; it is also skipped automatically whenever any env-seeded or
  existing agent is present).

Connect an agent (openclaw/Hermes-style) using the token you set in the
`HEDOFFICE_AGENT_TOKEN_*` variable:

```
mcp.servers.hedoffice = {
  url: "https://<your-app>.up.railway.app/mcp",
  transport: "streamable-http",
  headers: { Authorization: "Bearer <value of HEDOFFICE_AGENT_TOKEN_LEE>" }
}
```

## Security caveats (read before exposing publicly)

- A public office exposes its tools to **untrusted agents**. Protection in cloud
  rests on the **per-agent bearer token** — keep it secret; rotate by
  re-registering. DNS-rebinding protection (a localhost defense) is disabled in
  the cloud entrypoint because the public Host header sits behind a proxy.
- There is **no multi-user auth** (v1 is single-user). Anyone with the URL + a
  valid token can drive the office.
- Default in-memory store loses all state on restart. Use `HEDOFFICE_DB` on a
  volume for persistence (WAL mode).
- Mutating tools still route through the approval gate, but there is no human
  approver wired in the headless server — they fall through to allow **with an
  `audit.security_event`**. Do not expose a cloud instance you can't trust the
  connecting agents on.
