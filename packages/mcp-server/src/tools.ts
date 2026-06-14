import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Office } from "@hedoffice/core";
import { cubicleOf, MUTATING_TOOLS, sha256 } from "@hedoffice/core";
import {
  ChannelListenInput,
  ChannelSayInput,
  NotebookAppendInput,
  NotebookWriteInput,
  TaskCreateInput,
  TaskUpdateInput,
} from "@hedoffice/schema";

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
        "Read recent user utterances in this cubicle since a cursor (channel.user_spoke).",
      inputSchema: ChannelListenInput.shape,
    },
    (args) => tracked(office, agentId, "channel.listen", args, () =>
      ok(channel.listen(agentId, args.sinceEventId)),
    ),
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
}
