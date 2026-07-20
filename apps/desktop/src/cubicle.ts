import type { PresenceStatus } from "@hedoffice/schema";
import { PRESENCE, PRESENCE_ORDER } from "./presence";

/**
 * Pure character-cell geometry for the floor (DESIGN.md §D). Every cubicle is a
 * box drawn from box-drawing characters on a fixed-width grid, so the layout
 * aligns perfectly in a monospace face. These builders are shared by the React
 * UI (which colors the glyphs) and the headless ASCII preview/tests.
 */

export interface CubicleData {
  name: string;
  status: PresenceStatus;
  /** One-line current-activity ticker. */
  activity: string;
  tasksDone: number;
  tasksTotal: number;
  /** An unprovisioned seat — rendered as a dashed empty box. */
  empty?: boolean;
  /** Live identity for detail fetches; absent on sample/empty cubicles. */
  agentId?: string;
}

export const CARD_WIDTH = 27;
const METER_N = 6;

/** Task progress meter in block shades, e.g. `▓▓▓▓░░`. */
export function taskMeter(done: number, total: number, n = METER_N): string {
  if (total <= 0) return "░".repeat(n);
  const filled = Math.max(0, Math.min(n, Math.round((done / total) * n)));
  return "▓".repeat(filled) + "░".repeat(n - filled);
}

/** Deterministic activity sparkline derived from the cubicle name. */
export function sparkline(seed: string, n = 9): string {
  const shades = "·░▒▓█";
  let out = "";
  for (let i = 0; i < n; i++) {
    const code = seed.charCodeAt(i % seed.length) + i * 7;
    out += shades[code % shades.length];
  }
  return out;
}

function boxLine(content: string, w = CARD_WIDTH): string {
  const inner = ` ${content}`;
  return `│${inner.padEnd(w - 2, " ").slice(0, w - 2)}│`;
}

function header(name: string, glyph: string, w = CARD_WIDTH): string {
  const left = `┌─ ${name} `;
  const tail = `${glyph}─┐`;
  const dashes = Math.max(0, w - left.length - tail.length);
  return left + "─".repeat(dashes) + tail;
}

function bottom(w = CARD_WIDTH): string {
  return `└${"─".repeat(w - 2)}┘`;
}

/** The six lines of an at-rest cubicle card (DESIGN.md §D.3). */
export function cubicleLines(c: CubicleData): string[] {
  if (c.empty) return emptySeatLines(c.name);
  const p = PRESENCE[c.status];
  return [
    header(c.name, p.glyph),
    boxLine(`${p.glyph} ${p.label}`),
    boxLine(`» ${c.activity}`),
    boxLine(`tasks  ${taskMeter(c.tasksDone, c.tasksTotal)} ${c.tasksDone}/${c.tasksTotal}`),
    boxLine(`${sparkline(c.name)} activity`),
    bottom(),
  ];
}

/** A dashed "empty seat" box for an unprovisioned cubicle. */
export function emptySeatLines(name: string, w = CARD_WIDTH): string[] {
  return [
    `┌┄ ${name} `.padEnd(w - 1, "┄") + "┐",
    `┆${` · offline / unstaffed`.padEnd(w - 2, " ").slice(0, w - 2)}┆`,
    `└${"┄".repeat(w - 2)}┘`,
  ];
}

/** Count summary like `◉ 1  ◐ 1  ○ 1  ▓ 1  · 1` for the floor header. */
export function statusSummary(cubicles: CubicleData[]): string {
  const counts = new Map<PresenceStatus, number>();
  for (const c of cubicles) {
    const s = c.empty ? "offline" : c.status;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return PRESENCE_ORDER.filter((s) => counts.get(s))
    .map((s) => `${PRESENCE[s].glyph} ${counts.get(s)}`)
    .join("  ");
}

/** Render the whole floor as plain text — the headless visual (grayscale) proof. */
export function floorText(cubicles: CubicleData[], perRow = 2, gap = "   "): string {
  const title = "HEDOFFICE ▸ FLOOR 1 · MISSION CONTROL";
  const out: string[] = [`${title}    ${statusSummary(cubicles)}`, ""];
  const cards = cubicles.map((c) => cubicleLines(c));
  for (let i = 0; i < cards.length; i += perRow) {
    const group = cards.slice(i, i + perRow);
    const height = Math.max(...group.map((c) => c.length));
    for (let r = 0; r < height; r++) {
      out.push(group.map((c) => c[r] ?? " ".repeat(CARD_WIDTH)).join(gap));
    }
    out.push("");
  }
  return out.join("\n");
}
