/**
 * Cursor Cloud agent job status — no env/fetch; safe to import from domain + data layers.
 */

/** Terminal states we treat as done for auto-deploy and Kanban. */
export function isCursorAgentFinished(status: string | null | undefined): boolean {
  if (!status) return false;
  const u = status.toUpperCase();
  return u === "FINISHED" || u === "FAILED" || u === "ERROR" || u === "STOPPED";
}

export function isCursorAgentSucceeded(status: string | null | undefined): boolean {
  if (!status) return false;
  return status.toUpperCase() === "FINISHED";
}
