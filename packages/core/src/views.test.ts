import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Office, buildFloorView, buildCubicleDetail } from "./index.js";

describe("buildFloorView (live data from the event log)", () => {
  let office: Office;
  beforeEach(() => {
    office = new Office({ approval: { defaultPolicy: "auto" } });
  });
  afterEach(() => office.close());

  it("renders one cubicle per agent with derived presence + task counts", () => {
    const a = office.registerAgent("research");
    const b = office.registerAgent("ops");
    office.presence.connect(a.agentId); // idle
    office.cubicles.taskCreate(a.agentId, "map auth");
    const t = office.cubicles.taskCreate(a.agentId, "summarize");
    office.cubicles.taskUpdate(a.agentId, t.id, { status: "done" });

    const floor = buildFloorView(office.store);
    expect(floor.map((c) => c.name)).toEqual(["research", "ops"]);
    const research = floor.find((c) => c.name === "research")!;
    expect(research.status).toBe("idle");
    expect(research.tasksTotal).toBe(2);
    expect(research.tasksDone).toBe(1);
    // ops never connected -> offline
    expect(floor.find((c) => c.name === "ops")!.status).toBe("offline");
    expect(b.agentId).toBeTruthy();
  });

  it("reflects the latest presence transition", () => {
    const a = office.registerAgent("research").agentId;
    office.presence.connect(a);
    office.presence.callStart(a); // running
    expect(buildFloorView(office.store)[0]?.status).toBe("running");
    office.presence.callEnd(a); // idle
    expect(buildFloorView(office.store)[0]?.status).toBe("idle");
  });

  it("surfaces the latest activity as the ticker", () => {
    const a = office.registerAgent("research").agentId;
    office.channel.userSpoke(a, "focus on auth");
    expect(buildFloorView(office.store)[0]?.activity).toContain("focus on auth");
  });
});

describe("buildCubicleDetail", () => {
  it("returns the notebook, tasks, and recent activity for one cubicle", () => {
    const office = new Office();
    const a = office.registerAgent("research").agentId;
    office.cubicles.notebookWrite(a, "• uses JWT");
    office.cubicles.taskCreate(a, "map auth");
    office.channel.userSpoke(a, "hello");
    office.channel.agentSaid(a, "hi there");

    const detail = buildCubicleDetail(office.store, a);
    expect(detail.notebook).toBe("• uses JWT");
    expect(detail.tasks.map((t) => t.title)).toEqual(["map auth"]);
    expect(detail.recent.some((r) => r.detail.includes("hello"))).toBe(true);
    expect(detail.recent.some((r) => r.detail.includes("hi there"))).toBe(true);
    office.close();
  });
});
