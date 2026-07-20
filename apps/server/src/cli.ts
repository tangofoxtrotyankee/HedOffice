#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Office } from "@hedoffice/core";
import { PermissionStage } from "@hedoffice/schema";

/**
 * Operator CLI for the agent registry — the local counterpart of the guarded
 * `/admin/agents…` HTTP API. Works directly against the SQLite store, so it can
 * run while the server is up (WAL mode) or offline.
 *
 *   hedoffice-agents add "Lee." [--stage observe] [--charter path.md]
 *   hedoffice-agents list
 *   hedoffice-agents stage <agentId> <observe|supervised|autonomous>
 *   hedoffice-agents charter <agentId> <path.md | ->
 *   hedoffice-agents rotate <agentId>
 *   hedoffice-agents revoke <agentId>
 *
 * DB path: --db <path> or HEDOFFICE_DB (required — the registry must be the
 * same file the server runs on; an in-memory registry would be pointless here).
 */

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function takeFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined) fail(`${flag} requires a value`);
  args.splice(i, 2);
  return value;
}

const argv = process.argv.slice(2);
const dbPath = takeFlag(argv, "--db") ?? process.env.HEDOFFICE_DB;
const [command, ...rest] = argv;

if (!command || command === "help" || command === "--help") {
  console.log(`usage: hedoffice-agents <add|list|stage|charter|rotate|revoke> …
  add <name> [--stage observe|supervised|autonomous] [--charter <path.md>]
  list
  stage <agentId> <observe|supervised|autonomous>
  charter <agentId> <path.md | -stdin->
  rotate <agentId>
  revoke <agentId>
DB: --db <path> or HEDOFFICE_DB env (must be the server's SQLite file).`);
  process.exit(0);
}

if (!dbPath) fail("no database: pass --db <path> or set HEDOFFICE_DB");

const office = new Office({ location: dbPath });

function requireAgent(agentId: string | undefined): string {
  if (!agentId) fail("agentId required");
  if (!office.agents.has(agentId)) fail(`unknown agent: ${agentId}`);
  return agentId;
}

function parseStage(raw: string | undefined, fallback?: PermissionStage): PermissionStage {
  if (raw === undefined && fallback) return fallback;
  const parsed = PermissionStage.safeParse(raw);
  if (!parsed.success) fail(`invalid stage "${raw}" (allowed: ${PermissionStage.options.join(", ")})`);
  return parsed.data;
}

function readContent(source: string): string {
  return source === "-" ? readFileSync(0, "utf8") : readFileSync(source, "utf8");
}

try {
  switch (command) {
    case "add": {
      const stage = parseStage(takeFlag(rest, "--stage"), "observe");
      const charterPath = takeFlag(rest, "--charter");
      const name = rest[0];
      if (!name) fail("add requires a name");
      const { agentId, token } = office.agents.register(name, stage);
      if (charterPath) office.cubicles.charterWrite(agentId, readContent(charterPath));
      console.log(`registered "${name}"`);
      console.log(`  agentId: ${agentId}`);
      console.log(`  stage:   ${stage}`);
      console.log(`  token:   ${token}`);
      console.log(`(the token is shown once — only its hash is stored)`);
      break;
    }
    case "list": {
      const agents = office.agents.list();
      if (agents.length === 0) {
        console.log("no agents registered");
        break;
      }
      for (const a of agents) {
        const flags = a.active ? a.stage : `${a.stage}, REVOKED`;
        console.log(`${a.agentId}  ${a.name}  (${flags})  registered ${new Date(a.createdAt).toISOString()}`);
      }
      break;
    }
    case "stage": {
      const agentId = requireAgent(rest[0]);
      office.agents.setStage(agentId, parseStage(rest[1]));
      console.log(`stage of ${agentId} -> ${rest[1]}`);
      break;
    }
    case "charter": {
      const agentId = requireAgent(rest[0]);
      if (!rest[1]) fail("charter requires a file path (or - for stdin)");
      const content = readContent(rest[1]);
      office.cubicles.charterWrite(agentId, content);
      console.log(`charter written for ${agentId} (${Buffer.byteLength(content, "utf8")} bytes)`);
      break;
    }
    case "rotate": {
      const agentId = requireAgent(rest[0]);
      const token = office.agents.rotateToken(agentId);
      console.log(`new token for ${agentId}: ${token}`);
      break;
    }
    case "revoke": {
      const agentId = requireAgent(rest[0]);
      if (!office.agents.revoke(agentId)) fail(`agent already revoked: ${agentId}`);
      console.log(`revoked ${agentId} — it can no longer authenticate`);
      break;
    }
    default:
      fail(`unknown command "${command}" (try: hedoffice-agents help)`);
  }
} finally {
  office.close();
}
