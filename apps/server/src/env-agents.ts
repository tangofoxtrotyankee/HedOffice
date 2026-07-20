import type { Office } from "@hedoffice/core";
import { PermissionStage } from "@hedoffice/schema";

/**
 * Environment-seeded agent provisioning — the only way secrets enter a cloud
 * deployment. Tokens are set as Railway Variables (or any env source) and read
 * at boot; the server never mints, returns, or logs an agent token, and there
 * is deliberately no HTTP route that does.
 *
 * Contract (KEY is your uppercase handle for the agent, e.g. LEE):
 *   HEDOFFICE_AGENT_TOKEN_<KEY>  (required) the bearer secret, ≥ 32 chars
 *   HEDOFFICE_AGENT_NAME_<KEY>   (optional) display name, defaults to "<KEY>"
 *   HEDOFFICE_AGENT_STAGE_<KEY>  (optional) observe|supervised|autonomous,
 *                                defaults to observe for new agents; when set,
 *                                it is (re)applied on every boot.
 *
 * Seeding is idempotent and keyed by name: an existing agent gets its token
 * hash updated to match the variable (rotation = change the variable and
 * redeploy); a missing agent is created. Weak tokens fail the boot loudly —
 * with healthcheck gating, a misconfigured deploy never receives traffic.
 */

const TOKEN_PREFIX = "HEDOFFICE_AGENT_TOKEN_";
const MIN_TOKEN_LENGTH = 32;

export interface SeededAgent {
  agentId: string;
  name: string;
  stage: PermissionStage;
  created: boolean;
}

export function seedAgentsFromEnv(
  office: Office,
  env: Record<string, string | undefined> = process.env,
): SeededAgent[] {
  const seeded: SeededAgent[] = [];
  for (const [key, token] of Object.entries(env)) {
    if (!key.startsWith(TOKEN_PREFIX) || !token) continue;
    const handle = key.slice(TOKEN_PREFIX.length);
    if (!handle) continue;

    if (token.length < MIN_TOKEN_LENGTH) {
      throw new Error(
        `${key} is too short (${token.length} chars; minimum ${MIN_TOKEN_LENGTH}). ` +
          `Generate one with: openssl rand -hex 32`,
      );
    }

    const name = env[`HEDOFFICE_AGENT_NAME_${handle}`] ?? handle;
    const stageRaw = env[`HEDOFFICE_AGENT_STAGE_${handle}`];
    const stageParsed = stageRaw === undefined ? undefined : PermissionStage.safeParse(stageRaw);
    if (stageParsed && !stageParsed.success) {
      throw new Error(
        `HEDOFFICE_AGENT_STAGE_${handle}="${stageRaw}" is invalid ` +
          `(allowed: ${PermissionStage.options.join(", ")})`,
      );
    }

    const existing = office.agents.findByName(name);
    if (existing) {
      office.agents.setToken(existing.agentId, token);
      if (stageParsed) office.agents.setStage(existing.agentId, stageParsed.data);
      seeded.push({
        agentId: existing.agentId,
        name,
        stage: office.agents.stageOf(existing.agentId) ?? existing.stage,
        created: false,
      });
    } else {
      const stage = stageParsed?.data ?? "observe";
      const { agentId } = office.agents.register(name, stage, { token });
      seeded.push({ agentId, name, stage, created: true });
    }
  }
  return seeded;
}
