import type { PresenceStatus } from "@hedoffice/schema";

/** Glyph + label + theme color token for each presence state (DESIGN.md §E). */
export interface PresenceMeta {
  glyph: string;
  label: string;
  /** CSS custom property holding the semantic color. */
  colorVar: string;
}

export const PRESENCE: Record<PresenceStatus, PresenceMeta> = {
  running: { glyph: "◉", label: "running", colorVar: "--status-running" },
  thinking: { glyph: "◐", label: "thinking", colorVar: "--status-thinking" },
  idle: { glyph: "○", label: "idle", colorVar: "--status-idle" },
  blocked: { glyph: "▓", label: "blocked", colorVar: "--status-blocked" },
  offline: { glyph: "·", label: "offline", colorVar: "--status-offline" },
};

/** Order used for the floor header count summary. */
export const PRESENCE_ORDER: PresenceStatus[] = [
  "running",
  "thinking",
  "idle",
  "blocked",
  "offline",
];
