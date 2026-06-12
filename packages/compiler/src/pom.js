'use strict';

/**
 * pom.js — POM extraction and PageName__key namespacing.
 *
 * Transforms the raw ParsedFile output from parser.js into a flat, namespaced
 * map of elements and tasks ready for deduplication and merging.
 *
 * Exported API:
 *   extractPom(parsedFile) → PomResult
 *
 * PomResult shape:
 * {
 *   filePath: string,
 *   pageElements: {
 *     [namespacedKey: string]: {
 *       tag: string,
 *       label?: string,
 *       childOf?: string,
 *       where: object,
 *       _meta: { filePath: string, line: number }
 *     }
 *   },
 *   tasks: {
 *     [namespacedKey: string]: {
 *       steps: Step[],
 *       params?: string[],
 *       _meta: { filePath: string, line: number }
 *     }
 *   },
 *   errors: Array<{ message: string, filePath: string, line: number }>
 * }
 *
 * Requirements: 13.2, 13.3
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an empty PomResult for a given file path.
 * @param {string} filePath
 * @returns {PomResult}
 */
function emptyResult(filePath) {
  return {
    filePath,
    pageElements: {},
    tasks: {},
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// Main extractPom function
// ---------------------------------------------------------------------------

/**
 * Extract a flat, namespaced POM from a ParsedFile produced by parseFile().
 *
 * For each PageDef in parsedFile.pages:
 *   - Element local key `k`  → `PageName__k`  in pageElements
 *   - Task local key `k`     → `PageName__k`  in tasks
 *
 * The `line` property on each element/task is moved into `_meta` (together
 * with `filePath`) so consumers can report precise file+line errors without
 * that metadata polluting the spec data.
 *
 * Early-exit cases (both return an empty result):
 *   - parsedFile.error is non-null → error is added to errors[]
 *   - parsedFile.type !== 'pom' or parsedFile.pages.length === 0 → silent empty result
 *
 * @param {object} parsedFile - ParsedFile returned by parseFile()
 * @returns {object} PomResult
 */
function extractPom(parsedFile) {
  const result = emptyResult(parsedFile.filePath);

  // If the parser encountered a fatal error, surface it and bail out.
  if (parsedFile.error) {
    result.errors.push({
      message: parsedFile.error.message,
      filePath: parsedFile.filePath,
      line: parsedFile.error.line,
    });
    return result;
  }

  // Non-POM files (e.g. test files) and POM files with no pages are valid —
  // they simply produce no output.
  if (parsedFile.type !== 'pom' || parsedFile.pages.length === 0) {
    return result;
  }

  for (const page of parsedFile.pages) {
    const prefix = page.name + '__';

    // ---- elements ----------------------------------------------------------
    for (const [localKey, elDef] of Object.entries(page.elements)) {
      const namespacedKey = prefix + localKey;

      // Destructure `line` out so it doesn't appear in the spec data entry.
      const { line, ...elData } = elDef;

      result.pageElements[namespacedKey] = {
        ...elData,
        _meta: {
          filePath: parsedFile.filePath,
          line: line !== undefined ? line : page.line,
        },
      };
    }

    // ---- tasks -------------------------------------------------------------
    for (const [localKey, taskDef] of Object.entries(page.tasks)) {
      const namespacedKey = prefix + localKey;

      const { line, ...taskData } = taskDef;

      result.tasks[namespacedKey] = {
        ...taskData,
        _meta: {
          filePath: parsedFile.filePath,
          line: line !== undefined ? line : page.line,
        },
      };
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { extractPom };
