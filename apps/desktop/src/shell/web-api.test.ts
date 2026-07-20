import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebApi, probeWebApi, UnauthorizedError } from "./web-api";

/** Minimal EventSource stub capturing listeners for manual dispatch. */
class StubEventSource {
  static last: StubEventSource | undefined;
  url: string;
  listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  onopen: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    StubEventSource.last = this;
  }
  addEventListener(type: string, cb: (e: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }
  emit(type: string, data: unknown): void {
    for (const cb of this.listeners.get(type) ?? []) {
      cb({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

const jsonResponse = (status: number, body: unknown = {}): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as Response;

beforeEach(() => {
  vi.stubGlobal("EventSource", StubEventSource);
});
afterEach(() => {
  vi.unstubAllGlobals();
  StubEventSource.last = undefined;
});

describe("createWebApi", () => {
  it("sends the bearer token and unwraps the floor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { floor: [{ name: "Lee." }] }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createWebApi("tok-123");
    const floor = await api.getFloor();
    expect(floor).toEqual([{ name: "Lee." }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/ui/api/floor");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("throws UnauthorizedError on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401)));
    await expect(createWebApi("bad").getFloor()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects registerAgent — web provisioning is env/CLI only", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(createWebApi("t").registerAgent("Eve.")).rejects.toThrow(/Railway Variables/);
  });

  it("fans SSE events out to subscribers and honors unsubscribe", () => {
    vi.stubGlobal("fetch", vi.fn());
    const api = createWebApi("tok");
    const updates = vi.fn();
    const approvals = vi.fn();
    const offUpdate = api.onUpdate(updates);
    api.onApprovalRequest(approvals);

    const es = StubEventSource.last!;
    expect(es.url).toContain("/ui/api/events?token=tok");
    es.emit("update", {});
    es.emit("approval", { approvalId: "ap-1", agentId: "a", action: "x", tool: "x" });
    expect(updates).toHaveBeenCalledTimes(1);
    expect(approvals).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: "ap-1" }),
    );

    offUpdate();
    es.emit("update", {});
    expect(updates).toHaveBeenCalledTimes(1); // unsubscribed

    es.onopen?.(); // reconnect heals via refresh ping to remaining subscribers
  });

  it("posts approval decisions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await createWebApi("tok").resolveApproval("ap-9", "deny");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/ui/api/approvals/ap-9");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ decision: "deny" });
  });
});

describe("probeWebApi", () => {
  it("classifies ok / unauthorized / absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200)));
    expect(await probeWebApi("t")).toBe("ok");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401)));
    expect(await probeWebApi("t")).toBe("unauthorized");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await probeWebApi("t")).toBe("absent");
  });
});
