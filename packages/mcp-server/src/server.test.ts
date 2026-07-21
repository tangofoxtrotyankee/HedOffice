import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Office } from "@hedoffice/core";
import { HedOfficeServer } from "./index.js";

let server: HedOfficeServer;
let port: number;

beforeEach(async () => {
  server = new HedOfficeServer({ office: new Office() });
  port = await server.listen(0);
});
afterEach(async () => {
  await server.close();
});

async function connect(token: string): Promise<{
  client: Client;
  transport: StreamableHTTPClientTransport;
}> {
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const client = new Client({ name: "mock-agent", version: "0.0.0" });
  await client.connect(transport);
  return { client, transport };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(result: any): any {
  const block = result?.content?.[0];
  return block?.type === "text" ? JSON.parse(block.text) : undefined;
}

async function waitFor(pred: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("HedOfficeServer (many clients, one server)", () => {
  it("rejects a connection with an invalid bearer token", async () => {
    await expect(connect("not-a-real-token")).rejects.toThrow();
    expect(server.sessionCount).toBe(0);
  });

  it("accepts 3 concurrent agents, each in an isolated session", async () => {
    // autonomous: this proves state isolation/routing, not the approval gate —
    // so mutating tools should run without a human approver wired.
    const a = server.office.registerAgent("Ada", "autonomous");
    const b = server.office.registerAgent("Babbage", "autonomous");
    const c = server.office.registerAgent("Curie", "autonomous");

    const [a1, b1, c1] = await Promise.all([
      connect(a.token),
      connect(b.token),
      connect(c.token),
    ]);
    const ca = a1.client, cb = b1.client, cc = c1.client;
    expect(server.sessionCount).toBe(3);

    // Each agent writes distinct notebook content concurrently.
    await Promise.all([
      ca.callTool({ name: "notebook.write", arguments: { content: "AAA" } }),
      cb.callTool({ name: "notebook.write", arguments: { content: "BBB" } }),
      cc.callTool({ name: "notebook.write", arguments: { content: "CCC" } }),
    ]);

    // Each read routes back to the correct client and sees only its own data.
    expect(parse(await ca.callTool({ name: "notebook.read", arguments: {} })).content).toBe("AAA");
    expect(parse(await cb.callTool({ name: "notebook.read", arguments: {} })).content).toBe("BBB");
    expect(parse(await cc.callTool({ name: "notebook.read", arguments: {} })).content).toBe("CCC");

    await Promise.all([a1.transport.terminateSession(), b1.transport.terminateSession(), c1.transport.terminateSession()]);
  });

  it("isolates tasks across cubicles", async () => {
    const a = server.office.registerAgent("Ada", "autonomous");
    const b = server.office.registerAgent("Babbage", "autonomous");
    const { client: ca } = await connect(a.token);
    const { client: cb } = await connect(b.token);

    await ca.callTool({ name: "task.create", arguments: { title: "A's task" } });

    expect(parse(await ca.callTool({ name: "task.list", arguments: {} })).tasks).toHaveLength(1);
    expect(parse(await cb.callTool({ name: "task.list", arguments: {} })).tasks).toHaveLength(0);
  });

  it("infers presence: idle between calls, offline after the session terminates", async () => {
    const a = server.office.registerAgent("Ada");
    const { client: ca, transport } = await connect(a.token);

    await waitFor(() => server.office.presence.snapshot(a.agentId).status === "idle");
    expect(server.office.presence.snapshot(a.agentId).status).toBe("idle");

    await ca.callTool({ name: "notebook.read", arguments: {} });
    // synchronous handler settles back to idle by the time the call resolves
    expect(server.office.presence.snapshot(a.agentId).status).toBe("idle");

    await transport.terminateSession();
    await waitFor(() => server.office.presence.snapshot(a.agentId).status === "offline");
    expect(server.office.presence.snapshot(a.agentId).status).toBe("offline");
  });

  it("tears down the session on explicit termination (onclose)", async () => {
    const a = server.office.registerAgent("Ada");
    const { transport } = await connect(a.token);
    expect(server.sessionCount).toBe(1);
    await transport.terminateSession();
    await waitFor(() => server.sessionCount === 0);
    expect(server.sessionCount).toBe(0);
  });
});
