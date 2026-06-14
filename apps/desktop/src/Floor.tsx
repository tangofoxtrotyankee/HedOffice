import type { ReactNode } from "react";
import { PRESENCE, PRESENCE_ORDER } from "./presence";
import { CubicleCard } from "./CubicleCard";
import type { CubicleData } from "./cubicle";

function CountSummary({ cubicles }: { cubicles: CubicleData[] }): ReactNode {
  const counts = new Map<string, number>();
  for (const c of cubicles) {
    const s = c.empty ? "offline" : c.status;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return (
    <span className="floor-counts">
      {PRESENCE_ORDER.filter((s) => counts.get(s)).map((s) => (
        <span key={s} className="count">
          <span style={{ color: `var(${PRESENCE[s].colorVar})` }}>{PRESENCE[s].glyph}</span>{" "}
          {counts.get(s)}
        </span>
      ))}
    </span>
  );
}

/** The office floor: a header + a grid of at-rest cubicle cards. */
export function Floor({
  cubicles,
  onSelect,
}: {
  cubicles: CubicleData[];
  onSelect?: (c: CubicleData) => void;
}): ReactNode {
  return (
    <section className="floor">
      <header className="floor-header">
        <span className="floor-title">HEDOFFICE ▸ FLOOR 1 · MISSION CONTROL</span>
        <CountSummary cubicles={cubicles} />
      </header>
      <div className="floor-grid">
        {cubicles.map((c) => (
          <CubicleCard key={c.name} cubicle={c} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
