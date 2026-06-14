/**
 * Pure builders for the expanded-cubicle panels (DESIGN.md §D.5, §F). Kept
 * separate from the React components so the formatting — including the
 * safety-critical approval box — is unit-tested and renders identically in the
 * headless text preview (the Stage-2 "unmistakable in monochrome" benchmark).
 */

/** Terminal feed verb kinds → glyph + semantic color token (DESIGN.md §F). */
export const FEED_KINDS = {
  run: { glyph: "◉", colorVar: "--status-running" },
  think: { glyph: "◐", colorVar: "--status-thinking" },
  read: { glyph: "○", colorVar: "--status-idle" },
  warn: { glyph: "!", colorVar: "--feedback-warn" },
  error: { glyph: "✗", colorVar: "--feedback-error" },
} as const;

export type FeedKind = keyof typeof FEED_KINDS;

export interface FeedLine {
  /** HH:MM:SS */
  ts: string;
  kind: FeedKind;
  verb: string;
  detail: string;
  result?: string;
}

/** `12:04:21  ◉ run  rg "jwt" -n src/  → 14 matches` */
export function formatFeedLine(l: FeedLine): string {
  const head = `${l.ts}  ${FEED_KINDS[l.kind].glyph} ${l.verb}`;
  const body = l.result ? `${l.detail}  → ${l.result}` : l.detail;
  return `${head}  ${body}`;
}

export type TaskState = "done" | "current" | "open";

/** Task row glyphs: ✓ done, ◉ current, ○ open. */
export function taskGlyph(state: TaskState): string {
  return { done: "✓", current: "◉", open: "○" }[state];
}

/** Voice input/output level meter in block cells, e.g. `▣▣▣▢▢▢▢`. */
export function talkMeter(level: number, n = 7): string {
  const filled = Math.max(0, Math.min(n, Math.round(level * n)));
  return "▣".repeat(filled) + "▢".repeat(n - filled);
}

/**
 * The approval-gate prompt as a rounded box (DESIGN.md §F) — the single most
 * safety-critical component. Shows the requested action verbatim and two
 * glyph-coded choices. Built as text so it is provably legible in monochrome.
 */
export function approvalBox(action: string, w = 48): string[] {
  const inner = w - 2;
  const pad = (s: string) => "│" + ` ${s}`.padEnd(inner, " ").slice(0, inner) + "│";
  return [
    "╭" + "─".repeat(inner) + "╮",
    pad("⚠  APPROVAL REQUIRED"),
    pad(""),
    pad("the agent wants to:"),
    pad(`  ${action}`),
    pad(""),
    pad("[ ✓ Approve ]   [ ✗ Deny ]"),
    "╰" + "─".repeat(inner) + "╯",
  ];
}
