import { afterEach, describe, expect, it } from "vitest";
import { bootHedOffice } from "./boot.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

describe("bootHedOffice (cloud entrypoint)", () => {
  it("serves a health check and a landing payload", async () => {
    // uiDist points at nowhere so the JSON landing (headless mode) is exercised
    // even when the desktop package has a real build on disk.
    const { server } = bootHedOffice({ uiDist: "/nonexistent-ui-dist" });
    close = () => server.close();
    const port = await server.listen(0); // loopback for the test

    const health = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json());
    expect(health).toEqual({ ok: true, sessions: 0 });

    const landing = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.json());
    expect(landing).toMatchObject({ name: "hedoffice", mcp: "/mcp" });
  });

  it("registers a demo agent and returns a usable token", async () => {
    const { server, office, demoToken } = bootHedOffice({ demoAgent: true });
    close = () => server.close();
    expect(demoToken).toBeTruthy();
    expect(office.agents.resolveToken(demoToken!)).toBeTruthy();
  });
});
