import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Office } from "./index.js";

describe("ChannelService (voice <-> MCP bridge)", () => {
  let office: Office;
  beforeEach(() => {
    office = new Office();
  });
  afterEach(() => office.close());

  it("delivers user utterances to the agent via a cursor", () => {
    const a = office.registerAgent("Ada").agentId;
    office.channel.userSpoke(a, "first thing");
    const r1 = office.channel.listen(a);
    expect(r1.utterances.map((u) => u.transcript)).toEqual(["first thing"]);

    office.channel.userSpoke(a, "second thing");
    const r2 = office.channel.listen(a, r1.cursor);
    expect(r2.utterances.map((u) => u.transcript)).toEqual(["second thing"]);
  });

  it("isolates the channel per cubicle", () => {
    const a = office.registerAgent("Ada").agentId;
    const b = office.registerAgent("Babbage").agentId;
    office.channel.userSpoke(a, "for ada");
    expect(office.channel.listen(b).utterances).toHaveLength(0);
  });

  it("marks the cubicle thinking on user input, idle again after the agent speaks", () => {
    const a = office.registerAgent("Ada").agentId;
    office.presence.connect(a);
    expect(office.presence.snapshot(a).status).toBe("idle");
    office.channel.userSpoke(a, "hey");
    expect(office.presence.snapshot(a).status).toBe("thinking");
    office.channel.agentSaid(a, "on it");
    expect(office.presence.snapshot(a).status).toBe("idle");
  });
});

describe("ApprovalGate", () => {
  it("auto-allows when policy is auto, with no approval events", async () => {
    const office = new Office({ approval: { defaultPolicy: "auto" } });
    const a = office.registerAgent("Ada").agentId;
    const decision = await office.approvals.request(a, "task.create", "task.create");
    expect(decision).toBe("allow");
    expect(office.store.read({ type: "approval.requested" })).toHaveLength(0);
    office.close();
  });

  it("denies when policy is deny, recording requested + resolved", async () => {
    const office = new Office({ approval: { defaultPolicy: "deny" } });
    const a = office.registerAgent("Ada").agentId;
    const decision = await office.approvals.request(a, "task.create", "task.create");
    expect(decision).toBe("deny");
    expect(office.store.read({ type: "approval.requested", agentId: a })).toHaveLength(1);
    const resolved = office.store.read({ type: "approval.resolved", agentId: a });
    expect(resolved).toHaveLength(1);
    office.close();
  });

  it("blocks while a prompt is pending, then resolves to the human's decision", async () => {
    let release!: (d: "allow" | "deny") => void;
    const office = new Office({
      approval: {
        defaultPolicy: "prompt",
        approver: () => new Promise((res) => { release = res; }),
      },
    });
    const a = office.registerAgent("Ada").agentId;
    office.presence.connect(a);

    const pending = office.approvals.request(a, "task.update", "task.update");
    // The human hasn't decided yet — cubicle shows blocked.
    expect(office.presence.snapshot(a).status).toBe("blocked");

    release("allow");
    expect(await pending).toBe("allow");
    expect(office.presence.snapshot(a).status).toBe("idle");
  });

  it("respects a per-agent per-tool policy override", async () => {
    const office = new Office({ approval: { defaultPolicy: "prompt" } });
    const a = office.registerAgent("Ada").agentId;
    office.approvals.setPolicy(a, "notebook.write", "auto");
    expect(office.approvals.policyFor(a, "notebook.write")).toBe("auto");
    expect(office.approvals.policyFor(a, "task.create")).toBe("prompt");
    office.close();
  });
});

describe("PresenceEngine 5-state precedence", () => {
  let office: Office;
  beforeEach(() => { office = new Office(); });
  afterEach(() => office.close());

  it("blocked outranks running and thinking", () => {
    const a = office.registerAgent("Ada").agentId;
    office.presence.connect(a);
    office.presence.userSpoke(a);        // thinking
    office.presence.callStart(a);        // running outranks thinking
    expect(office.presence.snapshot(a).status).toBe("running");
    office.presence.blockStart(a);       // blocked outranks running
    expect(office.presence.snapshot(a).status).toBe("blocked");
    office.presence.blockEnd(a);
    expect(office.presence.snapshot(a).status).toBe("running");
    office.presence.callEnd(a);
    expect(office.presence.snapshot(a).status).toBe("thinking");
  });
});
