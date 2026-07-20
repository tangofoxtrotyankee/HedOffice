import { afterEach, describe, expect, it } from "vitest";
import { bootHedOffice, type Booted } from "./boot.js";
import { seedAgentsFromEnv } from "./env-agents.js";

const TOKEN = "a".repeat(64); // well-formed 64-char secret
const TOKEN2 = "b".repeat(64);

let booted: Booted | undefined;
afterEach(async () => {
  await booted?.server.close();
  booted = undefined;
});

describe("env-seeded agent provisioning (Railway Variables)", () => {
  it("creates an agent from HEDOFFICE_AGENT_TOKEN_* with name/stage vars", () => {
    booted = bootHedOffice({
      env: {
        HEDOFFICE_AGENT_TOKEN_LEE: TOKEN,
        HEDOFFICE_AGENT_NAME_LEE: "Lee.",
        HEDOFFICE_AGENT_STAGE_LEE: "supervised",
      },
    });
    expect(booted.seededAgents).toHaveLength(1);
    expect(booted.seededAgents[0]).toMatchObject({ name: "Lee.", stage: "supervised", created: true });
    const agentId = booted.office.agents.resolveToken(TOKEN);
    expect(agentId).toBeTruthy();
    expect(booted.office.agents.stageOf(agentId!)).toBe("supervised");
  });

  it("defaults: name = handle, stage = observe", () => {
    booted = bootHedOffice({ env: { HEDOFFICE_AGENT_TOKEN_LEE: TOKEN } });
    expect(booted.seededAgents[0]).toMatchObject({ name: "LEE", stage: "observe" });
  });

  it("is idempotent by name and rotates the token when the variable changes", () => {
    const env = { HEDOFFICE_AGENT_TOKEN_LEE: TOKEN, HEDOFFICE_AGENT_NAME_LEE: "Lee." };
    booted = bootHedOffice({ env });
    const office = booted.office;
    const agentId = office.agents.resolveToken(TOKEN)!;

    // Simulate a redeploy with a rotated Railway Variable on the same store.
    const again = seedAgentsFromEnv(office, { ...env, HEDOFFICE_AGENT_TOKEN_LEE: TOKEN2 });
    expect(again[0]).toMatchObject({ name: "Lee.", created: false, agentId });
    expect(office.agents.resolveToken(TOKEN)).toBeUndefined(); // old secret dead
    expect(office.agents.resolveToken(TOKEN2)).toBe(agentId); // new secret live
    expect(office.agents.list()).toHaveLength(1); // no duplicate identity
  });

  it("rejects weak tokens loudly (fails the boot, which healthcheck gating catches)", () => {
    expect(() => bootHedOffice({ env: { HEDOFFICE_AGENT_TOKEN_LEE: "short" } })).toThrow(/too short/);
  });

  it("rejects an invalid stage variable", () => {
    expect(() =>
      bootHedOffice({
        env: { HEDOFFICE_AGENT_TOKEN_LEE: TOKEN, HEDOFFICE_AGENT_STAGE_LEE: "root" },
      }),
    ).toThrow(/invalid/);
  });

  it("never seeds the demo agent alongside env-provisioned agents", () => {
    booted = bootHedOffice({
      demoAgent: true,
      env: { HEDOFFICE_AGENT_TOKEN_LEE: TOKEN },
    });
    expect(booted.demoToken).toBeUndefined();
    expect(booted.office.agents.list().map((a) => a.name)).toEqual(["LEE"]);
  });
});
