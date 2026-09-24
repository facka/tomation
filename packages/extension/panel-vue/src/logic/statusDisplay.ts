import type { CapturedRequest } from '@/types/store';

/**
 * Placeholder shown in place of a numeric HTTP status code when a
 * Captured_Request has no response status — i.e. the response is still pending
 * or the request failed (Requirement 5.8).
 */
export const PENDING_STATUS_INDICATOR = '—';

/**
 * Resolve the display string for a Captured_Request's response status code.
 *
 * A numeric HTTP status (100..599) is rendered as its string form; a `null`
 * status (pending response or failed request) is rendered as a non-numeric
 * indicator conveying that state.
 *
 * @param status - the `CapturedRequest.status` value (`number | null`)
 * @returns the numeric status as a string, or the pending/failed indicator
 */
export function statusDisplay(status: CapturedRequest['status']): string {
  if (status === null) return PENDING_STATUS_INDICATOR;
  return String(status);
}
