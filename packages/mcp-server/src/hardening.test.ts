import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Office } from "@hedoffice/core";
import type { StoredEvent } from "@hedoffice/schema";
import { HedOfficeServer } from "./index.js";

/**
 * Phase 5 session-hardening + kill-switch proofs (docs/SECURITY.md R5.2, R5.6).
 * The origin-replay and token-recheck cases talk raw HTTP so they can forge the
 * Origin / Authorization headers a well-behaved SDK client would never change.
 */

let server: HedOfficeServer;
let port: number;

function url(): string {
  return `http://127.0.0.1:${port}/mcp`;
}

// A minimal MCP `initialize` over raw fetch. Returns the assigned session id
// (read from the response header) so later requests can (ab)use it.
async function rawInitialize(token: string, origin?: string): Promise<string> {
  const res = await fetch(url(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "raw", version: "0.0.0" },
      },
    }),
  });
  const sid = res.headers.get("mcp-session-id");
  if (!sid) throw new Error(`no session id (status ${res.status})`);
  return sid;
}

// A follow-up request on an existing session (a tools/list ping).
async function rawPing(
  sid: string,
  opts: { token: string; origin?: string },
): Promise<number> {
  const res = await fetch(url(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${opts.token}`,
      "mcp-session-id": sid,
      ...(opts.origin ? { origin: opts.origin } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  return res.status;
}

function violations(office: Office, kind: string): StoredEvent[] {
  return office.store
    .read({ type: "security.violation" })
    .filter((e) => e.type === "security.violation" && e.payload.kind === kind);
}

async function sdkConnect(token: string): Promise<{
  client: Client;
  transport: StreamableHTTPClientTransport;
}> {
  const transport = new StreamableHTTPClientTransport(new URL(url()), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "mock-agent", version: "0.0.0" });
  await client.connect(transport);
  return { client, transport };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(result: any): any {
  const block = result?.content?.[0];
  return block?.type === "text" ? JSON.parse(block.text) : undefined;
}

async function waitFor(pred: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

afterEach(async () => {
  await server?.close();
});

describe("session hardening (R5.2)", () => {
  let office: Office;
  beforeEach(async () => {
    office = new Office();
    server = new HedOfficeServer({ office });
    port = await server.listen(0);
  });

  it("rejects a session id replayed from a different origin, logging a violation", async () => {
    const a = office.registerAgent("Ada", "autonomous");
    const sid = await rawInitialize(a.token, "http://good.test");

    // Same session id, same token — but a different Origin. This is the replay.
    const status = await rawPing(sid, { token: a.token, origin: "http://evil.test" });
    expect(status).toBe(403);

    const logged = violations(office, "session_replay_origin");
    expect(logged).toHaveLength(1);
    expect(logged[0]!.type === "security.violation" && logged[0]!.payload.origin).toBe(
      "http://evil.test",
    );
  });

  it("allows requests from the origin the session was bound to", async () => {
    const a = office.registerAgent("Ada", "autonomous");
    const sid = await rawInitialize(a.token, "http://good.test");
    expect(await rawPing(sid, { token: a.token, origin: "http://good.test" })).toBe(200);
  });

  it("re-checks the bearer on every request when requireToken is on", async () => {
    await server.close();
    office = new Office();
    server = new HedOfficeServer({ office, requireToken: true });
    port = await server.listen(0);

    const a = office.registerAgent("Ada", "autonomous");
    const sid = await rawInitialize(a.token);

    // Correct token still works…
    expect(await rawPing(sid, { token: a.token })).toBe(200);
    // …but the same session id with a bogus token is refused + logged.
    expect(await rawPing(sid, { token: "not-the-real-token" })).toBe(401);
    expect(violations(office, "token_recheck_failed")).toHaveLength(1);
  });

  it("expires an idle session and flips it offline", async () => {
    await server.close();
    office = new Office();
    server = new HedOfficeServer({ office, idleTimeoutMs: 120 });
    port = await server.listen(0);

    const a = office.registerAgent("Ada", "autonomous");
    const { transport } = await sdkConnect(a.token);
    expect(server.sessionCount).toBe(1);

    await waitFor(() => server.sessionCount === 0, 2000);
    expect(server.sessionCount).toBe(0);
    await waitFor(() => office.presence.snapshot(a.agentId).status === "offline");
    const expiries = office.store
      .read({ type: "audit.security_event" })
      .filter((e) => e.type === "audit.security_event" && e.payload.kind === "session_idle_expired");
    expect(expiries.length).toBeGreaterThanOrEqual(1);
    await transport.terminateSession().catch(() => {});
  });
});

describe("kill switch & suspension (R5.6)", () => {
  let office: Office;
  beforeEach(async () => {
    office = new Office();
    server = new HedOfficeServer({ office });
    port = await server.listen(0);
  });

  it("suspends a cubicle: its tool calls are refused, then work again on resume", async () => {
    const a = office.registerAgent("Ada", "autonomous");
    const { client } = await sdkConnect(a.token);

    expect(parse(await client.callTool({ name: "task.create", arguments: { title: "before" } })).title).toBe(
      "before",
    );

    office.control.suspend(a.agentId, "test freeze");
    const blocked = await client.callTool({ name: "task.create", arguments: { title: "during" } });
    expect((blocked as { isError?: boolean }).isError).toBe(true);
    expect(parse(blocked).error).toBe("cubicle_suspended");

    office.control.resume(a.agentId, "test thaw");
    expect(parse(await client.callTool({ name: "task.create", arguments: { title: "after" } })).title).toBe(
      "after",
    );

    // Only "before" and "after" landed.
    expect(office.cubicles.taskList(a.agentId).map((t) => t.title)).toEqual(["before", "after"]);
    expect(office.store.read({ type: "cubicle.suspend", agentId: a.agentId })).toHaveLength(1);
    expect(office.store.read({ type: "cubicle.resume", agentId: a.agentId })).toHaveLength(1);
  });

  it("global kill switch drops live sessions and refuses new connections", async () => {
    const a = office.registerAgent("Ada", "autonomous");
    await sdkConnect(a.token);
    expect(server.sessionCount).toBe(1);

    const closed = office.control.killAll("emergency");
    expect(closed).toBe(1);
    await waitFor(() => server.sessionCount === 0);

    // New connections are refused while killed.
    await expect(sdkConnect(a.token)).rejects.toThrow();

    const killEvents = office.store.read({ type: "system.killswitch" });
    expect(killEvents.some((e) => e.type === "system.killswitch" && e.payload.active)).toBe(true);

    // Lift it, and a fresh connection works again.
    office.control.liftKill("all clear");
    const { transport } = await sdkConnect(a.token);
    expect(server.sessionCount).toBe(1);
    await transport.terminateSession();
  });

  it("revocation stops an already-open session (F5)", async () => {
    const a = office.registerAgent("Ada", "autonomous");
    const { client } = await sdkConnect(a.token);
    expect(parse(await client.callTool({ name: "task.create", arguments: { title: "ok" } })).title).toBe("ok");

    office.agents.revoke(a.agentId);
    const after = await client.callTool({ name: "task.create", arguments: { title: "nope" } });
    expect((after as { isError?: boolean }).isError).toBe(true);
    expect(parse(after).error).toBe("agent_revoked");
  });
});
