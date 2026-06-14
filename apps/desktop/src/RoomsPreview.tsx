import type { ReactNode } from "react";
import { Room } from "./Room";
import { CubicleCard } from "./CubicleCard";
import { CONNECTORS } from "./room";
import type { CubicleData } from "./cubicle";

const FINANCE: CubicleData[] = [
  { name: "ledger", status: "running", activity: "reconcile q2", tasksDone: 2, tasksTotal: 4 },
  { name: "audit", status: "thinking", activity: "review entries", tasksDone: 1, tasksTotal: 3 },
];
const KITCHEN: CubicleData[] = [
  { name: "sous", status: "idle", activity: "waiting", tasksDone: 0, tasksTotal: 0 },
];

/**
 * v2 preview: the same unmodified `CubicleCard` from v1, now composed inside v2
 * room containers — the Stage-4 gate (a v1 cubicle dropped into a v2 room needs
 * zero token changes).
 */
export function RoomsPreview({ onSelect }: { onSelect?: (c: CubicleData) => void }): ReactNode {
  return (
    <div className="rooms">
      <div className="rooms-note">v2 scaffolding — v1 cubicles, unchanged, inside v2 rooms</div>
      <Room title="FINANCE" style="double" board="roadmap">
        {FINANCE.map((c, i) => (
          <span key={c.name} className="room-cell">
            <CubicleCard cubicle={c} onSelect={onSelect} />
            {i < FINANCE.length - 1 && <span className="connector">{CONNECTORS.branch}</span>}
          </span>
        ))}
      </Room>
      <Room title="the kitchen" style="rounded">
        {KITCHEN.map((c) => (
          <CubicleCard key={c.name} cubicle={c} onSelect={onSelect} />
        ))}
      </Room>
    </div>
  );
}
