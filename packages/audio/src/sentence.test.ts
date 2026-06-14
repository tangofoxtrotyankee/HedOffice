import { describe, expect, it } from "vitest";
import { SentenceChunker, splitSentences } from "./sentence.js";

describe("splitSentences", () => {
  it("splits on sentence punctuation, keeping it", () => {
    expect(splitSentences("Hi there. How are you? Great!")).toEqual([
      "Hi there.",
      "How are you?",
      "Great!",
    ]);
  });
  it("keeps a trailing fragment with no terminator", () => {
    expect(splitSentences("first. then no end")).toEqual(["first.", "then no end"]);
  });
  it("returns nothing for empty/whitespace", () => {
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("SentenceChunker (streaming)", () => {
  it("emits the first sentence as soon as it completes", () => {
    const c = new SentenceChunker();
    expect(c.push("Focus on refresh")).toEqual([]); // incomplete
    expect(c.push(" tokens. Then ")).toEqual(["Focus on refresh tokens."]);
    expect(c.push("open a PR.")).toEqual(["Then open a PR."]);
    expect(c.flush()).toEqual([]);
  });
  it("flushes a trailing fragment at end of turn", () => {
    const c = new SentenceChunker();
    c.push("All done");
    expect(c.flush()).toEqual(["All done"]);
  });
});
