/**
 * Display formatting for date-helper test-data descriptors.
 *
 * A date-helper value in a Data() template compiles to a descriptor object of
 * the form `{ type: 'dateHelper', kind, ... }` (see the compiler's
 * `extractDateHelperCall`). When such a descriptor reaches the Test Data panel
 * it must be rendered as the readable source expression that produced it —
 * e.g. `nextWeek('MM/DD/YYYY')` — rather than exploded into its internal
 * `type`/`kind`/`offset`/`format` properties.
 */

/** Shape of a compiled date-helper descriptor (kept loose; fields are optional). */
export interface DateHelperDescriptor {
  type: 'dateHelper';
  kind?: 'dayOffset' | 'monthBoundary';
  offset?: number;
  boundary?: 'first' | 'last';
  monthOffset?: number;
  format?: string;
}

/**
 * Reverse of the compiler's DAY_OFFSET_HELPERS map: a day offset back to the
 * named helper that produces it. Offsets with no named helper fall back to the
 * generic `dateHelper.dayOffset(...)` form.
 */
const OFFSET_TO_HELPER_NAME: Record<number, string> = {
  0: 'today',
  1: 'tomorrow',
  '-1': 'yesterday',
  7: 'nextWeek',
  '-7': 'lastWeek',
  30: 'nextMonth',
  '-30': 'lastMonth',
};

/** Reverse of the compiler's MONTH_BOUNDARY_HELPERS map: boundary -> helper name. */
const BOUNDARY_TO_HELPER_NAME: Record<string, string> = {
  first: 'firstDateOfMonth',
  last: 'lastDateOfMonth',
};

/**
 * Type guard: is the given value a compiled date-helper descriptor?
 */
export function isDateHelperDescriptor(value: unknown): value is DateHelperDescriptor {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === 'dateHelper'
  );
}

/** Render a format argument as a quoted literal, or empty string when absent. */
function formatArg(format: string | undefined): string {
  return typeof format === 'string' && format.length > 0 ? `'${format}'` : '';
}

/**
 * Format a date-helper descriptor as its readable source expression.
 *
 * - `dayOffset` with a named offset    -> `nextWeek('MM/DD/YYYY')`
 * - `dayOffset` with an unnamed offset -> `dateHelper.dayOffset(7, 'MM/DD/YYYY')`
 * - `monthBoundary`                    -> `firstDateOfMonth(0, 'MM/DD/YYYY')`
 *
 * The format argument is omitted when the descriptor has no `format`.
 */
export function formatDateHelper(descriptor: DateHelperDescriptor): string {
  const fmt = formatArg(descriptor.format);

  if (descriptor.kind === 'dayOffset') {
    const offset = descriptor.offset ?? 0;
    const name = OFFSET_TO_HELPER_NAME[offset];
    if (name) {
      return `${name}(${fmt})`;
    }
    const args = [String(offset), fmt].filter((a) => a.length > 0).join(', ');
    return `dateHelper.dayOffset(${args})`;
  }

  if (descriptor.kind === 'monthBoundary') {
    const name = BOUNDARY_TO_HELPER_NAME[descriptor.boundary ?? ''];
    const monthOffset = descriptor.monthOffset ?? 0;
    const args = [String(monthOffset), fmt].filter((a) => a.length > 0).join(', ');
    if (name) {
      return `${name}(${args})`;
    }
    return `dateHelper.monthBoundary(${args})`;
  }

  return 'dateHelper(...)';
}
