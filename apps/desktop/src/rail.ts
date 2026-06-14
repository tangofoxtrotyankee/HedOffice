import type { PresenceStatus } from "@hedoffice/schema";
import { PRESENCE } from "./presence";
import type { CubicleData } from "./cubicle";

export interface DepartmentRow {
  /** 1-based number key (mirrors ROAM's numbered department list). */
  n: number;
  name: string;
  glyph: string;
  colorVar: string;
}

export const ALL_DEPARTMENTS = "ALL";

/** Numbered department rows for the left rail: `1 ▸ ALL`, `2 research ◉`, … */
export function departmentRows(cubicles: CubicleData[]): DepartmentRow[] {
  const rows: DepartmentRow[] = [
    { n: 1, name: ALL_DEPARTMENTS, glyph: "▸", colorVar: "--accent-hero" },
  ];
  cubicles.forEach((c, i) => {
    const meta = c.empty ? PRESENCE.offline : PRESENCE[c.status];
    rows.push({ n: i + 2, name: c.name, glyph: meta.glyph, colorVar: meta.colorVar });
  });
  return rows;
}

/**
 * Slow status motion per state (DESIGN.md §E/§G) — kept calm (≥1.5–2s cycles),
 * event-driven, and fully neutralized by `prefers-reduced-motion`. `idle`/
 * `offline` are deliberately static.
 */
export const PRESENCE_MOTION: Record<PresenceStatus, string> = {
  running: "glyph-pulse",
  thinking: "glyph-spin",
  blocked: "glyph-attention",
  idle: "",
  offline: "",
};
