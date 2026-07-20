import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Office } from "@hedoffice/core";
import { HedOfficeServer } from "./index.js";

let server: HedOfficeServer;
let port: number;
let office: Office;

beforeEach(async () => {
  office = new Office();
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

describe("cubicle.brief + staged permissions over MCP", () => {
  it("serves the charter, stage and gate policy to the connecting agent", async () => {
    const a = office.registerAgent("Lee.", "observe");
    office.cubicles.charterWrite(a.agentId, "# Lee.\nEscalate, don't improvise.");
    const client = await connect(a.token);

    const brief = parse(await client.callTool({ name: "cubicle.brief", arguments: {} }));
    expect(brief).toMatchObject({
      name: "Lee.",
      stage: "observe",
      gatedToolPolicy: "deny",
    });
    expect(brief.charter).toContain("Escalate");
    expect(brief.gatedTools).toContain("notebook.write");
  });

  it("denies mutating tools for an observe-stage agent but leaves reads open", async () => {
    const a = office.registerAgent("Lee.", "observe");
    const client = await connect(a.token);

    const write = parse(
      await client.callTool({ name: "notebook.write", arguments: { content: "sneaky" } }),
    );
    expect(write).toMatchObject({ ok: false, error: "approval_denied" });
    expect(office.cubicles.notebookRead(a.agentId)).toBe("");

    const read = parse(await client.callTool({ name: "notebook.read", arguments: {} }));
    expect(read).toMatchObject({ content: "" });

    const say = parse(
      await client.callTool({ name: "channel.say", arguments: { text: "May I write?" } }),
    );
    expect(say.ok).toBe(true); // speaking is never gated
  });

  it("long-polls channel.listen until an utterance arrives", async () => {
    const a = office.registerAgent("Lee.", "autonomous");
    const client = await connect(a.token);

    // Prime a cursor from an initial empty listen.
    const first = parse(await client.callTool({ name: "channel.listen", arguments: {} }));
    expect(first.utterances).toHaveLength(0);

    const started = Date.now();
    setTimeout(() => office.channel.userSpoke(a.agentId, "morning, Lee."), 400);
    const second = parse(
      await client.callTool({
        name: "channel.listen",
        arguments: { sinceEventId: first.cursor, waitMs: 5000 },
      }),
    );
    const elapsed = Date.now() - started;
    expect(second.utterances.map((u: { transcript: string }) => u.transcript)).toEqual([
      "morning, Lee.",
    ]);
    expect(elapsed).toBeGreaterThanOrEqual(350); // it actually waited
    expect(elapsed).toBeLessThan(5000); // and returned early on arrival
  });
});
