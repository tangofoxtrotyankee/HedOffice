import type { ApprovalRequestDTO } from "./shell/ipc-contract";

/**
 * Pure helpers for the App-level approval queue. Multiple supervised agents
 * can block concurrently (and the server replays every pending approval to a
 * reconnecting browser), so requests queue in arrival order — the modal shows
 * the head — instead of overwriting a single slot.
 */

/** Append a request, ignoring duplicates (SSE replay re-sends pending ones). */
export function enqueue(
  queue: readonly ApprovalRequestDTO[],
  req: ApprovalRequestDTO,
): ApprovalRequestDTO[] {
  if (queue.some((q) => q.approvalId === req.approvalId)) return [...queue];
  return [...queue, req];
}

/** Drop a request once it is resolved (locally, by another operator, or by
 *  the server's timeout auto-deny). */
export function remove(
  queue: readonly ApprovalRequestDTO[],
  approvalId: string,
): ApprovalRequestDTO[] {
  return queue.filter((q) => q.approvalId !== approvalId);
}
