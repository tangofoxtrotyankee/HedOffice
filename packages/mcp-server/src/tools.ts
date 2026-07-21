import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Office } from "@hedoffice/core";
import { cubicleOf, MUTATING_TOOLS, STAGE_POLICY, sha256 } from "@hedoffice/core";
import {
  ChannelListenInput,
  ChannelSayInput,
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
}
