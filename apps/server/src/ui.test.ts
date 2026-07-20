import { afterEach, describe, expect, it } from "vitest";
import { bootHedOffice, type Booted } from "./boot.js";

const ADMIN = "test-admin-token";

let booted: Booted | undefined;
let port: number;
afterEach(async () => {
  await booted?.server.close();
  booted = undefined;
});

async function boot(opts: Parameters<typeof bootHedOffice>[0] = {}): Promise<void> {
  booted = bootHedOffice({ adminToken: ADMIN, env: {}, ...opts });
  port = await booted.server.listen(0);
}

function ui(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ADMIN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

/** Open the SSE stream and collect parsed events into an array. */
async function openEvents(): Promise<{ events: Array<{ event: string; data: any }>; close: () => void }> {
  const controller = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/ui/api/events?token=${ADMIN}`, {
    signal: controller.signal,
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const events: Array<{ event: string; data: any }> = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const event = /^event: (.*)$/m.exec(frame)?.[1];
          const data = /^data: (.*)$/m.exec(frame)?.[1];
          if (event) events.push({ event, data: data ? JSON.parse(data) : undefined });
        }
      }
    } catch {
      /* aborted */
    }
  })();
  return { events, close: () => controller.abort() };
}

async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  expect(cond()).toBe(true);
}

describe("operator web-UI API", () => {
  it("rejects requests without the operator token (header and query)", async () => {
    await boot();
    expect((await fetch(`http://127.0.0.1:${port}/ui/api/floor`)).status).toBe(401);
    expect(
      (await fetch(`http://127.0.0.1:${port}/ui/api/events?token=wrong`)).status,
    ).toBe(401);
    const audit = booted!.office.store.read({ type: "audit.security_event" });
    expect(audit.some((e) => (e.payload as any).kind === "ui_auth_failed")).toBe(true);
  });

  it("serves the floor and cubicle detail", async () => {
    await boot();
    const { agentId } = booted!.office.registerAgent("Lee.", "observe");
    booted!.office.cubicles.notebookWrite(agentId, "hello notebook");
    booted!.office.cubicles.taskCreate(agentId, "First task");

    const floor = await ui("/ui/api/floor").then((r) => r.json());
    expect(floor.floor.map((c: { name: string }) => c.name)).toContain("Lee.");

    const detail = await ui(`/ui/api/detail/${agentId}`).then((r) => r.json());
    expect(detail.notebook).toBe("hello notebook");
    expect(detail.tasks).toHaveLength(1);

    expect((await ui("/ui/api/detail/nope")).status).toBe(404);
  });

  it("streams approval requests over SSE and resolves them via POST", async () => {
    await boot();
    const { agentId } = booted!.office.registerAgent("Lee.", "supervised");
    const { events, close } = await openEvents();

    const decision = booted!.office.approvals.request(agentId, "task.create", "task.create");
    await until(() => events.some((e) => e.event === "approval"));
    const approval = events.find((e) => e.event === "approval")!.data;
    expect(approval).toMatchObject({ agentId, tool: "task.create" });

    const post = await ui(`/ui/api/approvals/${approval.approvalId}`, {
      method: "POST",
      body: JSON.stringify({ decision: "allow" }),
    });
    expect(post.status).toBe(200);
    await expect(decision).resolves.toBe("allow");
    await until(() => events.some((e) => e.event === "approval-resolved"));

    // Stale re-resolution 404s harmlessly.
    const stale = await ui(`/ui/api/approvals/${approval.approvalId}`, {
      method: "POST",
      body: JSON.stringify({ decision: "deny" }),
    });
    expect(stale.status).toBe(404);
    close();
  });

  it("replays pending approvals to a late-connecting operator", async () => {
    await boot();
    const { agentId } = booted!.office.registerAgent("Lee.", "supervised");
    const decision = booted!.office.approvals.request(agentId, "notebook.write", "notebook.write");

    const { events, close } = await openEvents(); // connect AFTER the request
    await until(() => events.some((e) => e.event === "approval"));
    const approval = events.find((e) => e.event === "approval")!.data;
    await ui(`/ui/api/approvals/${approval.approvalId}`, {
      method: "POST",
      body: JSON.stringify({ decision: "deny" }),
    });
    await expect(decision).resolves.toBe("deny");
    close();
  });

  it("auto-denies an unanswered approval after the timeout AND notifies browsers", async () => {
    await boot({ approvalTimeoutMs: 30 });
    const { agentId } = booted!.office.registerAgent("Lee.", "supervised");
    const { events, close } = await openEvents();
    await expect(
      booted!.office.approvals.request(agentId, "task.update", "task.update"),
    ).resolves.toBe("deny");
    // The stale prompt must be dismissed in connected UIs (Codex review P2).
    await until(() => events.some((e) => e.event === "approval-resolved"));
    const approvalId = events.find((e) => e.event === "approval")!.data.approvalId;
    expect(events.find((e) => e.event === "approval-resolved")!.data).toEqual({ approvalId });
    close();
  });

  it("pings update on presence changes", async () => {
    await boot();
    const { agentId } = booted!.office.registerAgent("Lee.");
    const { events, close } = await openEvents();
    booted!.office.presence.connect(agentId); // offline -> idle transition
    await until(() => events.some((e) => e.event === "update"));
    close();
  });

  it("accepts operator text into a cubicle channel via say", async () => {
    await boot();
    const { agentId } = booted!.office.registerAgent("Lee.");
    const res = await ui(`/ui/api/say/${agentId}`, {
      method: "POST",
      body: JSON.stringify({ text: "focus on the follow-up drafts" }),
    });
    expect(res.status).toBe(200);
    const spoke = booted!.office.store.read({ type: "channel.user_spoke", agentId });
    expect(spoke).toHaveLength(1);
    expect((await ui(`/ui/api/say/${agentId}`, { method: "POST", body: "{}" })).status).toBe(400);
    expect(
      (await ui("/ui/api/say/nope", { method: "POST", body: JSON.stringify({ text: "x" }) }))
        .status,
    ).toBe(404);
  });
});
