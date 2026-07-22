#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { Office, isValidLibraryPath } from "@hedoffice/core";
import { PermissionStage } from "@hedoffice/schema";

/**
 * Operator CLI for the agent registry and governance library — the local
 * counterpart of the guarded `/admin/…` HTTP API. Works directly against the
 * SQLite store, so it can run while the server is up (WAL mode) or offline.
 *
 *   hedoffice-agents add "Lee." [--stage observe] [--charter path.md]
 *   hedoffice-agents list
 *   hedoffice-agents stage <agentId> <observe|supervised|autonomous>
 *   hedoffice-agents charter <agentId> <path.md | ->
 *   hedoffice-agents rotate <agentId>
 *   hedoffice-agents revoke <agentId>
 *   hedoffice-agents library list
 *   hedoffice-agents library get <docPath>
 *   hedoffice-agents library set <docPath> <file.md | ->
 *   hedoffice-agents library rm  <docPath>
 *   hedoffice-agents library sync <vaultDir>     # push an Obsidian-style
 *                                                # vault of .md files
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
  console.log(`usage: hedoffice-agents <add|list|stage|charter|rotate|revoke|kill|restore|suspend|resume> …
  add <name> [--stage observe|supervised|autonomous] [--charter <path.md>]
  list
  stage <agentId> <observe|supervised|autonomous>
  charter <agentId> <path.md | -stdin->
  rotate <agentId>
  revoke <agentId>
  kill [reason]                 engage the global kill switch (refuse new + reject calls)
  restore [reason]              lift the global kill switch
  suspend <agentId> [reason]    freeze one cubicle's tool calls
  resume  <agentId> [reason]    unfreeze a cubicle
  library list | get <docPath> | set <docPath> <file|-> | rm <docPath> | sync <vaultDir>
          | proposals [pending|approved|rejected] | approve <id> | reject <id> [reason]
DB: --db <path> or HEDOFFICE_DB env (must be the server's SQLite file).
Note: kill/suspend from the CLI write to the shared log; a running server picks
them up on the next connection/tool call. Use the /admin endpoints to also drop
open sockets instantly.`);
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

/** Recursively collect .md files under a vault directory (dotdirs skipped,
 *  e.g. .obsidian/). */
function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walkMarkdown(abs));
    else if (entry.toLowerCase().endsWith(".md")) out.push(abs);
  }
  return out;
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
    case "kill": {
      const reason = rest.join(" ") || "cli kill";
      office.control.killAll(reason);
      console.log(`kill switch ENGAGED (${reason}) — new connections refused, tool calls rejected`);
      break;
    }
    case "restore": {
      const reason = rest.join(" ") || "cli restore";
      office.control.liftKill(reason);
      console.log(`kill switch lifted (${reason}) — connections allowed again`);
      break;
    }
    case "suspend": {
      const agentId = requireAgent(rest[0]);
      const reason = rest.slice(1).join(" ") || "cli suspend";
      office.control.suspend(agentId, reason);
      console.log(`suspended ${agentId} (${reason}) — its tool calls are now refused`);
      break;
    }
    case "resume": {
      const agentId = requireAgent(rest[0]);
      const reason = rest.slice(1).join(" ") || "cli resume";
      office.control.resume(agentId, reason);
      console.log(`resumed ${agentId} (${reason})`);
      break;
    }
    case "library": {
      const [sub, a, b] = rest;
      switch (sub) {
        case "list": {
          const docs = office.library.list();
          if (docs.length === 0) console.log("library is empty");
          for (const d of docs) {
            console.log(`${d.path}  (${d.byteLen} bytes, ${new Date(d.updatedAt).toISOString()})`);
          }
          break;
        }
        case "get": {
          if (!a) fail("library get requires a doc path");
          const content = office.library.read(a);
          if (content === undefined) fail(`no such doc: ${a}`);
          process.stdout.write(content);
          break;
        }
        case "set": {
          if (!a || !b) fail("library set requires <docPath> <file|->" );
          office.library.write(a, readContent(b));
          console.log(`wrote ${a}`);
          break;
        }
        case "rm": {
          if (!a) fail("library rm requires a doc path");
          if (!office.library.delete(a)) fail(`no such doc: ${a}`);
          console.log(`deleted ${a}`);
          break;
        }
        case "sync": {
          if (!a) fail("library sync requires a vault directory");
          const files = walkMarkdown(a);
          if (files.length === 0) fail(`no .md files found under ${a}`);
          for (const abs of files) {
            const docPath = relative(a, abs).split(sep).join("/");
            if (!isValidLibraryPath(docPath)) {
              console.warn(`skipping (invalid path): ${docPath}`);
              continue;
            }
            office.library.write(docPath, readFileSync(abs, "utf8"));
            console.log(`synced ${docPath}`);
          }
          break;
        }
        case "proposals": {
          const proposals = office.library.listProposals(
            a === "pending" || a === "approved" || a === "rejected" ? { status: a } : {},
          );
          if (proposals.length === 0) console.log("no proposals");
          for (const p of proposals) {
            console.log(
              `${p.proposalId}  ${p.status.padEnd(8)}  ${p.path}  by ${p.agentId.slice(0, 8)}` +
                `${p.reason ? `  (reason: ${p.reason})` : ""}`,
            );
          }
          break;
        }
        case "approve": {
          if (!a) fail("library approve requires a proposalId");
          if (!office.library.approveProposal(a)) fail(`unknown or already-resolved proposal: ${a}`);
          console.log(`approved ${a} — content applied to the library`);
          break;
        }
        case "reject": {
          if (!a) fail("library reject requires a proposalId");
          const reason = rest.slice(2).join(" ") || "rejected";
          if (!office.library.rejectProposal(a, reason)) fail(`unknown or already-resolved proposal: ${a}`);
          console.log(`rejected ${a} (${reason}) — nothing applied`);
          break;
        }
        default:
          fail(`unknown library command "${sub}" (list|get|set|rm|sync|proposals|approve|reject)`);
      }
      break;
    }
    default:
      fail(`unknown command "${command}" (try: hedoffice-agents help)`);
  }
} finally {
  office.close();
}
