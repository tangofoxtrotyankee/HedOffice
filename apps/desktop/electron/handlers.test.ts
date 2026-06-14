import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Office } from "@hedoffice/core";
import { makeHandlers } from "./handlers";

describe("IPC handlers (main-process logic, headless)", () => {
  let office: Office;
  beforeEach(() => {
    office = new Office({ approval: { defaultPolicy: "auto" } });
  });
  afterEach(() => office.close());

  it("getFloor returns the live floor view", async () => {
    const a = office.registerAgent("research");
    office.presence.connect(a.agentId);
    office.cubicles.taskCreate(a.agentId, "map auth");
    const handlers = makeHandlers(office);
    const floor = await handlers.getFloor();
    expect(floor).toHaveLength(1);
    expect(floor[0]).toMatchObject({ name: "research", status: "idle", tasksTotal: 1 });
  });

  it("getDetail returns notebook + tasks for a cubicle", async () => {
    const a = office.registerAgent("research");
    office.cubicles.notebookWrite(a.agentId, "• note");
    const detail = await makeHandlers(office).getDetail(a.agentId);
    expect(detail.notebook).toBe("• note");
  });

  it("registerAgent mints an agent + token", async () => {
    const reg = await makeHandlers(office).registerAgent("ops");
    expect(reg.agentId).toBeTruthy();
    expect(reg.token).toBeTruthy();
    expect(office.agents.resolveToken(reg.token)).toBe(reg.agentId);
  });
});
