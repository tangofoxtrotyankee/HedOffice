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

  it("resolves friendly URIs (no .md) and records prevHash on rewrite", () => {
    office.library.write("constitution.md", "v1");
    expect(office.library.resolve("constitution")).toBe("v1");
    expect(office.library.resolve("constitution.md")).toBe("v1");
    office.library.write("constitution.md", "v2");
    const events = office.store.read({ type: "library.written" });
    const last = events.at(-1)!;
    expect(last.type === "library.written" && last.payload.prevHash).not.toBeNull();
    expect(last.type === "library.written" && last.payload.newHash).not.toBeNull();
  });

  it("builds a manifest of doc hashes plus the caller's charters/self", () => {
    office.library.write("constitution.md", "the rules");
    const manifest = office.library.manifest("Lee.'s charter");
    expect(manifest.entries.map((e) => e.path)).toContain("constitution.md");
    expect(manifest.entries[0]!.uri).toBe("library://constitution.md");
    expect(manifest.self.path).toBe("charters/self");
    expect(manifest.self.uri).toBe("library://charters/self");
    expect(manifest.self.sha256).toHaveLength(64);
  });

  it("proposal round-trip: propose → approve applies, and is fully logged", () => {
    const lee = office.registerAgent("Lee.").agentId;
    const id = office.library.propose(lee, "processes/welcome.md", "# Welcome\nBe warm.", "first draft");

    // Nothing applied yet.
    expect(office.library.read("processes/welcome.md")).toBeUndefined();
    expect(office.store.read({ type: "library.proposal" })).toHaveLength(1);

    expect(office.library.approveProposal(id)).toBe(true);
    expect(office.library.read("processes/welcome.md")).toContain("Be warm");

    // The applied write credits the proposer and links to the proposal.
    const write = office.store
      .read({ type: "library.written" })
      .find((e) => e.type === "library.written" && e.payload.proposedBy === lee);
    expect(write?.correlationId).toBe(id);
    // Double-approve is a no-op.
    expect(office.library.approveProposal(id)).toBe(false);
  });

  it("proposal round-trip: reject applies nothing and exposes the reason", () => {
    const lee = office.registerAgent("Lee.").agentId;
    const id = office.library.propose(lee, "ethics.md", "anything goes", "loosen it up");

    expect(office.library.rejectProposal(id, "we do not loosen ethics")).toBe(true);
    expect(office.library.read("ethics.md")).toBeUndefined();
    expect(office.library.getProposal(id)?.status).toBe("rejected");

    const rejection = office.store.read({ type: "library.proposal_rejected", agentId: lee });
    expect(rejection).toHaveLength(1);
    // The agent can read its own proposals with the reason attached.
    const mine = office.library.listProposals({ agentId: lee });
    expect(mine[0]!.reason).toBe("we do not loosen ethics");
  });
});
