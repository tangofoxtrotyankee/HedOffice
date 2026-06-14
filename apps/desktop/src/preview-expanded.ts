/**
 * Headless proof for Stage 2: print the terminal feed and the approval-gate box
 * as text. The approval box reading clearly in monochrome is the Stage-2
 * benchmark. Run: `pnpm --filter @hedoffice/desktop preview-walkin`.
 */
import { approvalBox, formatFeedLine, talkMeter } from "./panel";
import { panelsFor } from "./sample-panels";

const qa = panelsFor("qa");

console.log("\n┏━ qa ━ ▓ blocked ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓");
console.log("\nTERMINAL · tool-call feed");
for (const line of panelsFor("research").feed) console.log("  " + formatFeedLine(line));
console.log("  ▌");

console.log("\nTALK");
console.log("  ⦿ hold to talk   " + talkMeter(0.45) + "  listening…");

console.log("\nAPPROVAL GATE (blocked cubicle):\n");
for (const l of approvalBox(qa.pendingApproval ?? "—")) console.log("  " + l);
console.log("");
