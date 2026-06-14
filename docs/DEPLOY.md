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

On boot it registers a `demo` agent and logs its bearer token so you can connect
an agent immediately.

## Railway

The repo ships a `railway.json`:

```json
{
  "build":  { "builder": "RAILPACK", "buildCommand": "pnpm --filter @hedoffice/server... build" },
  "deploy": { "startCommand": "pnpm --filter @hedoffice/server start" }
}
```

This fixes the "no start command" build failure: Railpack installs the pnpm
workspace (building the `better-sqlite3` native addon via `onlyBuiltDependencies`),
the `buildCommand` compiles just the server + its workspace deps, and the
`startCommand` runs `node dist/index.js`. Railway injects `PORT`. Then **expose
the service** (a public domain) in the Railway UI.

Env vars:
- `PORT` — provided by Railway.
- `HOST` — defaults to `0.0.0.0`.
- `HEDOFFICE_DB` — optional SQLite path on a mounted volume (defaults to
  in-memory; in-memory means state is lost on redeploy/restart).

Connect an agent (openclaw/Hermes-style):

```
mcp.servers.hedoffice = {
  url: "https://<your-app>.up.railway.app/mcp",
  transport: "streamable-http",
  headers: { Authorization: "Bearer <demo token from the deploy logs>" }
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
