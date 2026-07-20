# HedOffice — Linking a BYO agent (Hermes / OpenClaw style)

How to connect an external agent to a running HedOffice server and take it
safely from first connection to trusted autonomy. This is the operational
companion to [ARCHITECTURE.md](ARCHITECTURE.md) (what the tools are) and
[SECURITY.md](SECURITY.md) (why the gates exist).

The rollout follows a **staged-permission ladder** — observe → supervised →
autonomous — so a newly linked agent starts read-only and earns write access
after its behavior has been tested. An agent should never think *"I received an
event, therefore I should do something"*; its charter (below) tells it what it
may do, and the approval gate enforces the rest.

## 0. Prerequisites

- A running HedOffice server:
  - local dev: `pnpm --filter @hedoffice/server build && HEDOFFICE_DB=./office.sqlite pnpm --filter @hedoffice/server start`
  - cloud: see [DEPLOY.md](DEPLOY.md) (Railway).
- A persistent `HEDOFFICE_DB` (an in-memory registry forgets every token on
  restart — fine for a throwaway demo, wrong for a real link).

## 1. Register the agent (mint its identity + token)

**Locally, via the CLI** (works while the server is running — WAL mode):

```sh
pnpm --filter @hedoffice/server build
HEDOFFICE_DB=./office.sqlite pnpm --filter @hedoffice/server agents \
  add "Lee." --stage observe --charter ./charters/lee.md
```

This prints the `agentId` and the bearer token **once** — only the token's
SHA-256 hash is stored. Other commands: `list`, `stage`, `charter`, `rotate`,
`revoke` (`agents help` for usage).

**On a cloud deploy (Railway), via environment variables** — secrets live in
Railway Variables only; **no HTTP route can create or return a token**. Declare
the agent as variables and (re)deploy:

```
HEDOFFICE_AGENT_TOKEN_LEE = <openssl rand -hex 32>   # the bearer secret
HEDOFFICE_AGENT_NAME_LEE  = Lee.
HEDOFFICE_AGENT_STAGE_LEE = observe
```

Seeding is idempotent by name; rotating = change the token variable and
redeploy (identity and history are preserved). See
[DEPLOY.md](DEPLOY.md) for the full runbook.

The optional admin API (`HEDOFFICE_ADMIN_TOKEN` enables `/admin/agents…`) is
**secret-free** — it covers the non-secret lifecycle only:

```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<host>/admin/agents   # list
curl -X POST … /admin/agents/<agentId>/stage    -d '{"stage":"supervised"}'
curl -X PUT  … /admin/agents/<agentId>/charter  -d '{"content":"# Lee.\n…"}'
curl -X POST … /admin/agents/<agentId>/revoke   # kill switch
```

The admin token is the **operator's** key. Never give it to an agent; agents
get only their own per-agent token.

## 2. Write the charter

The charter is the operator-authored role document the agent reads through the
`cubicle.brief` tool on connect — role, responsibilities, boundaries,
escalation rules. Start from
[templates/AGENT_CHARTER.md](templates/AGENT_CHARTER.md). Keep it short,
imperative, and honest about what the agent may *not* do.

## 3. Point the agent at HedOffice

An openclaw/Hermes-style client adds HedOffice as an MCP server (Streamable
HTTP + bearer header):

```
mcp.servers.hedoffice = {
  url: "http://127.0.0.1:4317/mcp",          // or https://<host>/mcp
  transport: "streamable-http",
  headers: { Authorization: "Bearer <per-agent token>" }
}
```

Then instruct the agent (in its own system prompt) to:

1. Call `cubicle.brief` first and follow its charter.
2. Poll `channel.listen` (pass the returned `cursor` back as `sinceEventId`,
   and `waitMs` up to 25000 to long-poll instead of hammering).
3. Reply with `channel.say`; keep durable context in `notebook.*`; track work
   in `task.*`.
4. When blocked or uncertain: say so on the channel and wait — escalate,
   don't improvise.

## 4. Verify the link before trusting it

Run the link check — it connects exactly like a real agent and exercises every
tool, treating approval-gate denials as *correct* for observe-stage agents:

```sh
HEDOFFICE_URL=http://127.0.0.1:4317/mcp HEDOFFICE_TOKEN=<token> \
  pnpm --filter @hedoffice/harness hermes-link
```

Expect `10/10 checks passed`. Anything else, fix before connecting the real
agent.

## 5. Promote in stages

| Stage        | Mutating tools (`notebook.write/append`, `task.create/update`) | Use when |
|--------------|------------------------------------------------|----------|
| `observe`    | **denied** — read + channel only               | first link; testing behavior |
| `supervised` | **prompt** — human approves each action        | normal operation |
| `autonomous` | **auto** — allowed, still fully audit-logged   | proven, narrow, boring workflows |

`channel.say` and all reads are never gated. Per-tool policy overrides
(`office.approvals.setPolicy`) beat the stage default, so you can e.g. keep an
autonomous agent's `task.update` on `prompt`.

Promote only after the agent has run cleanly at the current stage:
observe → watch it read/listen/speak sensibly; supervised → watch what it
*asks* to do; autonomous → only for actions you'd approve every time anyway.
Demote or `revoke` instantly at any sign of trouble — revocation kills the
token but keeps the cubicle's full history.

## 6. What HedOffice enforces vs. what the agent promises

Enforced by HedOffice regardless of agent behavior:
- bearer auth per agent; token hash at rest; rotation/revocation
- cubicle isolation (an agent can only ever touch its own state)
- the staged approval gate on mutating tools
- append-only audit of every call, result, approval and security event
- inferred presence (there is no `presence.set` to lie through)

Only *promised* by the charter (not enforceable): tone, escalation discipline,
what the agent does on its own side (e.g. what it posts to Telegram). Treat
everything an agent writes as untrusted input — provenance is tracked, content
is not sanitized.
