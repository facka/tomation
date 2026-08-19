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
 * Produces natural sentences like: Click in [Submit], Type "admin" in [username input]
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

  const action = capitalize(step.action);
  const actionLower = step.action.toLowerCase();
  const targetLabel = step.target ? resolveTargetLabel(step.target, pageElements) : '';

  // Special handling for assert actions — produce natural sentences
  if (actionLower.startsWith('assert')) {
    const suffix = getAssertSuffix(actionLower);
    if (suffix !== null) {
      const parts: string[] = ['Assert that'];
      if (targetLabel) {
        parts.push('[' + targetLabel + ']');
      }
      parts.push(suffix);
      if (step.value) {
        parts.push('"' + step.value + '"');
      }
      return parts.join(' ');
    }
  }

  // Determine preposition
  let preposition = '';
  if (step.target) {
    if (actionLower === 'savetext' || actionLower === 'savevalue' || actionLower === 'saveattribute') {
      preposition = 'from';
    } else if (actionLower !== 'navigate' && actionLower !== 'wait' && actionLower !== 'manual'
      && actionLower !== 'assertexists' && actionLower !== 'assertnotexists' && actionLower !== 'assertgone') {
      preposition = 'in';
    }
  }

  // Determine value display
  let value = '';
  if (step.action === 'typePassword') {
    value = '****';
  } else if (step.value) {
    value = '"' + step.value + '"';
  } else if (step.action === 'navigate' && step.url) {
    value = step.url;
  } else if (step.action === 'wait' && step.ms !== undefined) {
    value = step.ms + 'ms';
  }

  // Build sentence: value before target for type/select actions
  const valueBeforeTarget = (actionLower === 'type' || actionLower === 'typepassword' || actionLower === 'select') && !!step.target;

  const parts: string[] = [action];
  if (valueBeforeTarget && value) {
    parts.push(value);
  }
  if (preposition && targetLabel) {
    parts.push(preposition);
    parts.push('[' + targetLabel + ']');
  } else if (targetLabel && actionLower !== 'navigate') {
    parts.push('[' + targetLabel + ']');
  }
  if (!valueBeforeTarget && value) {
    parts.push(value);
  }

  return parts.join(' ');
}

/**
 * Maps an assert action name (lowercase) to a human-readable suffix.
 * Returns null if the action is not a recognized assert.
 */
export function getAssertSuffix(actionLower: string): string | null {
  switch (actionLower) {
    case 'asserthastext': return 'has text';
    case 'assertcontainstext': return 'contains';
    case 'assertexists': return 'exists';
    case 'assertnotexists': return "doesn't exist";
    case 'assertgone': return 'is gone';
    case 'assertvisible': return 'is visible';
    default: return null;
  }
}
