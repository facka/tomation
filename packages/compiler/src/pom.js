'use strict';

const path = require('path');

/**
 * pom.js — POM extraction and PageName__key namespacing.
 *
 * Transforms the raw ParsedFile output from parser.js into a flat, namespaced
 * map of elements and tasks ready for deduplication and merging.
 *
 * Exported API:
 *   extractPom(parsedFile) → PomResult
 *   deriveNamespace(filePath) → string
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
 * Requirements: 8.1, 8.2, 8.3, 13.2, 13.3
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
// deriveNamespace — file-path-based PascalCase namespace derivation
// Requirements: 8.1, 8.2, 8.3
// ---------------------------------------------------------------------------

/**
 * Convert a kebab-case string to PascalCase.
 * Each hyphen-separated segment gets its first letter capitalized.
 * @param {string} str
 * @returns {string}
 */
function kebabToPascal(str) {
  return str
    .split('-')
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

/**
 * Derive a PascalCase namespace from a file path.
 *
 * 1. Extracts the basename from the path.
 * 2. Strips known suffixes: .pom.ts, .pom.js, .page.ts, .page.js,
 *    then falls back to stripping .ts, .tsx, .js.
 * 3. Throws if the stripped name contains underscores (with kebab-case suggestion).
 * 4. Converts kebab-case to PascalCase.
 *
 * @param {string} filePath - Absolute or relative path to the source file.
 * @returns {string} PascalCase namespace.
 * @throws {Error} If the file name contains underscores.
 */
function deriveNamespace(filePath) {
  const basename = path.basename(filePath);

  // Strip known compound suffixes first, then simple extensions.
  const stripped = basename
    .replace(/\.(pom|page)\.(ts|tsx|js)$/, '')
    .replace(/\.(ts|tsx|js)$/, '');

  if (stripped.includes('_')) {
    throw new Error(
      `File name '${basename}' contains underscores. Use kebab-case (e.g., ${stripped.replace(/_/g, '-')}.ts)`
    );
  }

  return kebabToPascal(stripped);
}

// ---------------------------------------------------------------------------
// extractPomV2 — v2 POM extraction (file-name-based namespace)
// Requirements: 8.1, 8.4, 4.2, 4.3
// ---------------------------------------------------------------------------

/**
 * Extract a flat, namespaced POM from a v2 ParsedFile produced by parseSource().
 *
 * V2 files use file-name-based namespacing (no `Page('Name')` wrappers).
 * Elements are in parsedFile.elements[] and tasks in parsedFile.tasks[].
 *
 * The function:
 *   - Derives the namespace from the file name using deriveNamespace()
 *   - Namespaces element keys as `<Namespace>__<variableName>`
 *   - Namespaces task keys as `<Namespace>__<taskName>`
 *   - Resolves `childOf` variable references to namespaced keys
 *
 * @param {object} parsedFile - ParsedFile returned by parseSource() with v2 elements/tasks
 * @returns {object} PomResult (same shape as extractPom output)
 */

/**
 * Resolve element references in task/test steps.
 * For each step with a `target` field:
 *   - If it's a bare variable name in variableToKey, replace with the namespaced key
 *   - If it already contains `__` (cross-file reference like "Login__submitButton"), leave as-is
 *   - Otherwise, prefix with the current namespace (same-file element not yet in the map)
 *
 * Also handles nested steps in `if` conditions (recursive).
 *
 * @param {Array} steps - array of step objects from the parser
 * @param {object} variableToKey - map of variableName → namespaced key
 * @param {string} prefix - current namespace prefix (e.g., "Login__")
 * @returns {Array} steps with resolved target references
 */
function resolveStepRefs(steps, variableToKey, prefix) {
  return steps.map(function (step) {
    const resolved = Object.assign({}, step);

    // Resolve target references
    if (resolved.target) {
      if (variableToKey[resolved.target]) {
        // Bare variable name from same file → namespaced key
        resolved.target = variableToKey[resolved.target];
      } else if (!resolved.target.includes('__')) {
        // Bare name not in map — still prefix it (might be forward-declared)
        resolved.target = prefix + resolved.target;
      }
      // If already contains __ (cross-file ref), leave as-is
    }

    // Recursively resolve if-step then branches
    if (resolved.action === 'if' && resolved.then) {
      resolved.then = resolveStepRefs(resolved.then, variableToKey, prefix);
    }

    return resolved;
  });
}

function extractPomV2(parsedFile) {
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

  // Non-POM files or files with no v2 elements/tasks produce an empty result.
  const hasV2Elements = parsedFile.elements && parsedFile.elements.length > 0;
  const hasV2Tasks = parsedFile.tasks && parsedFile.tasks.length > 0;
  if (!hasV2Elements && !hasV2Tasks) {
    return result;
  }

  // Derive namespace from file name
  let namespace;
  try {
    namespace = deriveNamespace(parsedFile.filePath);
  } catch (err) {
    result.errors.push({
      message: err.message,
      filePath: parsedFile.filePath,
      line: 0,
    });
    return result;
  }

  // Store namespace on the result for collision detection by callers
  result.namespace = namespace;

  const prefix = namespace + '__';

  // Build a map of variableName → namespaced key for childOf resolution
  const variableToKey = {};

  // ---- elements ------------------------------------------------------------
  if (parsedFile.elements) {
    for (const elDef of parsedFile.elements) {
      const namespacedKey = prefix + elDef.variableName;
      variableToKey[elDef.variableName] = namespacedKey;

      const entry = {
        tag: elDef.tag,
        label: elDef.label,
        where: elDef.where || {},
        _meta: {
          filePath: parsedFile.filePath,
          line: elDef.line,
        },
      };

      if (elDef.xpath) {
        entry.xpath = elDef.xpath;
      }

      result.pageElements[namespacedKey] = entry;
    }

    // Second pass: resolve childOf references to namespaced keys
    for (const elDef of parsedFile.elements) {
      if (elDef.childOf) {
        const namespacedKey = prefix + elDef.variableName;
        const parentKey = variableToKey[elDef.childOf];
        if (parentKey) {
          result.pageElements[namespacedKey].childOf = parentKey;
        } else {
          result.errors.push({
            message: `Element '${elDef.variableName}' at ${parsedFile.filePath}:${elDef.line} references unknown parent '${elDef.childOf}'`,
            filePath: parsedFile.filePath,
            line: elDef.line,
          });
        }
      }
    }
  }

  // ---- tasks ---------------------------------------------------------------
  if (parsedFile.tasks) {
    for (const taskDef of parsedFile.tasks) {
      const namespacedKey = prefix + taskDef.name;

      // Resolve element references in task steps:
      // Bare variable names (e.g., "usernameInput") → namespaced keys ("Login__usernameInput")
      const resolvedSteps = resolveStepRefs(taskDef.steps || [], variableToKey, prefix);

      result.tasks[namespacedKey] = {
        steps: resolvedSteps,
        params: taskDef.params || [],
        _meta: {
          filePath: parsedFile.filePath,
          line: taskDef.line,
        },
      };
    }
  }

  return result;
}

/**
 * Detect namespace collisions across multiple PomResult objects.
 *
 * When two POM files produce the same namespace, this function returns an
 * error identifying both files (Requirement 8.4).
 *
 * @param {object[]} pomResults - Array of PomResult objects from extractPomV2()
 * @returns {Array<{ message: string, filePath: string, line: number }>} collision errors
 */
function detectNamespaceCollisions(pomResults) {
  const errors = [];
  const seen = {}; // namespace → filePath

  for (const pomResult of pomResults) {
    if (!pomResult.namespace) continue;

    if (seen[pomResult.namespace]) {
      errors.push({
        message: `Namespace collision: '${pomResult.namespace}' is produced by both '${seen[pomResult.namespace]}' and '${pomResult.filePath}'`,
        filePath: pomResult.filePath,
        line: 0,
      });
    } else {
      seen[pomResult.namespace] = pomResult.filePath;
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { extractPom, extractPomV2, deriveNamespace, detectNamespaceCollisions };
