import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertNoPlaintextSecrets, PlaintextSecretError } from "./preflight.js";

describe("assertNoPlaintextSecrets (R5.3 / F7)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hedoffice-preflight-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes a clean directory", () => {
    expect(() => assertNoPlaintextSecrets(dir)).not.toThrow();
  });

  it("refuses to boot on a .env holding a token", () => {
    writeFileSync(join(dir, ".env"), "PORT=4317\nHEDOFFICE_AGENT_TOKEN_LEE=deadbeefdeadbeef\n");
    expect(() => assertNoPlaintextSecrets(dir)).toThrow(PlaintextSecretError);
  });

  it("refuses to boot on a secrets.json holding an api key", () => {
    writeFileSync(join(dir, "secrets.json"), JSON.stringify({ OPENAI_API_KEY: "sk-abc123" }));
    expect(() => assertNoPlaintextSecrets(dir)).toThrow(PlaintextSecretError);
  });

  it("ignores non-secret config and commented/empty values", () => {
    writeFileSync(join(dir, ".env"), "# HEDOFFICE_ADMIN_TOKEN=commented-out\nHOST=0.0.0.0\nLOG_LEVEL=info\n");
    expect(() => assertNoPlaintextSecrets(dir)).not.toThrow();
  });
});
