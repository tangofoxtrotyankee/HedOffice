import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Boot-time plaintext-secret check (docs/SECURITY.md R5.3 / F7).
 *
 * HedOffice's contract is that secrets enter a deployment ONLY through the
 * environment (Railway Variables → HEDOFFICE_AGENT_TOKEN_*) or, locally, the OS
 * keychain via safeStorage. A plaintext secrets file sitting next to the app is
 * a config-drift footgun: it gets committed, backed up, or shipped in an image.
 * So if such a file exists in the working directory AND contains something that
 * looks like a key, we refuse to boot rather than run with it silently present.
 *
 * This is deliberately conservative — it flags the obvious plaintext stores
 * (.env, secrets.json) carrying secret-shaped keys, not every config file.
 */

/** Files that, if present with secret-shaped contents, block boot. */
const SUSPECT_FILES = [".env", "secrets.json", "hedoffice.secrets.json"] as const;

/** Key names that mark a value as a secret worth refusing to boot over. */
const SECRET_KEY = /(?:_TOKEN|_KEY|_SECRET|API[_-]?KEY|SECRET|PASSWORD)/i;

export class PlaintextSecretError extends Error {}

/**
 * Throw {@link PlaintextSecretError} if a plaintext secrets file with a
 * populated secret-shaped key is found under `dir`. Returns silently otherwise.
 */
export function assertNoPlaintextSecrets(dir: string = process.cwd()): void {
  for (const name of SUSPECT_FILES) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue; // unreadable — not our concern here
    }
    if (fileHoldsSecret(text)) {
      throw new PlaintextSecretError(
        `refusing to boot: ${name} appears to hold a plaintext secret. ` +
          `Provide secrets via environment variables (HEDOFFICE_AGENT_TOKEN_*) ` +
          `or the OS keychain — never a config file (docs/SECURITY.md R5.3).`,
      );
    }
  }
}

/** True if any non-comment line assigns a non-empty value to a secret-shaped key. */
function fileHoldsSecret(text: string): boolean {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("//")) continue;
    // dotenv "KEY=value" or JSON `"KEY": "value"` — both put the key before a
    // separator and a non-empty value after. Match the key, then check a value.
    const dotenv = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (dotenv && SECRET_KEY.test(dotenv[1]!) && stripQuotes(dotenv[2]!) !== "") return true;
    const jsonPair = /"([^"]+)"\s*:\s*"([^"]*)"/.exec(line);
    if (jsonPair && SECRET_KEY.test(jsonPair[1]!) && jsonPair[2] !== "") return true;
  }
  return false;
}

function stripQuotes(v: string): string {
  return v.trim().replace(/^["']|["']$/g, "").trim();
}
