# @hedoffice/mcp-server

The stateful Streamable HTTP MCP server. Many BYO agents connect as MCP clients;
each `initialize` mints a session and a dedicated `McpServer` instance bound to
the caller's `agentId`, stored in a `sessions` map and torn down on
`transport.onclose` (ADR-002). This per-session factory is what guarantees state
isolation between cubicles. Status: **Phase 1 — implemented** (`channel.*` voice
tools land in Phase 3).

## What it does

- **Auth:** per-agent bearer token (`Authorization: Bearer <token>`) → `agentId`;
  invalid tokens get `401` and an `audit.security_event`.
- **DNS-rebinding protection:** `enableDnsRebindingProtection` with the bound
  `127.0.0.1:<port>` allow-listed; pass `allowedOrigins` to enforce `403` on a
  present-but-unlisted Origin (per the 2025-11-25 spec).
- **Tools:** `notebook.read/write/append`, `task.create/update/list`,
  `cubicle.status`, and the voice channel `channel.listen` / `channel.say`. Every
  call updates inferred presence and writes a `tool.called` / `tool.result` audit
  pair.
- **Approval gate:** record-mutating tools (`notebook.*`, `task.*`) route through
  the human approval gate before executing — denied calls return an `isError`
  result and never run. Configure via `new Office({ approval: { defaultPolicy,
  approver } })`.

```ts
import { HedOfficeServer } from "@hedoffice/mcp-server";
const server = new HedOfficeServer();
const port = await server.listen(4317);
const { token } = server.office.registerAgent("Ada"); // give this to the agent
```

A BYO agent then adds `http://127.0.0.1:<port>/mcp` as a `streamable-http` MCP
server with that bearer token.

## Develop

```sh
pnpm --filter @hedoffice/mcp-server build
pnpm --filter @hedoffice/mcp-server test   # 5 many-client integration tests
```

See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
