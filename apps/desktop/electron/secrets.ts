/**
 * Secret storage for BYO provider API keys (docs/SECURITY.md). Keys are accessed
 * only from the trusted main process and never written to config or the event
 * log. The interface is implemented by `ElectronSecretStore` (OS-keychain-backed
 * `safeStorage`) in production and `InMemorySecretStore` for headless dev/tests.
 */
export interface SecretStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
  keys(): string[];
}

/** Volatile store for tests / headless dev. Never persisted. */
export class InMemorySecretStore implements SecretStore {
  private readonly m = new Map<string, string>();
  get(key: string): string | null {
    return this.m.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.m.set(key, value);
  }
  delete(key: string): void {
    this.m.delete(key);
  }
  keys(): string[] {
    return [...this.m.keys()];
  }
}
