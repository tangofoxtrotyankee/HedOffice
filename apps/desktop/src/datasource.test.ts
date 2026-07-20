import { describe, expect, it } from "vitest";
import type { CubicleView } from "@hedoffice/schema";
import { cubicleViewToData, liveDataSource, sampleDataSource } from "./datasource";

const view: CubicleView = {
  agentId: "agent-1",
  name: "research",
  status: "running",
  activity: "notebook.write",
  tasksDone: 1,
  tasksTotal: 3,
  lastActivity: 1_700_000_000_000,
};

describe("cubicleViewToData", () => {
  it("maps a core view to the UI cubicle shape", () => {
    expect(cubicleViewToData(view)).toEqual({
      name: "research",
      status: "running",
      activity: "notebook.write",
      tasksDone: 1,
      tasksTotal: 3,
      agentId: "agent-1",
    });
  });
  it("falls back to 'idle' when there is no activity ticker", () => {
    expect(cubicleViewToData({ ...view, activity: "" }).activity).toBe("idle");
  });
});

describe("data sources", () => {
  it("liveDataSource maps a list of views", () => {
    const ds = liveDataSource([view, { ...view, name: "ops", status: "idle" }]);
    expect(ds.getFloor().map((c) => c.name)).toEqual(["research", "ops"]);
  });
  it("sampleDataSource returns the static floor", () => {
    expect(sampleDataSource.getFloor().length).toBeGreaterThan(0);
  });
});
