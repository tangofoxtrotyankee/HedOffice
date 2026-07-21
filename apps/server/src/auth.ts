import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for bearer tokens (docs/SECURITY.md F9).
 * A plain `a !== b` short-circuits on the first differing byte, leaking token
 * length/prefix through timing. `timingSafeEqual` requires equal-length buffers,
 * so we length-check first (length is not the secret) and compare in constant
 * time only when the lengths match.
 */
export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
