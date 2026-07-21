/**
 * Phase 1 deliverable: spin up N mock MCP clients against one HedOffice server
 * and demonstrate (a) isolated per-cubicle state, (b) tool calls routing back to
 * the correct client, (c) live inferred presence, and (d) session cleanup on
 * disconnect. Run: `pnpm --filter @hedoffice/harness multi-client [N]`.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Office, type PresenceSnapshot } from "@hedoffice/core";
import { HedOfficeServer } from "@hedoffice/mcp-server";

const N = Math.max(1, Number(process.argv[2] ?? 3));
const NAMES = ["Ada", "Babbage", "Curie", "Dijkstra", "Euler", "Fermat"];

function log(tag: string, msg: string): void {
  console.log(`  [${tag.padEnd(9)}] ${msg}`);
}

function parse(result: unknown): any {
  const block = (result as any)?.content?.[0];
  return block?.type === "text" ? JSON.parse(block.text) : undefined;
}

async function connect(port: number, token: string) {
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const client = new Client({ name: "mock-agent", version: "0.0.0" });
  await client.connect(transport);
  return { client, transport };
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main(): Promise<void> {
  console.log(`\n=== HedOffice Phase 1 harness: ${N} concurrent agents, one MCP server ===\n`);

  // Presence transitions are logged live as they are inferred from MCP activity.
  const office = new Office({
    onPresenceChange: (snap: PresenceSnapshot, reason: string) =>
      log("presence", `${snap.agentId.slice(0, 8)} -> ${snap.status.padEnd(8)} (${reason})`),
  });
  const server = new HedOfficeServer({ office });
  const port = await server.listen(0);
  log("server", `listening on http://127.0.0.1:${port}/mcp`);

  // Register N agents and connect them concurrently. Autonomous stage: this
  // harness proves isolation/routing/presence, not the approval gate, so the
  // agents' mutating tools run without a human approver (the gate is fail-closed
  // for `supervised` agents with no approver — docs/SECURITY.md F1).
  const agents = Array.from({ length: N }, (_, i) =>
    office.registerAgent(NAMES[i % NAMES.length] ?? `Agent${i}`, "autonomous"),
  );
  const conns = await Promise.all(agents.map((a) => connect(port, a.token)));
  log("connect", `${server.sessionCount} sessions established`);
  assert(server.sessionCount === N, `expected ${N} sessions`);

  // Each agent writes a distinct notebook + creates a task, concurrently.
  await Promise.all(
    conns.map(({ client }, i) =>
      Promise.all([
        client.callTool({ name: "notebook.write", arguments: { content: `notebook of agent #${i}` } }),
        client.callTool({ name: "task.create", arguments: { title: `task for agent #${i}` } }),
      ]),
    ),
  );

  // Read back: assert every client sees ONLY its own data (state isolation).
  console.log("");
  for (let i = 0; i < N; i++) {
    const conn = conns[i]!;
    const note = parse(await conn.client.callTool({ name: "notebook.read", arguments: {} }));
    const tasks = parse(await conn.client.callTool({ name: "task.list", arguments: {} }));
    const status = parse(await conn.client.callTool({ name: "cubicle.status", arguments: {} }));
    log("isolation", `agent #${i}: notebook="${note.content}" tasks=${tasks.tasks.length} presence=${status.presence.status}`);
    assert(note.content === `notebook of agent #${i}`, `agent #${i} notebook routed correctly`);
    assert(tasks.tasks.length === 1, `agent #${i} sees exactly its own task`);
  }

  // Cross-check: no client can see another's notebook.
  for (let i = 0; i < N; i++) {
    const note = parse(await conns[i]!.client.callTool({ name: "notebook.read", arguments: {} }));
    for (let j = 0; j < N; j++) {
      if (i !== j) assert(note.content !== `notebook of agent #${j}`, `agent #${i} cannot see #${j}`);
    }
  }
  log("isolation", "verified: no cross-cubicle leakage");

  // Presence snapshot while idle.
  console.log("");
  for (const snap of office.presence.all()) {
    log("status", `${snap.agentId.slice(0, 8)} ${snap.status} (idle ${office.presence.idleMs(snap.agentId)}ms, inFlight ${snap.inFlight})`);
    assert(snap.status === "idle", "agents idle between calls");
  }

  // Disconnect: sessions must clean up and presence flip to offline.
  console.log("");
  await Promise.all(conns.map((c) => c.transport.terminateSession()));
  const deadline = Date.now() + 1000;
  while (server.sessionCount > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10));
  }
  log("cleanup", `${server.sessionCount} sessions remain after disconnect`);
  assert(server.sessionCount === 0, "all sessions cleaned up on disconnect");
  assert(office.presence.all().every((s) => s.status === "offline"), "all agents offline");

  // The event log captured everything.
  const totalEvents = office.store.count();
  log("eventlog", `${totalEvents} events appended (the full audit trail)`);

  await server.close();
  console.log(`\n✅ Phase 1 harness passed: ${N} agents isolated, routed, presence inferred, sessions cleaned up.\n`);
}

main().catch((err) => {
  console.error("\n❌ harness failed:", err);
  process.exit(1);
});
