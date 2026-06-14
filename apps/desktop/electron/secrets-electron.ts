import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { safeStorage } from "electron";
import type { SecretStore } from "./secrets";

/**
 * OS-keychain-backed secret store using Electron's `safeStorage` (preferred over
 * the archived `keytar`). Secrets are encrypted at rest with the OS keychain and
 * persisted as base64 in a single JSON file under the app's userData dir. Only
 * the main process constructs this.
 */
export class ElectronSecretStore implements SecretStore {
  private cache: Record<string, string>;

  constructor(private readonly file: string) {
    this.cache = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, string>)
      : {};
  }

  private persist(): void {
    writeFileSync(this.file, JSON.stringify(this.cache), { mode: 0o600 });
  }

  get(key: string): string | null {
    const enc = this.cache[key];
    if (enc === undefined) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(enc, "base64"));
  }

  set(key: string, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("OS encryption unavailable; refusing to store secret in plaintext");
    }
    this.cache[key] = safeStorage.encryptString(value).toString("base64");
    this.persist();
  }

  delete(key: string): void {
    delete this.cache[key];
    this.persist();
  }

  keys(): string[] {
    return Object.keys(this.cache);
  }
}
