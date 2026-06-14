import { describe, expect, it } from "vitest";
import { PRESENCE } from "./presence";
import {
  CARD_WIDTH,
  cubicleLines,
  floorText,
  statusSummary,
  taskMeter,
  type CubicleData,
} from "./cubicle";
import { SAMPLE_FLOOR } from "./sample";

describe("presence glyphs", () => {
  it("has 5 structurally distinct glyphs (readable in grayscale)", () => {
    const glyphs = Object.values(PRESENCE).map((p) => p.glyph);
    expect(glyphs).toEqual(["◉", "◐", "○", "▓", "·"]);
    expect(new Set(glyphs).size).toBe(5);
  });
});

describe("taskMeter", () => {
  it("renders proportional block shades", () => {
    expect(taskMeter(4, 6)).toBe("▓▓▓▓░░");
    expect(taskMeter(0, 0)).toBe("░░░░░░");
    expect(taskMeter(6, 6)).toBe("▓▓▓▓▓▓");
  });
});

describe("cubicle geometry (box-drawing must align on the cell grid)", () => {
  it("every line of every card is exactly CARD_WIDTH", () => {
    for (const c of SAMPLE_FLOOR) {
      for (const line of cubicleLines(c)) {
        expect([...line].length).toBe(CARD_WIDTH);
      }
    }
  });

  it("draws the status glyph in the header and status row", () => {
    const c: CubicleData = { name: "research", status: "running", activity: "x", tasksDone: 1, tasksTotal: 2 };
    const lines = cubicleLines(c);
    expect(lines[0]).toContain("◉");
    expect(lines[1]).toContain("◉ running");
  });

  it("renders an empty seat as a dashed box", () => {
    const lines = cubicleLines({ name: "finance", status: "offline", activity: "", tasksDone: 0, tasksTotal: 0, empty: true });
    expect(lines[0]).toContain("┄");
    expect(lines[1]).toContain("offline / unstaffed");
  });
});

describe("floor", () => {
  it("summarizes presence counts in the header", () => {
    expect(statusSummary(SAMPLE_FLOOR)).toBe("◉ 1  ◐ 1  ○ 1  ▓ 1  · 1");
  });
  it("renders the full floor as text", () => {
    const text = floorText(SAMPLE_FLOOR);
    expect(text).toContain("HEDOFFICE ▸ FLOOR 1 · MISSION CONTROL");
    expect(text).toContain("research");
    expect(text).toContain("finance");
  });
});
