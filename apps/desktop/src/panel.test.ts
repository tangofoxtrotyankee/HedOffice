import { describe, expect, it } from "vitest";
import {
  approvalBox,
  formatFeedLine,
  talkMeter,
  taskGlyph,
  FEED_KINDS,
} from "./panel";

describe("terminal feed", () => {
  it("formats a tool-call line with a result arrow", () => {
    expect(
      formatFeedLine({ ts: "12:04:21", kind: "run", verb: "run", detail: 'rg "jwt" -n src/', result: "14 matches" }),
    ).toBe('12:04:21  ◉ run  rg "jwt" -n src/  → 14 matches');
  });
  it("formats a line without a result", () => {
    expect(formatFeedLine({ ts: "12:04:25", kind: "think", verb: "think", detail: "check secret source" })).toBe(
      "12:04:25  ◐ think  check secret source",
    );
  });
  it("has a distinct glyph per kind", () => {
    const glyphs = Object.values(FEED_KINDS).map((k) => k.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});

describe("task glyphs", () => {
  it("maps states to distinct glyphs", () => {
    expect(taskGlyph("done")).toBe("✓");
    expect(taskGlyph("current")).toBe("◉");
    expect(taskGlyph("open")).toBe("○");
    expect(taskGlyph("blocked")).toBe("▓");
    // Live feeds emit "say" lines (core views) — the kind must exist here or
    // TerminalFeed's unguarded lookup would crash on real data.
    expect(FEED_KINDS.say.glyph).toBe("»");
  });
});

describe("talkMeter", () => {
  it("renders a proportional block meter", () => {
    expect(talkMeter(0, 7)).toBe("▢▢▢▢▢▢▢");
    expect(talkMeter(1, 7)).toBe("▣▣▣▣▣▣▣");
    expect(talkMeter(0.5, 6)).toBe("▣▣▣▢▢▢");
  });
});

describe("approvalBox (monochrome legibility)", () => {
  it("shows the action verbatim and both choices, as a closed box", () => {
    const box = approvalBox("rm -rf ./build", 40);
    expect(box[0]?.startsWith("╭") && box[0]?.endsWith("╮")).toBe(true);
    expect(box.at(-1)?.startsWith("╰")).toBe(true);
    expect(box.some((l) => l.includes("rm -rf ./build"))).toBe(true);
    expect(box.some((l) => l.includes("✓ Approve") && l.includes("✗ Deny"))).toBe(true);
    // every line is the same width (box stays aligned)
    const widths = new Set(box.map((l) => [...l].length));
    expect(widths.size).toBe(1);
  });
});
