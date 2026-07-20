import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bootHedOffice, type Booted } from "./boot.js";
import { resolveUiDist } from "./ui-dist.js";

let booted: Booted | undefined;
afterEach(async () => {
  await booted?.server.close();
  booted = undefined;
});

describe("static office UI serving", () => {
  it("resolveUiDist honors an override only when index.html exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "hedoffice-ui-"));
    try {
      expect(resolveUiDist(dir)).toBeUndefined();
      writeFileSync(join(dir, "index.html"), "<title>HedOffice</title>");
      expect(resolveUiDist(dir)).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves index.html at / when a UI dist is present, landing JSON otherwise", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hedoffice-ui-"));
    try {
      writeFileSync(join(dir, "index.html"), "<!doctype html><title>HedOffice</title>");
      booted = bootHedOffice({ env: {}, uiDist: dir });
      const port = await booted.server.listen(0);
      const page = await fetch(`http://127.0.0.1:${port}/`);
      expect(page.headers.get("content-type")).toContain("text/html");
      expect(await page.text()).toContain("HedOffice");
      // API/health routes are not shadowed by the static mount.
      expect((await fetch(`http://127.0.0.1:${port}/healthz`)).ok).toBe(true);
      await booted.server.close();

      booted = bootHedOffice({ env: {}, uiDist: join(dir, "missing") });
      const port2 = await booted.server.listen(0);
      const landing = await fetch(`http://127.0.0.1:${port2}/`).then((r) => r.json());
      expect(landing).toMatchObject({ name: "hedoffice" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
