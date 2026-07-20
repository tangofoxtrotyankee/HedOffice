import { describe, expect, it } from "vitest";
import {
  EVENT_TYPES,
  EventBody,
  NewEvent,
  StoredEvent,
  TOOL_NAMES,
  TaskCreateInput,
} from "./index.js";

describe("event schema", () => {
  it("validates a well-formed new event", () => {
    const ev: NewEvent = {
      agentId: "agent-1",
      streamId: "cubicle-1",
      actor: "agent",
      type: "notebook.written",
      payload: { agentId: "agent-1", prevHash: null, newHash: "abc", byteLen: 3 },
    };
    expect(NewEvent.parse(ev)).toEqual(ev);
  });

  it("rejects a payload that does not match its type", () => {
    const bad = {
      agentId: "agent-1",
      streamId: "cubicle-1",
      actor: "agent",
      type: "task.created",
      payload: { nope: true },
    };
    expect(() => NewEvent.parse(bad)).toThrow();
  });

  it("rejects an unknown event type", () => {
    const bad = {
      agentId: "a",
      streamId: "c",
      actor: "system",
      type: "totally.made.up",
      payload: {},
    };
    expect(() => NewEvent.parse(bad)).toThrow();
  });

  it("exposes every union member via EVENT_TYPES", () => {
    expect(EVENT_TYPES).toContain("presence.changed");
    expect(EVENT_TYPES.length).toBe(EventBody.options.length);
  });

  it("parses a stored event with id and ts", () => {
    const stored: StoredEvent = {
      eventId: 1,
      ts: 1_700_000_000_000,
      agentId: "agent-1",
      streamId: "cubicle-1",
      actor: "user",
      type: "channel.user_spoke",
      payload: { agentId: "agent-1", transcript: "hi", audioRef: null, sttMs: 120 },
    };
    expect(StoredEvent.parse(stored).eventId).toBe(1);
  });
});

describe("tool inputs", () => {
  it("covers all twelve v1 tools", () => {
    expect(TOOL_NAMES).toHaveLength(12);
    expect(TOOL_NAMES).toContain("cubicle.brief");
    expect(TOOL_NAMES).toContain("library.list");
    expect(TOOL_NAMES).toContain("library.read");
  });

  it("requires a non-empty task title", () => {
    expect(() => TaskCreateInput.parse({ title: "" })).toThrow();
    expect(TaskCreateInput.parse({ title: "Ship it" }).title).toBe("Ship it");
  });
});
