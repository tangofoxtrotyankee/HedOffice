import { describe, expect, it } from "vitest";
import { ALL_DEPARTMENTS, departmentRows, PRESENCE_MOTION } from "./rail";
import { SAMPLE_FLOOR } from "./sample";

describe("departmentRows", () => {
  it("leads with a numbered ALL row, then one per cubicle", () => {
    const rows = departmentRows(SAMPLE_FLOOR);
    expect(rows[0]).toMatchObject({ n: 1, name: ALL_DEPARTMENTS });
    expect(rows).toHaveLength(SAMPLE_FLOOR.length + 1);
    expect(rows[1]).toMatchObject({ n: 2, name: "research", glyph: "◉" });
  });
  it("uses the offline glyph for empty seats", () => {
    const rows = departmentRows(SAMPLE_FLOOR);
    const finance = rows.find((r) => r.name === "finance");
    expect(finance?.glyph).toBe("·");
  });
});

describe("PRESENCE_MOTION", () => {
  it("animates only the active states; idle/offline are static", () => {
    expect(PRESENCE_MOTION.running).toBe("glyph-pulse");
    expect(PRESENCE_MOTION.thinking).toBe("glyph-spin");
    expect(PRESENCE_MOTION.blocked).toBe("glyph-attention");
    expect(PRESENCE_MOTION.idle).toBe("");
    expect(PRESENCE_MOTION.offline).toBe("");
  });
});
