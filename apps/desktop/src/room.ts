import { CARD_WIDTH } from "./cubicle";

/**
 * v2 scaffolding (DESIGN.md §H) — **additive container styles only**. The
 * box-hierarchy grammar already encodes the building > room > desk hierarchy via
 * border weight, so v2 rooms enclose v1 cubicles with zero token or cubicle
 * changes: double-line `╔═╗` = department room, rounded `╭─╮` = informal room,
 * tee characters join a wall board into the room wall, and connector glyphs draw
 * agent-to-agent links.
 */

export type RoomStyle = "double" | "rounded";

const STYLE: Record<RoomStyle, {
  tl: string; tr: string; bl: string; br: string;
  h: string; v: string; teeL: string; teeR: string;
}> = {
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║", teeL: "╠", teeR: "╣" },
  rounded: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│", teeL: "├", teeR: "┤" },
};

/** Agent-to-agent connector glyphs (v2). */
export const CONNECTORS = { branch: "├─▶", cross: "╪" } as const;

const len = (s: string): number => [...s].length;

/** Lay several cubicle cards (each an array of lines) side by side in one row. */
export function joinRow(cards: string[][], gap = "   "): string[] {
  const height = Math.max(...cards.map((c) => c.length));
  const rows: string[] = [];
  for (let r = 0; r < height; r++) {
    rows.push(cards.map((c) => c[r] ?? " ".repeat(CARD_WIDTH)).join(gap));
  }
  return rows;
}

/**
 * Wrap already-rendered body lines (e.g. a row of v1 cubicles) in a v2 room
 * frame, optionally hanging a tee-joined wall board on the top wall.
 */
export function wrapInRoom(
  title: string,
  body: string[],
  opts: { style?: RoomStyle; board?: string } = {},
): string[] {
  const s = STYLE[opts.style ?? "double"];
  const maxW = Math.max(
    len(title) + 4,
    opts.board ? len(opts.board) + 11 : 0,
    ...body.map(len),
  );
  const innerW = maxW + 2;
  const fill = (prefix: string, suffix: string): string =>
    prefix + s.h.repeat(Math.max(0, innerW - len(prefix) - len(suffix))) + suffix;

  const out: string[] = [s.tl + fill(`${s.h} ${title} `, "") + s.tr];
  if (opts.board) out.push(s.teeL + fill(`${s.h} board: ${opts.board} `, "") + s.teeR);
  for (const line of body) out.push(`${s.v} ${line.padEnd(maxW, " ")} ${s.v}`);
  out.push(s.bl + s.h.repeat(innerW) + s.br);
  return out;
}
