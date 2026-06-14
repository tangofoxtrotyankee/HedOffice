import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Office } from "@hedoffice/core";
import { cubicleOf, sha256 } from "@hedoffice/core";
import {
  NotebookAppendInput,
  NotebookWriteInput,
  TaskCreateInput,
  TaskUpdateInput,
} from "@hedoffice/schema";

type ToolResult = { content: Array<{ type: "text"; text: string }> };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

/**
 * Wraps a tool handler so every call (a) is reflected in inferred presence
 * (in-flight while running) and (b) leaves a `tool.called` / `tool.result`
 * audit trail in the event log (docs/SECURITY.md). Handlers are synchronous —
 * better-sqlite3 is sync — so presence flips back to idle as soon as they return.
 */
function tracked(
  office: Office,
  agentId: string,
  tool: string,
  args: unknown,
  run: () => ToolResult,
): ToolResult {
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
  try {
    const result = run();
    office.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "system",
      type: "tool.result",
      payload: { agentId, callId, ok: true, durationMs: Date.now() - start },
    });
    return result;
  } catch (err) {
    office.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "system",
      type: "tool.result",
      payload: { agentId, callId, ok: false, durationMs: Date.now() - start },
    });
    throw err;
  } finally {
    office.presence.callEnd(agentId);
  }
}

/**
 * Registers the v1 notebook + task tools on a per-session McpServer, bound to a
 * single `agentId`. Because the server instance closes over `agentId`, an
 * agent's tool calls can only ever touch its own cubicle (state isolation —
 * ADR-002). `channel.*` voice tools arrive in Phase 3.
 */
export function registerCubicleTools(
  server: McpServer,
  agentId: string,
  office: Office,
): void {
  const { cubicles, presence } = office;

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
}
