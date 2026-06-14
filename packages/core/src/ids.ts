import { createHash } from "node:crypto";

/** The stream id for an agent's cubicle. Events key off agentId; streams group them. */
export function cubicleOf(agentId: string): string {
  return `cubicle:${agentId}`;
}

/** Stable content hash used for notebook integrity in the event log. */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
