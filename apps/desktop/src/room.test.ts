import { describe, expect, it } from "vitest";
import { CONNECTORS, joinRow, wrapInRoom } from "./room";
import { cubicleLines } from "./cubicle";

describe("wrapInRoom (v2 container is additive)", () => {
  const body = joinRow([
    cubicleLines({ name: "ledger", status: "running", activity: "reconcile", tasksDone: 2, tasksTotal: 4 }),
    cubicleLines({ name: "audit", status: "idle", activity: "waiting", tasksDone: 0, tasksTotal: 0 }),
  ]);

  it("encloses v1 cubicles in a double-line department room", () => {
    const room = wrapInRoom("FINANCE", body, { style: "double", board: "roadmap" });
    expect(room[0]?.startsWith("╔") && room[0]?.endsWith("╗")).toBe(true);
    expect(room.at(-1)?.startsWith("╚")).toBe(true);
    // the wall board is tee-joined into the room wall
    expect(room[1]?.startsWith("╠") && room[1]?.includes("board: roadmap") && room[1]?.endsWith("╣")).toBe(true);
    // the v1 cubicle content survives unchanged inside the room
    expect(room.some((l) => l.includes("ledger"))).toBe(true);
  });

  it("supports a rounded informal room", () => {
    const room = wrapInRoom("the kitchen", body, { style: "rounded" });
    expect(room[0]?.startsWith("╭") && room[0]?.endsWith("╮")).toBe(true);
  });

  it("keeps every frame line the same width", () => {
    const room = wrapInRoom("FINANCE", body, { board: "roadmap" });
    const widths = new Set(room.map((l) => [...l].length));
    expect(widths.size).toBe(1);
  });

  it("exposes agent-to-agent connector glyphs", () => {
    expect(CONNECTORS.branch).toBe("├─▶");
    expect(CONNECTORS.cross).toBe("╪");
  });
});
