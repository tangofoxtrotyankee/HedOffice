import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Office } from "./index.js";

describe("AgentRegistry lifecycle (list / revoke / rotate / stage)", () => {
  let office: Office;
  beforeEach(() => {
    office = new Office();
  });
  afterEach(() => {
    office.close();
  });

  it("lists registered agents with stage and active flag", () => {
    const a = office.registerAgent("Lee.", "observe");
    office.registerAgent("Ada");
    const list = office.agents.list();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ agentId: a.agentId, name: "Lee.", stage: "observe", active: true });
    expect(list[1]?.stage).toBe("supervised"); // default
  });

  it("revoking kills the token but keeps the record and history", () => {
    const a = office.registerAgent("Lee.");
    expect(office.agents.revoke(a.agentId)).toBe(true);
    expect(office.agents.resolveToken(a.token)).toBeUndefined();
    expect(office.agents.get(a.agentId)).toMatchObject({ active: false });
    expect(office.agents.revoke(a.agentId)).toBe(false); // idempotence guard
    const events = office.store.read({ type: "agent.revoked", agentId: a.agentId });
    expect(events).toHaveLength(1);
  });

  it("rotating mints a fresh token and invalidates the old one", () => {
    const a = office.registerAgent("Lee.");
    const fresh = office.agents.rotateToken(a.agentId);
    expect(fresh).toBeTruthy();
    expect(office.agents.resolveToken(a.token)).toBeUndefined();
    expect(office.agents.resolveToken(fresh!)).toBe(a.agentId);
  });

  it("stage changes are recorded as events", () => {
    const a = office.registerAgent("Lee.", "observe");
    expect(office.agents.setStage(a.agentId, "supervised")).toBe(true);
    expect(office.agents.stageOf(a.agentId)).toBe("supervised");
    const events = office.store.read({ type: "agent.stage_changed", agentId: a.agentId });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ from: "observe", to: "supervised" });
  });

  it("the approval gate follows the agent's stage: observe denies, autonomous allows", async () => {
    const lee = office.registerAgent("Lee.", "observe");
    const otto = office.registerAgent("Otto.", "autonomous");
    expect(office.approvals.policyFor(lee.agentId, "notebook.write")).toBe("deny");
    expect(office.approvals.policyFor(otto.agentId, "notebook.write")).toBe("auto");
    await expect(office.approvals.request(lee.agentId, "notebook.write", "write")).resolves.toBe("deny");
    await expect(office.approvals.request(otto.agentId, "notebook.write", "write")).resolves.toBe("allow");
    // promotion changes the outcome
    office.agents.setStage(lee.agentId, "autonomous");
    await expect(office.approvals.request(lee.agentId, "notebook.write", "write")).resolves.toBe("allow");
  });

  it("per-tool overrides beat the stage default", () => {
    const a = office.registerAgent("Lee.", "autonomous");
    office.approvals.setPolicy(a.agentId, "task.update", "deny");
    expect(office.approvals.policyFor(a.agentId, "task.update")).toBe("deny");
    expect(office.approvals.policyFor(a.agentId, "task.create")).toBe("auto");
  });

  it("stores and reads back a cubicle charter, logging charter.written", () => {
    const a = office.registerAgent("Lee.");
    expect(office.cubicles.charterRead(a.agentId)).toBe("");
    office.cubicles.charterWrite(a.agentId, "# Lee.\nRole: Managing Director agent.");
    expect(office.cubicles.charterRead(a.agentId)).toContain("Managing Director");
    const events = office.store.read({ type: "charter.written", agentId: a.agentId });
    expect(events).toHaveLength(1);
    expect(events[0]?.actor).toBe("user");
  });
});
