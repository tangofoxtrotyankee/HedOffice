/**
 * Headless proof for Stage 4: v1 cubicles enclosed in v2 room containers, with
 * a tee-joined wall board and a connector — demonstrating the design's claim
 * that v2 is additive (a v1 cubicle dropped into a v2 room needs zero changes).
 * Run: `pnpm --filter @hedoffice/desktop preview-rooms`.
 */
import { cubicleLines } from "./cubicle";
import { CONNECTORS, joinRow, wrapInRoom } from "./room";

const ledger = cubicleLines({ name: "ledger", status: "running", activity: "reconcile q2", tasksDone: 2, tasksTotal: 4 });
const audit = cubicleLines({ name: "audit", status: "thinking", activity: "review entries", tasksDone: 1, tasksTotal: 3 });
const sous = cubicleLines({ name: "sous", status: "idle", activity: "waiting", tasksDone: 0, tasksTotal: 0 });

console.log("\n— v2 department room (double-line) enclosing v1 cubicles + a wall board —\n");
for (const line of wrapInRoom("FINANCE", joinRow([ledger, audit]), { style: "double", board: "roadmap" })) {
  console.log(line);
}

console.log(`\n   ledger ${CONNECTORS.branch} audit     (agent-to-agent connector)\n`);

console.log("— v2 informal room (rounded) —\n");
for (const line of wrapInRoom("the kitchen", joinRow([sous]), { style: "rounded" })) {
  console.log(line);
}
console.log("");
