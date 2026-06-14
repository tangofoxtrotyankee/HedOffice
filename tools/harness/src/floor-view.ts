/**
 * Live-data proof: a real BYO MCP client drives cubicle state (notebook, tasks,
 * voice), then the floor is rendered straight from the event log via
 * `buildFloorView` — the data path the UI consumes (no sample data).
 * Run: `pnpm --filter @hedoffice/harness floor-view`.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Office, buildCubicleDetail, buildFloorView } from "@hedoffice/core";
import { HedOfficeServer } from "@hedoffice/mcp-server";
import type { PresenceStatus } from "@hedoffice/schema";

const GLYPH: Record<PresenceStatus, string> = {
  running: "◉", thinking: "◐", idle: "○", blocked: "▓", offline: "·",
};

function log(tag: string, msg: string): void {
  console.log(`  [${tag.padEnd(9)}] ${msg}`);
}
function assert(c: boolean, m: string): void {
  if (!c) throw new Error(`ASSERTION FAILED: ${m}`);
}

async function connect(port: number, token: string): Promise<Client> {
  const t = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const c = new Client({ name: "mock-agent", version: "0.0.0" });
  await c.connect(t);
  return c;
}

async function main(): Promise<void> {
  console.log("\n=== HedOffice live floor: rendered from the event log ===\n");
  const office = new Office({ approval: { defaultPolicy: "auto" } });
  const server = new HedOfficeServer({ office });
  const port = await server.listen(0);

  const research = office.registerAgent("research");
  const ops = office.registerAgent("ops");
  const ra = await connect(port, research.token);
  await connect(port, ops.token); // ops connects but stays idle

  // The research agent works: notes, tasks, and a spoken exchange.
  await ra.callTool({ name: "notebook.write", arguments: { content: "• repo uses JWT" } });
  await ra.callTool({ name: "task.create", arguments: { title: "map auth endpoints" } });
  const created = await ra.callTool({ name: "task.create", arguments: { title: "summarize findings" } });
  const taskId = JSON.parse((created as { content: { text: string }[] }).content[0]!.text).id;
  await ra.callTool({ name: "task.update", arguments: { taskId, status: "done" } });
  office.channel.userSpoke(research.agentId, "focus on refresh tokens");
  await ra.callTool({ name: "channel.say", arguments: { text: "Okay, on it." } });

  // Render the floor straight from the store.
  console.log("");
  for (const c of buildFloorView(office.store)) {
    log("floor", `${GLYPH[c.status]} ${c.name.padEnd(9)} ${c.status.padEnd(8)} tasks ${c.tasksDone}/${c.tasksTotal}  » ${c.activity}`);
  }

  const floor = buildFloorView(office.store);
  const r = floor.find((c) => c.name === "research")!;
  assert(r.tasksTotal === 2 && r.tasksDone === 1, "research task counts reflect live state");
  assert(floor.find((c) => c.name === "ops")!.status === "idle", "ops idle");

  console.log("");
  const detail = buildCubicleDetail(office.store, research.agentId);
  log("notebook", JSON.stringify(detail.notebook));
  log("recent", detail.recent.map((x) => x.detail).join("  |  "));
  assert(detail.tasks.length === 2, "detail lists both tasks");

  await server.close();
  console.log("\n✅ The floor and cubicle detail were built entirely from the append-only event log — the UI's live data path.\n");
}

main().catch((e) => {
  console.error("\n❌ floor-view harness failed:", e);
  process.exit(1);
});
