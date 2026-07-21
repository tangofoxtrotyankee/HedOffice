/**
 * Phase 5 adversarial harness (docs/SECURITY.md R5.2/R5.6). A deliberately
 * hostile client that (a) replays a session id from a new origin and (b) steals
 * another cubicle's session id — each must fail gracefully and land in the event
 * log. The automated versions live in packages/mcp-server/src/hardening.test.ts;
 * this is the runnable demonstration referenced by the exit-gate ("copy one's
 * session id into the other's client, confirm it's refused and shows in the
 * log"). The plaintext-secret boot check (R5.3) is unit-tested in
 * apps/server/src/preflight.test.ts.
 *
 * Run: `pnpm --filter @hedoffice/harness security`.
 */
import { Office } from "@hedoffice/core";
import { HedOfficeServer } from "@hedoffice/mcp-server";

function log(tag: string, msg: string): void {
  console.log(`  [${tag.padEnd(10)}] ${msg}`);
}
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function initialize(url: string, token: string, origin?: string): Promise<string> {
  const res = await fetch(url, {
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
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "0" } },
    }),
  });
  const sid = res.headers.get("mcp-session-id");
  if (!sid) throw new Error(`initialize failed (${res.status})`);
  return sid;
}

async function ping(url: string, sid: string, token: string, origin?: string): Promise<number> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      "mcp-session-id": sid,
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  return res.status;
}

async function main(): Promise<void> {
  console.log(`\n=== HedOffice Phase 5 adversarial harness ===\n`);

  // requireToken on: a stolen session id alone must not be enough.
  const office = new Office();
  const server = new HedOfficeServer({ office, requireToken: true });
  const port = await server.listen(0);
  const url = `http://127.0.0.1:${port}/mcp`;
  const ada = office.registerAgent("Ada", "autonomous");
  const bob = office.registerAgent("Bob", "autonomous");

  // (a) Session replay from a new origin.
  const sid = await initialize(url, ada.token, "http://good.test");
  assert((await ping(url, sid, ada.token, "http://good.test")) === 200, "own origin works");
  const replay = await ping(url, sid, ada.token, "http://evil.test");
  assert(replay === 403, "replay from a new origin is refused (403)");
  log("replay", `session reused from a new origin -> ${replay} (refused)`);

  // (b) Cross-cubicle: Bob steals Ada's session id but presents his own token.
  const cross = await ping(url, sid, bob.token, "http://good.test");
  assert(cross === 401, "another agent's token on Ada's session is refused (401)");
  log("cross", `Bob replaying Ada's session id -> ${cross} (refused)`);

  const replayViolations = office.store
    .read({ type: "security.violation" })
    .filter((e) => e.type === "security.violation");
  assert(replayViolations.length >= 2, "both refusals logged as security.violation");
  log("audit", `${replayViolations.length} security.violation events in the log`);

  await server.close();

  console.log(`\n✅ Phase 5 adversarial harness passed: session replay and cross-cubicle theft both refused and logged.\n`);
}

main().catch((err) => {
  console.error("\n❌ security harness failed:", err);
  process.exit(1);
});
