import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bootHedOffice, type Booted } from "./boot.js";

let booted: Booted | undefined;
let port: number;
afterEach(async () => {
  await booted?.server.close();
  booted = undefined;
});

const ADMIN = "test-admin-token";

async function boot(opts: Parameters<typeof bootHedOffice>[0] = {}): Promise<void> {
  booted = bootHedOffice({ adminToken: ADMIN, env: {}, ...opts });
  port = await booted.server.listen(0);
}

function admin(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ADMIN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

describe("admin API (operator agent management — secret-free)", () => {
  it("rejects requests without the admin token", async () => {
    await boot();
    const res = await fetch(`http://127.0.0.1:${port}/admin/agents`);
    expect(res.status).toBe(401);
    const bad = await fetch(`http://127.0.0.1:${port}/admin/agents`, {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(bad.status).toBe(401);
  });

  it("exposes NO route that mints or returns a token", async () => {
    await boot();
    const { agentId } = booted!.office.registerAgent("Lee.");
    // Registration and rotation must not exist over HTTP.
    const register = await admin("/admin/agents", {
      method: "POST",
      body: JSON.stringify({ name: "Mallory." }),
    });
    expect(register.status).toBe(404);
    const rotate = await admin(`/admin/agents/${agentId}/rotate`, { method: "POST" });
    expect(rotate.status).toBe(404);
    // And the list payload never contains token material.
    const list = await admin("/admin/agents").then((r) => r.json());
    expect(JSON.stringify(list)).not.toMatch(/token/i);
  });

  it("lists agents and manages stage, charter and revoke over HTTP", async () => {
    await boot();
    const { agentId, token } = booted!.office.registerAgent("Lee.", "observe");

    const list = await admin("/admin/agents").then((r) => r.json());
    expect(list.agents.map((a: { name: string }) => a.name)).toContain("Lee.");

    const staged = await admin(`/admin/agents/${agentId}/stage`, {
      method: "POST",
      body: JSON.stringify({ stage: "supervised" }),
    });
    expect(staged.status).toBe(200);
    expect(booted!.office.agents.stageOf(agentId)).toBe("supervised");

    const charter = "# Lee.\nManaging Director agent. Reports to Sam.";
    await admin(`/admin/agents/${agentId}/charter`, {
      method: "PUT",
      body: JSON.stringify({ content: charter }),
    });
    const read = await admin(`/admin/agents/${agentId}/charter`).then((r) => r.json());
    expect(read.charter).toBe(charter);

    const revoked = await admin(`/admin/agents/${agentId}/revoke`, { method: "POST" });
    expect(revoked.status).toBe(200);
    expect(booted!.office.agents.resolveToken(token)).toBeUndefined();
  });

  it("accepts a ~1 MB charter (json body limit is raised above the 100 kb default)", async () => {
    await boot();
    const { agentId } = booted!.office.registerAgent("Lee.");

    const bigCharter = "# Lee.\n" + "governance line\n".repeat(65_000); // ~1 MB
    const put = await admin(`/admin/agents/${agentId}/charter`, {
      method: "PUT",
      body: JSON.stringify({ content: bigCharter }),
    });
    expect(put.status).toBe(200);
    expect(booted!.office.cubicles.charterRead(agentId)).toBe(bigCharter);
  });

  it("manages the governance library over HTTP (list/get/put/delete)", async () => {
    await boot();
    const put = await admin("/admin/library/decision_trees/user_registered.md", {
      method: "PUT",
      body: JSON.stringify({ content: "# user.registered\nIf no payment: log lead." }),
    });
    expect(put.status).toBe(200);

    const list = await admin("/admin/library").then((r) => r.json());
    expect(list.docs.map((d: { path: string }) => d.path)).toEqual([
      "decision_trees/user_registered.md",
    ]);

    const got = await admin("/admin/library/decision_trees/user_registered.md").then((r) =>
      r.json(),
    );
    expect(got.content).toContain("log lead");

    const bad = await admin("/admin/library/..%2Fetc", {
      method: "PUT",
      body: JSON.stringify({ content: "x" }),
    });
    expect(bad.status).toBe(400);

    const del = await admin("/admin/library/decision_trees/user_registered.md", {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    expect(booted!.office.library.list()).toHaveLength(0);
  });

  it("lists and resolves library proposals over HTTP (approve + reject)", async () => {
    await boot();
    const lee = booted!.office.registerAgent("Lee.").agentId;
    const approveId = booted!.office.library.propose(lee, "goals.md", "Q3 goals", "draft");
    const rejectId = booted!.office.library.propose(lee, "ethics.md", "loosen", "why not");

    // The list route must not be swallowed by the /admin/library/* wildcard.
    const pending = await admin("/admin/library/proposals?status=pending").then((r) => r.json());
    expect(pending.proposals).toHaveLength(2);

    const approved = await admin(`/admin/library/proposals/${approveId}/approve`, { method: "POST" });
    expect(approved.status).toBe(200);
    expect(booted!.office.library.read("goals.md")).toBe("Q3 goals");

    const rejected = await admin(`/admin/library/proposals/${rejectId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: "we do not loosen ethics" }),
    });
    expect(rejected.status).toBe(200);
    expect(booted!.office.library.read("ethics.md")).toBeUndefined();
    expect(booted!.office.library.getProposal(rejectId)?.reason).toBe("we do not loosen ethics");

    // Re-resolving a settled proposal is a 404.
    const again = await admin(`/admin/library/proposals/${approveId}/approve`, { method: "POST" });
    expect(again.status).toBe(404);
  });

  it("does not expose /admin routes when no admin token is configured", async () => {
    booted = bootHedOffice({ env: {} }); // no adminToken
    port = await booted.server.listen(0);
    const res = await fetch(`http://127.0.0.1:${port}/admin/agents`, {
      headers: { Authorization: `Bearer ${ADMIN}` },
    });
    expect(res.status).toBe(404);
  });

  it("seeds the demo agent only into an empty registry (no re-seed on restart)", async () => {
    const db = join(tmpdir(), `hedoffice-test-${process.pid}-${Date.now()}.sqlite`);
    try {
      const first = bootHedOffice({ demoAgent: true, location: db, env: {} });
      expect(first.demoToken).toBeTruthy();
      expect(first.office.agents.list()).toHaveLength(1);
      await first.server.close();

      // "Restart" on the same persistent DB: no second demo identity.
      const second = bootHedOffice({ demoAgent: true, location: db, env: {} });
      expect(second.demoToken).toBeUndefined();
      expect(second.office.agents.list()).toHaveLength(1);
      await second.server.close();
    } finally {
      for (const suffix of ["", "-wal", "-shm"]) rmSync(db + suffix, { force: true });
    }
  });
});
