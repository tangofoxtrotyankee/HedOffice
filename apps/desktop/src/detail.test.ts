import { describe, expect, it } from "vitest";
import type { CubicleDetailView } from "@hedoffice/schema";
import { detailToPanelData, feedTs } from "./detail";

const base: CubicleDetailView = {
  agentId: "a1",
  notebook: "",
  tasks: [],
  recent: [],
};

describe("detailToPanelData", () => {
  it("splits the notebook into non-empty trimmed lines with an empty fallback", () => {
    expect(detailToPanelData({ ...base, notebook: "line one  \n\nTODO follow up\n" }).notebook)
      .toEqual(["line one", "TODO follow up"]);
    expect(detailToPanelData(base).notebook).toEqual(["(notebook empty)"]);
  });

  it("maps all four task statuses onto panel task states", () => {
    const tasks = detailToPanelData({
      ...base,
      tasks: [
        { id: "1", title: "a", status: "done" },
        { id: "2", title: "b", status: "in_progress" },
        { id: "3", title: "c", status: "open" },
        { id: "4", title: "d", status: "blocked" },
      ],
    }).tasks;
    expect(tasks.map((t) => t.state)).toEqual(["done", "current", "open", "blocked"]);
  });

  it("formats feed timestamps and passes known kinds through", () => {
    const feed = detailToPanelData({
      ...base,
      recent: [
        { ts: new Date(2026, 6, 20, 9, 5, 3).getTime(), kind: "run", detail: "task.create" },
        { ts: Date.UTC(2026, 0, 1), kind: "say", detail: "» hello" },
      ],
    }).feed;
    expect(feed[0]).toMatchObject({ ts: "09:05:03", kind: "run", verb: "run" });
    expect(feed[1]?.kind).toBe("say");
  });

  it("coerces unknown feed kinds to read (forward-compat, no crash)", () => {
    const feed = detailToPanelData({
      ...base,
      recent: [{ ts: 0, kind: "future-kind", detail: "?" }],
    }).feed;
    expect(feed[0]?.kind).toBe("read");
    expect(feed[0]?.verb).toBe("future-kind");
  });

  it("never surfaces a local pendingApproval in live mode", () => {
    expect(detailToPanelData(base).pendingApproval).toBeUndefined();
  });
});

describe("feedTs", () => {
  it("zero-pads hours/minutes/seconds", () => {
    expect(feedTs(new Date(2026, 0, 1, 1, 2, 3).getTime())).toBe("01:02:03");
  });
});
