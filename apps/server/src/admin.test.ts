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
