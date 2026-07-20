/**
 * External-agent link check: connects to a RUNNING HedOffice server exactly the
 * way a BYO Hermes/OpenClaw agent would — over Streamable HTTP with a bearer
 * token — and smoke-tests the whole tool surface. Run this against a local or
 * cloud deploy BEFORE pointing a real agent at it.
 *
 *   HEDOFFICE_URL=http://127.0.0.1:4317/mcp HEDOFFICE_TOKEN=<token> \
 *     pnpm --filter @hedoffice/harness hermes-link
 *
 * Or: pnpm --filter @hedoffice/harness hermes-link <url> <token>
 *
 * Exit code 0 = every check passed; non-zero = the printed check failed.
 * Note: on an `observe`-stage agent the mutating checks are EXPECTED to be
 * denied — the harness treats "denied by the approval gate" as a pass for
 * observe-stage agents (it proves the gate works), and reports it as such.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2] ?? process.env.HEDOFFICE_URL;
const token = process.argv[3] ?? process.env.HEDOFFICE_TOKEN;

if (!url || !token) {
  console.error(
    "usage: hermes-link <url> <token>  (or HEDOFFICE_URL / HEDOFFICE_TOKEN env)",
  );
  process.exit(2);
}

interface Check {
  name: string;
  detail: string;
  pass: boolean;
}
const checks: Check[] = [];
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name.padEnd(24)} ${detail}`);
}

function parse(result: unknown): any {
  const block = (result as any)?.content?.[0];
  return block?.type === "text" ? JSON.parse(block.text) : undefined;
}

async function main(): Promise<void> {
  console.log(`\n=== HedOffice link check (Hermes-style external client) ===`);
  console.log(`server: ${url}\n`);

  const transport = new StreamableHTTPClientTransport(new URL(url!), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "hermes-link-check", version: "0.0.0" });

  try {
    await client.connect(transport);
    record("connect", true, "initialize accepted, session established");
  } catch (err) {
    record("connect", false, `could not initialize: ${(err as Error).message}`);
    report();
    return;
  }

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  const expected = [
    "channel.listen",
    "channel.say",
    "cubicle.brief",
    "cubicle.status",
    "notebook.append",
    "notebook.read",
    "notebook.write",
    "task.create",
    "task.list",
    "task.update",
  ];
  const missing = expected.filter((t) => !names.includes(t));
  record(
    "tools/list",
    missing.length === 0,
    missing.length === 0 ? `${names.length} tools discovered` : `missing: ${missing.join(", ")}`,
  );

  const brief = parse(await client.callTool({ name: "cubicle.brief", arguments: {} }));
  const stage: string = brief?.stage ?? "unknown";
  record(
    "cubicle.brief",
    typeof brief?.stage === "string",
    `agent "${brief?.name}", stage ${stage}, charter ${brief?.charter ? `${brief.charter.length} chars` : "EMPTY (set one before go-live)"}`,
  );

  const observeStage = stage === "observe";
  const stamp = `link-check @ ${new Date().toISOString()}`;

  // Mutating call: on observe-stage agents a denial is the CORRECT outcome.
  const write = parse(
    await client.callTool({ name: "notebook.append", arguments: { text: `\n${stamp}` } }),
  );
  const writeDenied = write?.error === "approval_denied";
  record(
    "notebook.append",
    observeStage ? writeDenied : !writeDenied && write !== undefined,
    observeStage
      ? writeDenied
        ? "denied by approval gate (correct for observe stage)"
        : "UNEXPECTED: write allowed at observe stage"
      : writeDenied
        ? "denied — check the agent's stage/approver"
        : "append accepted",
  );

  const notebook = parse(await client.callTool({ name: "notebook.read", arguments: {} }));
  const sawStamp = typeof notebook?.content === "string" && notebook.content.includes(stamp);
  record(
    "notebook.read",
    observeStage ? typeof notebook?.content === "string" : sawStamp,
    observeStage ? "read ok (write was gated)" : sawStamp ? "read back what we wrote" : "did not read back the stamp",
  );

  const task = parse(
    await client.callTool({ name: "task.create", arguments: { title: stamp } }),
  );
  const taskDenied = task?.error === "approval_denied";
  record(
    "task.create",
    observeStage ? taskDenied : task?.id !== undefined,
    observeStage
      ? taskDenied
        ? "denied by approval gate (correct for observe stage)"
        : "UNEXPECTED: task created at observe stage"
      : task?.id
        ? `task ${task.id} created`
        : "no task id returned",
  );

  const list = parse(await client.callTool({ name: "task.list", arguments: {} }));
  record("task.list", Array.isArray(list?.tasks), `${list?.tasks?.length ?? "?"} task(s) visible`);

  const listen = parse(
    await client.callTool({ name: "channel.listen", arguments: {} }),
  );
  record(
    "channel.listen",
    Array.isArray(listen?.utterances),
    `${listen?.utterances?.length ?? "?"} utterance(s), cursor ${listen?.cursor}`,
  );

  const say = parse(
    await client.callTool({ name: "channel.say", arguments: { text: "Link check complete." } }),
  );
  record("channel.say", say?.ok === true, say?.ok ? `spoke (event ${say.eventId})` : "say failed");

  const status = parse(await client.callTool({ name: "cubicle.status", arguments: {} }));
  record(
    "cubicle.status",
    status?.presence?.status !== undefined,
    `presence ${status?.presence?.status}, ${status?.openTasks ?? "?"} open task(s)`,
  );

  await client.close();
  report();
}

function report(): void {
  const failed = checks.filter((c) => !c.pass);
  console.log(
    `\n${checks.length - failed.length}/${checks.length} checks passed` +
      (failed.length ? ` — FAILED: ${failed.map((c) => c.name).join(", ")}` : " — ready to link a real agent."),
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("link check crashed:", err);
  process.exit(1);
});
