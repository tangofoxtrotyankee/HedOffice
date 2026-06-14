import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Office } from "@hedoffice/core";
import type { ApprovalDecision } from "@hedoffice/schema";
import { HedOfficeServer } from "./index.js";

let server: HedOfficeServer;
let port: number;
let office: Office;
let nextDecision: ApprovalDecision;

beforeEach(async () => {
  nextDecision = "allow";
  office = new Office({
    approval: { defaultPolicy: "prompt", approver: () => nextDecision },
  });
  server = new HedOfficeServer({ office });
  port = await server.listen(0);
});
afterEach(async () => {
  await server.close();
});

async function connect(token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const client = new Client({ name: "mock-agent", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(result: any): any {
  const block = result?.content?.[0];
  return block?.type === "text" ? JSON.parse(block.text) : undefined;
}

describe("Phase 3 integration spine (over a live MCP client)", () => {
  it("delivers user speech to the agent and records the agent's reply", async () => {
    const a = office.registerAgent("Ada");
    const client = await connect(a.token);

    // Human speaks into the cubicle (Phase 2 STT produces this).
    office.channel.userSpoke(a.agentId, "focus on refresh tokens");

    const listen = parse(await client.callTool({ name: "channel.listen", arguments: {} }));
    expect(listen.utterances.map((u: { transcript: string }) => u.transcript)).toEqual([
      "focus on refresh tokens",
    ]);

    const say = parse(
      await client.callTool({ name: "channel.say", arguments: { text: "Okay, on it." } }),
    );
    expect(say.ok).toBe(true);

    const said = office.store.read({ type: "channel.agent_said", agentId: a.agentId });
    expect(said).toHaveLength(1);
  });

  it("approval gate: allows a mutating tool when the human approves", async () => {
    const a = office.registerAgent("Ada");
    const client = await connect(a.token);
    nextDecision = "allow";

    const res = await client.callTool({ name: "task.create", arguments: { title: "Ship Phase 3" } });
    expect((res as { isError?: boolean }).isError).toBeFalsy();
    expect(parse(res).title).toBe("Ship Phase 3");
    expect(office.cubicles.taskList(a.agentId)).toHaveLength(1);
  });

  it("approval gate: denies a mutating tool when the human declines", async () => {
    const a = office.registerAgent("Ada");
    const client = await connect(a.token);
    nextDecision = "deny";

    const res = await client.callTool({ name: "task.create", arguments: { title: "rm -rf" } });
    expect((res as { isError?: boolean }).isError).toBe(true);
    expect(parse(res).error).toBe("approval_denied");
    // nothing was created, and the denial is in the audit trail
    expect(office.cubicles.taskList(a.agentId)).toHaveLength(0);
    const resolved = office.store.read({ type: "approval.resolved", agentId: a.agentId });
    expect(resolved.some((e) => e.type === "approval.resolved" && e.payload.decision === "deny")).toBe(true);
  });

  it("read tools (channel.listen) are not gated", async () => {
    const a = office.registerAgent("Ada");
    const client = await connect(a.token);
    nextDecision = "deny"; // would block mutating tools, but listen is a read
    const listen = parse(await client.callTool({ name: "channel.listen", arguments: {} }));
    expect(listen.utterances).toEqual([]);
  });
});
