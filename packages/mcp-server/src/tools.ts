import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Office } from "@hedoffice/core";
import { cubicleOf, isValidLibraryPath, libraryUri, MUTATING_TOOLS, STAGE_POLICY, sha256 } from "@hedoffice/core";
import {
  ChannelListenInput,
  ChannelSayInput,
  LibraryProposeInput,
  LibraryReadInput,
  NotebookAppendInput,
  NotebookWriteInput,
  TaskCreateInput,
  TaskUpdateInput,
} from "@hedoffice/schema";

/** Long-poll bounds for `channel.listen` (waitMs is clamped, poll is coarse). */
const LISTEN_MAX_WAIT_MS = 25_000;
const LISTEN_POLL_MS = 250;

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function denied(tool: string): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: false, error: "approval_denied", tool }) }],
    isError: true,
  };
}

/** A tool call refused before it ran (revoked agent, suspended cubicle, kill switch). */
function refused(error: string, tool: string): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: false, error, tool }) }],
    isError: true,
  };
}

/**
 * Wraps a tool handler so every call (a) routes mutating tools through the
 * human approval gate (docs/SECURITY.md), (b) is reflected in inferred presence
 * (running while in-flight, blocked while awaiting approval), and (c) leaves a
 * `tool.called` / `tool.result` audit trail in the event log.
 */
async function tracked(
  office: Office,
  agentId: string,
  tool: string,
  args: unknown,
  run: () => ToolResult | Promise<ToolResult>,
): Promise<ToolResult> {
  // Gate the whole call before it touches state or the log (fail closed).
  // These reflect operator/kill-switch state held in the shared event log, so
  // they hold even when the CLI in another process flipped them (F5, R5.6).
  if (office.control.isKilled()) return refused("office_killed", tool);
  if (!office.agents.isActive(agentId)) return refused("agent_revoked", tool);
  if (office.control.isSuspended(agentId)) return refused("cubicle_suspended", tool);

  const callId = randomUUID();
  const start = Date.now();
  office.presence.callStart(agentId);
  office.store.append({
    agentId,
    streamId: cubicleOf(agentId),
    actor: "agent",
    type: "tool.called",
    payload: { agentId, tool, argsHash: sha256(JSON.stringify(args ?? {})), callId },
  });
  const finish = (ok_: boolean): void => {
    office.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "system",
      type: "tool.result",
      payload: { agentId, callId, ok: ok_, durationMs: Date.now() - start },
    });
  };
  try {
    if (MUTATING_TOOLS.has(tool)) {
      const decision = await office.approvals.request(agentId, tool, tool);
      if (decision === "deny") {
        finish(false);
        return denied(tool);
      }
    }
    const result = await run();
    finish(true);
    return result;
  } catch (err) {
    finish(false);
    throw err;
  } finally {
    office.presence.callEnd(agentId);
  }
}

/**
 * Registers the v1 tool set on a per-session McpServer, bound to a single
 * `agentId`. Because the server instance closes over `agentId`, an agent's tool
 * calls can only ever touch its own cubicle (state isolation — ADR-002).
 */
export function registerCubicleTools(
  server: McpServer,
  agentId: string,
  office: Office,
): void {
  const { cubicles, channel, presence } = office;

  server.registerTool(
    "notebook.read",
    { description: "Read this cubicle's notebook content.", inputSchema: {} },
    () => tracked(office, agentId, "notebook.read", {}, () =>
      ok({ content: cubicles.notebookRead(agentId) }),
    ),
  );

  server.registerTool(
    "notebook.write",
    {
      description: "Overwrite this cubicle's notebook content.",
      inputSchema: NotebookWriteInput.shape,
    },
    (args) => tracked(office, agentId, "notebook.write", args, () => {
      cubicles.notebookWrite(agentId, args.content);
      return ok({ ok: true, byteLen: Buffer.byteLength(args.content, "utf8") });
    }),
  );

  server.registerTool(
    "notebook.append",
    {
      description: "Append text to this cubicle's notebook.",
      inputSchema: NotebookAppendInput.shape,
    },
    (args) => tracked(office, agentId, "notebook.append", args, () =>
      ok({ content: cubicles.notebookAppend(agentId, args.text) }),
    ),
  );

  server.registerTool(
    "task.create",
    { description: "Create a task in this cubicle.", inputSchema: TaskCreateInput.shape },
    (args) => tracked(office, agentId, "task.create", args, () =>
      ok(cubicles.taskCreate(agentId, args.title, args.detail)),
    ),
  );

  server.registerTool(
    "task.update",
    {
      description: "Update a task's status and/or detail.",
      inputSchema: TaskUpdateInput.shape,
    },
    (args) => tracked(office, agentId, "task.update", args, () =>
      ok(cubicles.taskUpdate(agentId, args.taskId, {
        status: args.status,
        detail: args.detail,
      })),
    ),
  );

  server.registerTool(
    "task.list",
    { description: "List this cubicle's tasks.", inputSchema: {} },
    () => tracked(office, agentId, "task.list", {}, () =>
      ok({ tasks: cubicles.taskList(agentId) }),
    ),
  );

  server.registerTool(
    "cubicle.status",
    {
      description: "Read this cubicle's inferred presence and task summary.",
      inputSchema: {},
    },
    () => tracked(office, agentId, "cubicle.status", {}, () => {
      const tasks = cubicles.taskList(agentId);
      return ok({
        presence: presence.snapshot(agentId),
        taskCount: tasks.length,
        openTasks: tasks.filter((t) => t.status !== "done").length,
      });
    }),
  );

  server.registerTool(
    "channel.listen",
    {
      description:
        "Read recent user utterances in this cubicle since a cursor (channel.user_spoke). " +
        "Pass waitMs to long-poll: the call holds until an utterance arrives or the wait elapses.",
      inputSchema: ChannelListenInput.shape,
    },
    (args) => tracked(office, agentId, "channel.listen", args, async () => {
      let result = channel.listen(agentId, args.sinceEventId);
      const wait = Math.min(args.waitMs ?? 0, LISTEN_MAX_WAIT_MS);
      const deadline = Date.now() + wait;
      // Long-poll: only when a cursor is given and nothing new is there yet.
      // (Without a cursor the first page of history is the answer.)
      while (
        result.utterances.length === 0 &&
        args.sinceEventId !== undefined &&
        Date.now() < deadline
      ) {
        await sleep(LISTEN_POLL_MS);
        result = channel.listen(agentId, args.sinceEventId);
      }
      return ok(result);
    }),
  );

  server.registerTool(
    "cubicle.brief",
    {
      description:
        "Read this cubicle's briefing: your charter (role, responsibilities, boundaries " +
        "set by the operator), your permission stage, and how gated tools behave. " +
        "Call this first when you connect.",
      inputSchema: {},
    },
    () => tracked(office, agentId, "cubicle.brief", {}, () => {
      const record = office.agents.get(agentId);
      const stage = record?.stage ?? "supervised";
      return ok({
        name: record?.name ?? null,
        charter: cubicles.charterRead(agentId),
        stage,
        gatedToolPolicy: STAGE_POLICY[stage],
        gatedTools: [...MUTATING_TOOLS],
        library: office.library.list().map((d) => d.path),
        notes:
          "Presence is inferred from your MCP activity; there is no presence.set. " +
          "Mutating tools follow your stage policy unless the operator set a per-tool override. " +
          "Read the governance library (library.list / library.read) — the constitution and " +
          "process docs there bind you alongside your charter. " +
          "When unsure or blocked, write the question to your notebook and say it on the channel — escalate, don't improvise.",
      });
    }),
  );

  server.registerTool(
    "channel.say",
    {
      description: "Speak a reply to the user in this cubicle (enqueues TTS).",
      inputSchema: ChannelSayInput.shape,
    },
    (args) => tracked(office, agentId, "channel.say", args, () => {
      const eventId = channel.agentSaid(agentId, args.text, { voiceId: args.voiceId ?? null });
      return ok({ ok: true, eventId });
    }),
  );

  server.registerTool(
    "library.list",
    {
      description:
        "List the shared governance library (constitution, ethics, process docs, " +
        "decision trees). Operator-authored; read-only for agents.",
      inputSchema: {},
    },
    () => tracked(office, agentId, "library.list", {}, () =>
      ok({ docs: office.library.list() }),
    ),
  );

  server.registerTool(
    "library.read",
    {
      description:
        'Read one governance-library doc by path (e.g. "constitution.md", ' +
        '"decision_trees/user_registered.md").',
      inputSchema: LibraryReadInput.shape,
    },
    (args) => tracked(office, agentId, "library.read", args, () => {
      const content = office.library.read(args.path);
      return content === undefined
        ? ok({ ok: false, error: "not_found", path: args.path })
        : ok({ path: args.path, content });
    }),
  );

  server.registerTool(
    "library.propose",
    {
      description:
        "Propose an edit to a governance-library doc (Phase 6). This is the ONLY " +
        "way an agent can change the library, and it changes nothing until the MD " +
        "approves it — it queues a proposal for review. Give the target path, the " +
        "full proposed content, and a short rationale.",
      inputSchema: LibraryProposeInput.shape,
    },
    (args) => tracked(office, agentId, "library.propose", args, () => {
      if (!isValidLibraryPath(args.path)) {
        return ok({ ok: false, error: "invalid_path", path: args.path });
      }
      const proposalId = office.library.propose(
        agentId,
        args.path,
        args.proposed_content,
        args.rationale,
      );
      return ok({ ok: true, proposalId, status: "pending" });
    }),
  );

  server.registerTool(
    "library.my_proposals",
    {
      description:
        "List your own library proposals and their status. Rejected proposals " +
        "carry the MD's reason so you can revise and re-propose.",
      inputSchema: {},
    },
    () => tracked(office, agentId, "library.my_proposals", {}, () =>
      ok({
        proposals: office.library.listProposals({ agentId }).map((p) => ({
          proposalId: p.proposalId,
          path: p.path,
          status: p.status,
          reason: p.reason,
          rationale: p.rationale,
          createdAt: p.createdAt,
        })),
      }),
    ),
  );

  registerLibraryResources(server, agentId, office);
}

/**
 * Exposes the governance library as read-only MCP resources (Phase 6 R6.2):
 * `library://manifest` (paths + hashes), `library://charters/self` (this
 * cubicle's own charter, resolved server-side), and `library://<path>` for
 * every doc. Because the read callbacks close over `agentId`, `charters/self`
 * always resolves to the *connecting* cubicle — the one agent-specific mapping.
 * There is deliberately no write resource: the only agent-facing mutation is the
 * `library.propose` tool (R6.4).
 */
function registerLibraryResources(server: McpServer, agentId: string, office: Office): void {
  const template = new ResourceTemplate("library://{+path}", {
    list: () => {
      const resources = [
        { uri: libraryUri("manifest"), name: "library manifest", mimeType: "application/json" },
        { uri: libraryUri("charters/self"), name: "your charter", mimeType: "text/markdown" },
        ...office.library.list().map((d) => ({
          uri: libraryUri(d.path),
          name: d.path,
          mimeType: "text/markdown",
        })),
      ];
      return { resources };
    },
  });

  server.registerResource(
    "library",
    template,
    { description: "The shared governance library (read-only)." },
    (uri, variables) => {
      const raw = variables.path;
      const path = Array.isArray(raw) ? raw.join("/") : String(raw ?? "");
      const { text, mimeType } = resolveLibraryResource(office, agentId, path);
      return { contents: [{ uri: uri.href, mimeType, text }] };
    },
  );
}

function resolveLibraryResource(
  office: Office,
  agentId: string,
  path: string,
): { text: string; mimeType: string } {
  if (path === "manifest") {
    const manifest = office.library.manifest(office.cubicles.charterRead(agentId));
    return { text: JSON.stringify(manifest, null, 2), mimeType: "application/json" };
  }
  if (path === "charters/self") {
    return { text: office.cubicles.charterRead(agentId), mimeType: "text/markdown" };
  }
  const content = office.library.resolve(path);
  if (content === undefined) {
    throw new Error(`library resource not found: ${path}`);
  }
  return { text: content, mimeType: "text/markdown" };
}
