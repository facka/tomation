import type { Step, PageElement } from '@/types/spec';

/**
 * Capitalize the first letter of a string.
 */
function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Resolve a namespaced element key to its human-readable label.
 * Falls back to a formatted version of the key itself if no label is found.
 *
 * Example: "Home/Login__submitButton" → "Home > Login.submitButton"
 */
export function resolveTargetLabel(
  target: string | undefined,
  pageElements?: Record<string, PageElement>,
): string {
  if (!target) return '';
  if (pageElements && pageElements[target] && pageElements[target].label) {
    return pageElements[target].label!;
  }
  // Fallback: convert namespace key to readable form
  let displayTarget = target.replace('__', '.');
  displayTarget = displayTarget.replace(/\//g, ' > ');
  return displayTarget;
}

/**
 * Build a human-readable label for a step (plain text, used for log entries).
 * Resolves element targets to their labels from pageElements.
 */
export function buildStepLabel(
  step: Step,
  pageElements?: Record<string, PageElement>,
): string {
  // Task steps get a special label
  if (step.action === 'task' && step.name) {
    const taskLabel = step.name.replace('__', '.');
    return 'Task ' + taskLabel;
  }

  const parts: string[] = [capitalize(step.action)];

  if (step.target) {
    const displayName = resolveTargetLabel(step.target, pageElements);
    parts.push(displayName);
  }

  if (step.value) {
    parts.push('"' + step.value + '"');
  }

  return parts.join(' ');
}
