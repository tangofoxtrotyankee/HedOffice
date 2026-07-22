import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Office } from "@hedoffice/core";
import { HedOfficeServer } from "./index.js";

/**
 * Phase 6 exit-gate proofs (docs/ROADMAP_PHASES_5-10.md): the governance library
 * is exposed as read-only MCP resources; `library://constitution` is byte-
 * identical across cubicles while `library://charters/self` resolves to each
 * cubicle's own charter; and the propose→approve flow runs end-to-end over MCP.
 */

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

async function readResource(client: Client, uri: string): Promise<string> {
  const res = await client.readResource({ uri });
  const first = res.contents[0];
  return typeof first?.text === "string" ? first.text : "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(result: any): any {
  const block = result?.content?.[0];
  return block?.type === "text" ? JSON.parse(block.text) : undefined;
}

describe("Phase 6 — Company Library as MCP resources", () => {
  it("serves an identical constitution but a per-cubicle charters/self", async () => {
    office.library.write("constitution.md", "# Constitution\nEveryone answers to Sam.");
    const lee = office.registerAgent("Lee.");
    const mark = office.registerAgent("Mark.");
    office.cubicles.charterWrite(lee.agentId, "Lee. coordinates.");
    office.cubicles.charterWrite(mark.agentId, "Mark. writes content.");

    const [cl, cm] = await Promise.all([connect(lee.token), connect(mark.token)]);

    // The constitution is byte-identical across both sessions.
    const constLee = await readResource(cl, "library://constitution");
    const constMark = await readResource(cm, "library://constitution");
    expect(constLee).toBe(constMark);
    expect(constLee).toContain("answers to Sam");

    // charters/self resolves to each cubicle's own charter.
    expect(await readResource(cl, "library://charters/self")).toBe("Lee. coordinates.");
    expect(await readResource(cm, "library://charters/self")).toBe("Mark. writes content.");
  });

  it("advertises a manifest whose hash tracks edits", async () => {
    office.library.write("goals.md", "Q3: ship the pilot.");
    const lee = office.registerAgent("Lee.");
    const client = await connect(lee.token);

    const before = JSON.parse(await readResource(client, "library://manifest"));
    const goalsBefore = before.entries.find((e: { path: string }) => e.path === "goals.md");
    expect(goalsBefore.sha256).toHaveLength(64);

    office.library.write("goals.md", "Q3: ship the pilot. Q4: scale.");
    const after = JSON.parse(await readResource(client, "library://manifest"));
    const goalsAfter = after.entries.find((e: { path: string }) => e.path === "goals.md");
    expect(goalsAfter.sha256).not.toBe(goalsBefore.sha256);
  });

  it("exposes no library write tool — propose is the only agent mutation", async () => {
    const lee = office.registerAgent("Lee.");
    const client = await connect(lee.token);
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).not.toContain("library.write");
    expect(tools).toContain("library.propose");
    expect(tools).toContain("library.my_proposals");
  });

  it("propose over MCP queues an edit that applies only on approval", async () => {
    const lee = office.registerAgent("Lee.");
    const client = await connect(lee.token);

    const proposed = parse(
      await client.callTool({
        name: "library.propose",
        arguments: {
          path: "processes/welcome.md",
          proposed_content: "# Welcome\nGreet within the hour.",
          rationale: "we have no welcome doc yet",
        },
      }),
    );
    expect(proposed.ok).toBe(true);
    // Not applied yet, and the agent can see it pending.
    expect(office.library.read("processes/welcome.md")).toBeUndefined();
    const mine = parse(await client.callTool({ name: "library.my_proposals", arguments: {} }));
    expect(mine.proposals[0].status).toBe("pending");

    // The MD rejects with a reason; the agent reads it back.
    office.library.rejectProposal(proposed.proposalId, "wrong tone — try warmer");
    const afterReject = parse(await client.callTool({ name: "library.my_proposals", arguments: {} }));
    expect(afterReject.proposals[0].status).toBe("rejected");
    expect(afterReject.proposals[0].reason).toBe("wrong tone — try warmer");
    expect(office.library.read("processes/welcome.md")).toBeUndefined();

    // A second proposal, this time approved by the MD, applies.
    const p2 = parse(
      await client.callTool({
        name: "library.propose",
        arguments: {
          path: "processes/welcome.md",
          proposed_content: "# Welcome\nWarmly greet within the hour.",
          rationale: "warmer tone",
        },
      }),
    );
    expect(office.library.approveProposal(p2.proposalId)).toBe(true);
    expect(await readResource(client, "library://processes/welcome.md")).toContain("Warmly greet");
  });
});
