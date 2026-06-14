import type { ReactNode } from "react";
import { departmentRows } from "./rail";
import type { CubicleData } from "./cubicle";

/**
 * The left department rail: a numbered vertical list; the selected department
 * gets a heavy left tick and accent text (DESIGN.md §D.6). v1 departments map
 * 1:1 to cubicles; selecting one filters the floor.
 */
export function DepartmentRail({
  cubicles,
  selected,
  onSelect,
}: {
  cubicles: CubicleData[];
  selected: string;
  onSelect: (name: string) => void;
}): ReactNode {
  const rows = departmentRows(cubicles);
  return (
    <nav className="rail" aria-label="departments">
      <div className="rail-head">DEPARTMENTS</div>
      {rows.map((r) => {
        const active = r.name === selected;
        return (
          <button
            key={r.name}
            className={`rail-row${active ? " rail-row-active" : ""}`}
            onClick={() => onSelect(r.name)}
            aria-current={active}
          >
            <span className="rail-tick">{active ? "┃" : " "}</span>
            <span className="rail-n">{r.n}</span>
            <span className="rail-name">{r.name}</span>
            <span className="rail-glyph" style={{ color: `var(${r.colorVar})` }}>
              {r.glyph}
            </span>
          </button>
        );
      })}
      <button className="rail-row rail-add" onClick={() => onSelect("ALL")}>
        <span className="rail-tick"> </span>
        <span className="rail-n">+</span>
        <span className="rail-name">add dept</span>
      </button>
    </nav>
  );
}
