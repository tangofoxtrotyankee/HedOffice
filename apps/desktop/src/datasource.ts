import type { CubicleView } from "@hedoffice/schema";
import type { CubicleData } from "./cubicle";
import { SAMPLE_FLOOR } from "./sample";

/**
 * The seam between the UI and its data. Today the renderer uses
 * `sampleDataSource`; the real desktop shell will run `@hedoffice/core`'s
 * `buildFloorView` in the main process and hand `CubicleView[]` to the renderer
 * over IPC, which `liveDataSource` maps to the UI shape. The UI itself never
 * imports core (native SQLite), only the pure view types from `@hedoffice/schema`.
 */
export interface DataSource {
  getFloor(): CubicleData[];
}

/** Map a core `CubicleView` (from the event log) to the UI's cubicle shape. */
export function cubicleViewToData(v: CubicleView): CubicleData {
  return {
    name: v.name,
    status: v.status,
    activity: v.activity || "idle",
    tasksDone: v.tasksDone,
    tasksTotal: v.tasksTotal,
    agentId: v.agentId,
  };
}

/** Static sample floor (current default until the shell wires live data). */
export const sampleDataSource: DataSource = {
  getFloor: () => SAMPLE_FLOOR,
};

/** A live source backed by core's `buildFloorView` output (used by the shell). */
export function liveDataSource(views: CubicleView[]): DataSource {
  return { getFloor: () => views.map(cubicleViewToData) };
}
