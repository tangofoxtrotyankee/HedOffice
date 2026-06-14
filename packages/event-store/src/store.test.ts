import { beforeEach, describe, expect, it } from "vitest";
import type { NewEvent, StoredEvent } from "@hedoffice/schema";
import { EventStore } from "./index.js";

function notebookWrite(agentId: string, newHash: string, byteLen: number): NewEvent {
  return {
    agentId,
    streamId: `cubicle-${agentId}`,
    actor: "agent",
    type: "notebook.written",
    payload: { agentId, prevHash: null, newHash, byteLen },
  };
}

describe("EventStore", () => {
  let store: EventStore;
  beforeEach(() => {
    store = new EventStore(":memory:");
  });

  it("assigns an incrementing total-order id and a timestamp on append", () => {
    const a = store.append(notebookWrite("agent-1", "h1", 2));
    const b = store.append(notebookWrite("agent-1", "h2", 4));
    expect(a.eventId).toBe(1);
    expect(b.eventId).toBe(2);
    expect(a.ts).toBeTypeOf("number");
    expect(b.ts).toBeGreaterThanOrEqual(a.ts);
  });

  it("replays events in total order via a cursor", () => {
    store.append(notebookWrite("agent-1", "h1", 2));
    store.append(notebookWrite("agent-1", "h2", 4));
    store.append(notebookWrite("agent-1", "h3", 6));

    const after1 = store.read({ afterEventId: 1 });
    expect(after1.map((e) => e.eventId)).toEqual([2, 3]);
  });

  it("isolates events by agent (cubicle isolation)", () => {
    store.append(notebookWrite("agent-1", "a", 1));
    store.append(notebookWrite("agent-2", "b", 1));
    store.append(notebookWrite("agent-1", "c", 1));

    expect(store.count({ agentId: "agent-1" })).toBe(2);
    expect(store.count({ agentId: "agent-2" })).toBe(1);
  });

  it("filters by event type", () => {
    store.append(notebookWrite("agent-1", "a", 1));
    store.append({
      agentId: "agent-1",
      streamId: "cubicle-agent-1",
      actor: "system",
      type: "task.created",
      payload: { taskId: "t1", agentId: "agent-1", title: "Do it" },
    });
    const tasks = store.read({ type: "task.created" });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.type).toBe("task.created");
  });

  it("rejects an invalid event and writes nothing", () => {
    expect(() =>
      store.append({
        agentId: "agent-1",
        streamId: "c",
        actor: "agent",
        // @ts-expect-error — payload does not match the declared type
        type: "task.created",
        payload: { nope: true },
      }),
    ).toThrow();
    expect(store.count()).toBe(0);
  });

  it("appendMany is atomic — a bad event rolls back the whole batch", () => {
    const good = notebookWrite("agent-1", "h1", 2);
    const bad = { ...good, payload: { wrong: true } } as unknown as NewEvent;
    expect(() => store.appendMany([good, bad])).toThrow();
    expect(store.count()).toBe(0);
  });

  it("replay() folds events into a projection (latest notebook content)", () => {
    store.append(notebookWrite("agent-1", "hashA", 5));
    store.append(notebookWrite("agent-1", "hashB", 8));

    const latestHash = store.replay<string | null>(
      (state, e: StoredEvent) =>
        e.type === "notebook.written" ? e.payload.newHash : state,
      null,
      { agentId: "agent-1" },
    );
    expect(latestHash).toBe("hashB");
  });

  it("round-trips correlationId when present and omits it otherwise", () => {
    const withCorr = store.append({ ...notebookWrite("agent-1", "h", 1), correlationId: "corr-9" });
    const without = store.append(notebookWrite("agent-1", "h2", 1));
    expect(withCorr.correlationId).toBe("corr-9");
    expect(store.read({ afterEventId: 1 })[0]?.correlationId).toBeUndefined();
    expect(without.correlationId).toBeUndefined();
  });
});
