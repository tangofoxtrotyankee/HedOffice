import type { CubicleDetailView, TaskStatus } from "@hedoffice/schema";
import type { PanelData } from "./sample-panels";
import { FEED_KINDS, type FeedKind, type TaskState } from "./panel";

/**
 * Maps a live `CubicleDetailView` (core's read model, fetched over the
 * `getDetail` API) onto the walk-in panel shapes. Pure, so it's unit-tested
 * like the other panel builders.
 */

const TASK_STATE: Record<TaskStatus, TaskState> = {
  done: "done",
  in_progress: "current",
  open: "open",
  blocked: "blocked",
};

/** Epoch ms → HH:MM:SS (UTC-agnostic local time, manual pad — no locale). */
export function feedTs(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function coerceKind(kind: string): FeedKind {
  return kind in FEED_KINDS ? (kind as FeedKind) : "read";
}

export function detailToPanelData(detail: CubicleDetailView): PanelData {
  const notebook = detail.notebook
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  return {
    notebook: notebook.length > 0 ? notebook : ["(notebook empty)"],
    tasks: detail.tasks.map((t) => ({ state: TASK_STATE[t.status], title: t.title })),
    feed: detail.recent.map((line) => ({
      ts: feedTs(line.ts),
      kind: coerceKind(line.kind),
      verb: line.kind,
      detail: line.detail,
    })),
    // Live approvals surface through the App-level ApprovalModal (SSE), not here.
  };
}
