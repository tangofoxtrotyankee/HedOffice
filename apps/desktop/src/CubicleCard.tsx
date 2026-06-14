import type { ReactNode } from "react";
import { PRESENCE } from "./presence";
import { cubicleLines, type CubicleData } from "./cubicle";

/** Wrap each occurrence of `glyph` in `line` with a colored span. */
function colorizeGlyph(line: string, glyph: string, colorVar: string): ReactNode[] {
  const parts = line.split(glyph);
  const nodes: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i > 0) {
      nodes.push(
        <span key={`g${i}`} style={{ color: `var(${colorVar})` }}>
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
export function CubicleCard({ cubicle }: { cubicle: CubicleData }): ReactNode {
  const lines = cubicleLines(cubicle);
  const meta = cubicle.empty ? PRESENCE.offline : PRESENCE[cubicle.status];
  return (
    <pre className="cubicle" aria-label={`cubicle ${cubicle.name} ${meta.label}`}>
      {lines.map((line, i) => (
        <div className="cubicle-line" key={i}>
          {i <= 1 ? colorizeGlyph(line, meta.glyph, meta.colorVar) : line}
        </div>
      ))}
    </pre>
  );
}
