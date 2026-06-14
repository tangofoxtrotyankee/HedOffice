import type { CubicleData } from "./cubicle";

/** Sample floor mirroring the DESIGN.md §D.4 mockup (until live data is wired). */
export const SAMPLE_FLOOR: CubicleData[] = [
  { name: "research", status: "running", activity: "grep repo for auth", tasksDone: 4, tasksTotal: 6 },
  { name: "writer", status: "thinking", activity: "drafting section 3", tasksDone: 1, tasksTotal: 5 },
  { name: "ops", status: "idle", activity: "waiting for task", tasksDone: 0, tasksTotal: 0 },
  { name: "qa", status: "blocked", activity: "needs approval: rm", tasksDone: 5, tasksTotal: 6 },
  { name: "finance", status: "offline", activity: "", tasksDone: 0, tasksTotal: 0, empty: true },
];
