import { describe, expect, it, vi } from "vitest";
import type { ApprovalRequest } from "@hedoffice/core";
import { createApprovalBridge } from "./approval-bridge";

const req = (approvalId: string): ApprovalRequest => ({
  approvalId,
  agentId: "agent-1",
  action: "task.create",
  tool: "task.create",
});

describe("createApprovalBridge", () => {
  it("forwards the request and stays pending until resolved", async () => {
    const notify = vi.fn();
    const bridge = createApprovalBridge(notify);
    const p = bridge.approver(req("ap-1"));
    expect(notify).toHaveBeenCalledOnce();
    expect(bridge.pendingIds()).toEqual(["ap-1"]);

    expect(bridge.resolve("ap-1", "allow")).toBe(true);
    await expect(p).resolves.toBe("allow");
    expect(bridge.pendingIds()).toEqual([]);
  });

  it("carries a deny decision back to the gate", async () => {
    const bridge = createApprovalBridge(() => {});
    const p = bridge.approver(req("ap-2"));
    bridge.resolve("ap-2", "deny");
    await expect(p).resolves.toBe("deny");
  });

  it("returns false for an unknown approval id", () => {
    const bridge = createApprovalBridge(() => {});
    expect(bridge.resolve("nope", "allow")).toBe(false);
  });

  it("handles concurrent pending approvals independently", async () => {
    const bridge = createApprovalBridge(() => {});
    const a = bridge.approver(req("a"));
    const b = bridge.approver(req("b"));
    expect(bridge.pendingIds().sort()).toEqual(["a", "b"]);
    bridge.resolve("b", "deny");
    bridge.resolve("a", "allow");
    await expect(a).resolves.toBe("allow");
    await expect(b).resolves.toBe("deny");
  });
});
