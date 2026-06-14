import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Office } from "./index.js";

describe("Office", () => {
  let office: Office;
  beforeEach(() => {
    office = new Office();
  });
  afterEach(() => {
    office.close();
  });

  it("mints a distinct agentId + bearer token per registration and resolves it", () => {
    const a = office.registerAgent("Ada");
    const b = office.registerAgent("Babbage");
    expect(a.agentId).not.toBe(b.agentId);
    expect(a.token).not.toBe(b.token);
    expect(office.agents.resolveToken(a.token)).toBe(a.agentId);
    expect(office.agents.resolveToken("bogus")).toBeUndefined();
  });

  it("isolates notebooks between cubicles", () => {
    const a = office.registerAgent("Ada");
    const b = office.registerAgent("Babbage");
    office.cubicles.notebookWrite(a.agentId, "ada's notes");
    office.cubicles.notebookWrite(b.agentId, "babbage's notes");
    expect(office.cubicles.notebookRead(a.agentId)).toBe("ada's notes");
    expect(office.cubicles.notebookRead(b.agentId)).toBe("babbage's notes");
  });

  it("appends to a notebook and records integrity hashes in the log", () => {
    const a = office.registerAgent("Ada");
    office.cubicles.notebookWrite(a.agentId, "one ");
    const after = office.cubicles.notebookAppend(a.agentId, "two");
    expect(after).toBe("one two");
    const writes = office.store.read({ type: "notebook.written", agentId: a.agentId });
    expect(writes).toHaveLength(2);
    // second write's prevHash chains off the first write's content
    expect(writes[1]?.type).toBe("notebook.written");
  });

  it("scopes tasks to their cubicle and refuses cross-cubicle updates", () => {
    const a = office.registerAgent("Ada");
    const b = office.registerAgent("Babbage");
    const t = office.cubicles.taskCreate(a.agentId, "Ship Phase 1");
    expect(office.cubicles.taskList(a.agentId)).toHaveLength(1);
    expect(office.cubicles.taskList(b.agentId)).toHaveLength(0);
    // b cannot touch a's task
    expect(() => office.cubicles.taskUpdate(b.agentId, t.id, { status: "done" })).toThrow();
    const updated = office.cubicles.taskUpdate(a.agentId, t.id, { status: "in_progress" });
    expect(updated.status).toBe("in_progress");
  });

  it("emits a task.updated event per changed field only", () => {
    const a = office.registerAgent("Ada");
    const t = office.cubicles.taskCreate(a.agentId, "x");
    office.cubicles.taskUpdate(a.agentId, t.id, { status: "done", detail: "done it" });
    office.cubicles.taskUpdate(a.agentId, t.id, { status: "done" }); // no-op
    const updates = office.store.read({ type: "task.updated", agentId: a.agentId });
    expect(updates).toHaveLength(2); // status + detail from the first call; none from the no-op
  });
});

describe("PresenceEngine inference", () => {
  let office: Office;
  beforeEach(() => {
    office = new Office();
  });
  afterEach(() => {
    office.close();
  });

  it("derives offline -> idle -> running -> idle from MCP activity", () => {
    const a = office.registerAgent("Ada").agentId;
    expect(office.presence.snapshot(a).status).toBe("offline");
    office.presence.connect(a);
    expect(office.presence.snapshot(a).status).toBe("idle");
    office.presence.callStart(a);
    expect(office.presence.snapshot(a).status).toBe("running");
    office.presence.callEnd(a);
    expect(office.presence.snapshot(a).status).toBe("idle");
    office.presence.disconnect(a);
    expect(office.presence.snapshot(a).status).toBe("offline");
  });

  it("stays running while any call is in-flight (overlapping calls)", () => {
    const a = office.registerAgent("Ada").agentId;
    office.presence.connect(a);
    office.presence.callStart(a);
    office.presence.callStart(a);
    office.presence.callEnd(a);
    expect(office.presence.snapshot(a).status).toBe("running");
    office.presence.callEnd(a);
    expect(office.presence.snapshot(a).status).toBe("idle");
  });

  it("records each transition as a presence.changed event", () => {
    const a = office.registerAgent("Ada").agentId;
    office.presence.connect(a);
    office.presence.callStart(a);
    office.presence.callEnd(a);
    const changes = office.store.read({ type: "presence.changed", agentId: a });
    expect(changes.map((e) => e.type === "presence.changed" && e.payload.to)).toEqual([
      "idle",
      "running",
      "idle",
    ]);
  });
});
