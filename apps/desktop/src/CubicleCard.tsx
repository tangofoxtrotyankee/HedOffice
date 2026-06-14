import type { ReactNode } from "react";
import { PRESENCE } from "./presence";
import { PRESENCE_MOTION } from "./rail";
import { cubicleLines, type CubicleData } from "./cubicle";

/** Wrap each occurrence of `glyph` in `line` with a colored, optionally animated span. */
function colorizeGlyph(line: string, glyph: string, colorVar: string, motion = ""): ReactNode[] {
  const parts = line.split(glyph);
  const nodes: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i > 0) {
      nodes.push(
        <span key={`g${i}`} className={`glyph ${motion}`} style={{ color: `var(${colorVar})` }}>
          {glyph}
        </span>,
      );
    }
    nodes.push(part);
  });
  return nodes;
}

/**
 * An at-rest cubicle card: a box-drawing box whose presence glyph is colored by
 * the semantic status token. The text stays in the default foreground — color is
 * the accent, not the structure (DESIGN.md principle), so the card still reads in
 * grayscale.
 */
export function CubicleCard({
  cubicle,
  onSelect,
}: {
  cubicle: CubicleData;
  onSelect?: (c: CubicleData) => void;
}): ReactNode {
  const lines = cubicleLines(cubicle);
  const meta = cubicle.empty ? PRESENCE.offline : PRESENCE[cubicle.status];
  const motion = cubicle.empty ? "" : PRESENCE_MOTION[cubicle.status];
  const interactive = !cubicle.empty && onSelect;
  return (
    <pre
      className={`cubicle${interactive ? " cubicle-interactive" : ""}`}
      aria-label={`cubicle ${cubicle.name} ${meta.label}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onSelect(cubicle) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(cubicle);
              }
            }
          : undefined
      }
    >
      {lines.map((line, i) => (
        <div className="cubicle-line" key={i}>
          {i <= 1 ? colorizeGlyph(line, meta.glyph, meta.colorVar, motion) : line}
        </div>
      ))}
    </pre>
  );
}
