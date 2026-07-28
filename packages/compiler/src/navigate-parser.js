'use strict';

/**
 * navigate-parser.js — Parse and serialize navigate path strings.
 *
 * Token grammar:
 *   NavigatePath  = Step ("," Step)*
 *   Step          = "parent" | "firstChild" | "lastChild" | "nextSibling" | "prevSibling"
 *                 | "child[" Integer "]"
 *                 | "sibling[" Integer "]"
 *   Integer       = [1-9][0-9]* (range 1–9999)
 *
 * Exported API:
 *   parseNavigatePath(path)       → { ok: true, steps: [] } | { ok: false, error: string }
 *   serializeNavigatePath(steps)  → string
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1, 5.2, 5.3, 5.4, 5.5
 */

/**
 * Set of simple (no-index) navigation step tokens.
 */
var SIMPLE_STEPS = {
  parent: true,
  firstChild: true,
  lastChild: true,
  nextSibling: true,
  prevSibling: true
};

/**
 * Set of indexed navigation step tokens (require [n] suffix).
 */
var INDEXED_STEPS = {
  child: true,
  sibling: true
};

/**
 * Parse a navigate path string into an array of step objects.
 *
 * @param {string} path - The comma-separated navigate path string
 * @returns {{ ok: true, steps: Array<{step: string, index?: number}> } | { ok: false, error: string }}
 */
function parseNavigatePath(path) {
  if (typeof path !== 'string' || path.length === 0) {
    return { ok: false, error: 'path is empty' };
  }

  var segments = path.split(',');
  var steps = [];

  for (var i = 0; i < segments.length; i++) {
    var raw = segments[i].trim();

    if (raw === '') {
      continue;
    }

    var position = i + 1;

    // Check for indexed step pattern: child[n] or sibling[n]
    var bracketOpen = raw.indexOf('[');
    if (bracketOpen !== -1) {
      var stepName = raw.substring(0, bracketOpen);

      if (!INDEXED_STEPS[stepName]) {
        return { ok: false, error: 'unrecognized token "' + raw + '" at position ' + position };
      }

      // Must end with ']'
      if (raw.charAt(raw.length - 1) !== ']') {
        return { ok: false, error: 'unrecognized token "' + raw + '" at position ' + position };
      }

      var indexStr = raw.substring(bracketOpen + 1, raw.length - 1);

      if (indexStr === '') {
        return { ok: false, error: 'index is required for "' + stepName + '[' + ']" at position ' + position };
      }

      // Check if index is a valid integer
      if (!/^-?\d+$/.test(indexStr)) {
        return { ok: false, error: 'index must be an integer for "' + raw + '" at position ' + position };
      }

      var indexVal = parseInt(indexStr, 10);

      if (indexVal < 1) {
        return { ok: false, error: 'index must be >= 1 for "' + raw + '" at position ' + position };
      }

      if (indexVal > 9999) {
        return { ok: false, error: 'index must be <= 9999 for "' + raw + '" at position ' + position };
      }

      steps.push({ step: stepName, index: indexVal });
    } else if (SIMPLE_STEPS[raw]) {
      steps.push({ step: raw });
    } else {
      return { ok: false, error: 'unrecognized token "' + raw + '" at position ' + position };
    }
  }

  if (steps.length === 0) {
    return { ok: false, error: 'contains no valid steps' };
  }

  return { ok: true, steps: steps };
}

/**
 * Serialize a steps array back to a comma-separated navigate path string.
 *
 * @param {Array<{step: string, index?: number}>} steps - The steps to serialize
 * @returns {string} The comma-separated path string
 */
function serializeNavigatePath(steps) {
  var tokens = [];

  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    if (s.index !== undefined) {
      tokens.push(s.step + '[' + s.index + ']');
    } else {
      tokens.push(s.step);
    }
  }

  return tokens.join(',');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  parseNavigatePath: parseNavigatePath,
  serializeNavigatePath: serializeNavigatePath
};
