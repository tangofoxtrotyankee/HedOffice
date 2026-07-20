import { describe, expect, it } from "vitest";
import { enqueue, remove } from "./approval-queue";
import type { ApprovalRequestDTO } from "./shell/ipc-contract";

const req = (approvalId: string): ApprovalRequestDTO => ({
  approvalId,
  agentId: "agent-1",
  action: "task.create",
  tool: "task.create",
});

describe("approval queue", () => {
  it("queues in arrival order", () => {
    const q = enqueue(enqueue([], req("a")), req("b"));
    expect(q.map((r) => r.approvalId)).toEqual(["a", "b"]);
  });

  it("dedupes replayed requests by approvalId", () => {
    const q = enqueue(enqueue([], req("a")), req("a"));
    expect(q).toHaveLength(1);
  });

  it("removes resolved approvals and leaves the rest queued", () => {
    const q = enqueue(enqueue(enqueue([], req("a")), req("b")), req("c"));
    expect(remove(q, "b").map((r) => r.approvalId)).toEqual(["a", "c"]);
    expect(remove(q, "missing")).toHaveLength(3);
  });
});
