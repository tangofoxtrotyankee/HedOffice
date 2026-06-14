/**
 * Headless visual proof for Phase 4 Stage 1: print the floor as plain text.
 * Because it's monochrome ASCII, this also demonstrates the §Stage-1 benchmark —
 * the floor reads clearly in grayscale (status is glyph-distinct, not color).
 * Run: `pnpm --filter @hedoffice/desktop preview-floor`.
 */
import { floorText } from "./cubicle";
import { SAMPLE_FLOOR } from "./sample";

console.log("\n" + floorText(SAMPLE_FLOOR) + "\n");
