import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Office } from "./index.js";
import { isValidLibraryPath } from "./library.js";

describe("LibraryStore (shared governance docs)", () => {
  let office: Office;
  beforeEach(() => {
    office = new Office();
  });
  afterEach(() => {
    office.close();
  });

  it("writes, lists, reads and deletes path-addressed docs", () => {
    office.library.write("constitution.md", "# Constitution\nLee. reports to Sam.");
    office.library.write("decision_trees/user_registered.md", "# user.registered\n…");

    expect(office.library.list().map((d) => d.path)).toEqual([
      "constitution.md",
      "decision_trees/user_registered.md",
    ]);
    expect(office.library.read("constitution.md")).toContain("reports to Sam");
    expect(office.library.read("missing.md")).toBeUndefined();

    expect(office.library.delete("constitution.md")).toBe(true);
    expect(office.library.delete("constitution.md")).toBe(false);
    expect(office.library.read("constitution.md")).toBeUndefined();
  });

  it("logs every write and delete as library.written with hashes", () => {
    office.library.write("ethics.md", "Be honest.");
    office.library.write("ethics.md", "Be honest. Escalate.");
    office.library.delete("ethics.md");
    const events = office.store.read({ type: "library.written" });
    expect(events).toHaveLength(3);
    expect(events[0]?.actor).toBe("user");
    expect((events[2]?.payload as { newHash: string | null }).newHash).toBeNull();
  });

  it("rejects traversal and malformed paths", () => {
    expect(isValidLibraryPath("constitution.md")).toBe(true);
    expect(isValidLibraryPath("decision_trees/user_registered.md")).toBe(true);
    expect(isValidLibraryPath("../secrets")).toBe(false);
    expect(isValidLibraryPath("/etc/passwd")).toBe(false);
    expect(isValidLibraryPath("a/../b.md")).toBe(false);
    expect(isValidLibraryPath("")).toBe(false);
    expect(() => office.library.write("../oops.md", "x")).toThrow(/invalid/);
  });
});
