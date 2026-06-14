import type { FeedLine, TaskState } from "./panel";

export interface PanelData {
  notebook: string[];
  tasks: Array<{ state: TaskState; title: string }>;
  feed: FeedLine[];
  /** A pending approval action (shown for blocked cubicles), if any. */
  pendingApproval?: string;
}

const RESEARCH: PanelData = {
  notebook: [
    "• repo uses JWT in /auth/*",
    "• prefers ripgrep over grep",
    "TODO: confirm refresh-token TTL",
  ],
  tasks: [
    { state: "done", title: "map auth endpoints" },
    { state: "current", title: "grep repo for auth" },
    { state: "open", title: "summarize findings" },
    { state: "open", title: "open PR with notes" },
  ],
  feed: [
    { ts: "12:04:21", kind: "run", verb: "run", detail: 'rg "jwt" -n src/', result: "14 matches" },
    { ts: "12:04:22", kind: "read", verb: "read", detail: "src/auth/verify.ts:1-48" },
    { ts: "12:04:25", kind: "think", verb: "think", detail: "verify uses HS256; check secret source" },
    { ts: "12:04:27", kind: "run", verb: "run", detail: 'rg "process.env" -n src/auth/', result: "3 matches" },
    { ts: "12:04:29", kind: "warn", verb: "warn", detail: "secret read from env at runtime" },
  ],
};

const QA: PanelData = {
  notebook: ["• test suite is flaky on CI", "TODO: pin node version"],
  tasks: [
    { state: "done", title: "run unit tests" },
    { state: "current", title: "clean build artifacts" },
  ],
  feed: [
    { ts: "12:06:10", kind: "run", verb: "run", detail: "pnpm test", result: "passed" },
    { ts: "12:06:14", kind: "error", verb: "error", detail: "stale dist blocks rebuild" },
  ],
  pendingApproval: "rm -rf ./build",
};

/** Panel content for the "walked-into" cubicle (keyed by name, with a default). */
export function panelsFor(name: string): PanelData {
  if (name === "qa") return QA;
  return RESEARCH;
}
