import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Locate the built office UI (apps/desktop's vite `dist/`) so the server can
 * serve it at `/`. Returns undefined when no build is present (headless
 * deploys, bare `apps/server` dev) — the caller keeps the JSON landing page
 * and logs a hint; missing UI is never a boot failure.
 */
export function resolveUiDist(override?: string): string | undefined {
  if (override) {
    return existsSync(join(override, "index.html")) ? override : undefined;
  }
  try {
    const pkg = createRequire(import.meta.url).resolve("@hedoffice/desktop/package.json");
    const dist = join(dirname(pkg), "dist");
    return existsSync(join(dist, "index.html")) ? dist : undefined;
  } catch {
    return undefined;
  }
}
