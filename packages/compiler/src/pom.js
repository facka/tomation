'use strict';

const path = require('path');

/**
 * pom.js — POM extraction and namespace-based key namespacing.
 *
 * Transforms the raw ParsedFile output from parser.js into a flat, namespaced
 * map of elements and tasks ready for deduplication and merging.
 *
 * Exported API:
 *   extractPom(parsedFile, options) → PomResult
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
 * Requirements: 8.1, 8.2, 8.3, 8.4, 4.2, 4.3
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
 * Includes subdirectory segments relative to pomDir in the namespace, separated by '>'.
 *
 * Examples:
 *   deriveNamespace('/project/pom/login.pom.ts', '/project/pom') → 'Login'
 *   deriveNamespace('/project/pom/home/login.pom.ts', '/project/pom') → 'Home/Login'
 *   deriveNamespace('/project/pom/settings/account/profile.pom.ts', '/project/pom') → 'Settings/Account/Profile'
 *
 * The '/' separator prevents collisions between path+filename and flat filenames
 * (e.g., pom/home/login.pom.ts → 'Home/Login' vs pom/home-login.pom.ts → 'HomeLogin').
 * The UI displays this as '>' for readability.
 *
 * @param {string} filePath - Absolute or relative path to the source file.
 * @param {string} [pomDir] - Absolute path to the POM root directory (for folder prefix derivation).
 * @returns {string} PascalCase namespace with '>' separating folder segments.
 * @throws {Error} If the file name or folder names contain underscores.
 */
function deriveNamespace(filePath, pomDir) {
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

  // Compute relative folder path from pomDir and include in namespace
  var folderParts = [];
  if (pomDir) {
    var relativePath = path.relative(pomDir, path.dirname(filePath));
    if (relativePath && relativePath !== '.' && !relativePath.startsWith('..')) {
      var segments = relativePath.split(path.sep).filter(function(s) { return s.length > 0; });
      for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        if (seg.includes('_')) {
          throw new Error(
            `Folder name '${seg}' contains underscores. Use kebab-case (e.g., ${seg.replace(/_/g, '-')})`
          );
        }
        folderParts.push(kebabToPascal(seg));
      }
    }
  }

  var fileNamespace = kebabToPascal(stripped);

  if (folderParts.length > 0) {
    return folderParts.join('/') + '/' + fileNamespace;
  }
  return fileNamespace;
}

// ---------------------------------------------------------------------------
// extractPom — POM extraction (file-name-based namespace)
// Requirements: 8.1, 8.4, 4.2, 4.3
// ---------------------------------------------------------------------------

/**
 * Extract a flat, namespaced POM from a ParsedFile produced by parseSource().
 *
 * Files use file-name-based namespacing.
 * Elements are in parsedFile.elements[] and tasks in parsedFile.tasks[].
 *
 * The function:
 *   - Derives the namespace from the file name using deriveNamespace()
 *   - Namespaces element keys as `<Namespace>__<variableName>`
 *   - Namespaces task keys as `<Namespace>__<taskName>`
 *   - Resolves `childOf` variable references to namespaced keys
 *
 * @param {object} parsedFile - ParsedFile returned by parseSource() with elements/tasks
 * @param {object} [options] - Optional settings
 * @param {string} [options.pomDir] - Absolute path to the POM root directory
 * @returns {object} PomResult
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

function extractPom(parsedFile, options) {
  const result = emptyResult(parsedFile.filePath);
  const pomDir = (options && options.pomDir) || null;

  // If the parser encountered a fatal error, surface it and bail out.
  if (parsedFile.error) {
    result.errors.push({
      message: parsedFile.error.message,
      filePath: parsedFile.filePath,
      line: parsedFile.error.line,
    });
    return result;
  }

  // Non-POM files or files with no elements/tasks produce an empty result.
  const hasElements = parsedFile.elements && parsedFile.elements.length > 0;
  const hasTasks = parsedFile.tasks && parsedFile.tasks.length > 0;
  if (!hasElements && !hasTasks) {
    return result;
  }

  // Derive namespace from file name (and folder path if pomDir is provided)
  let namespace;
  try {
    namespace = deriveNamespace(parsedFile.filePath, pomDir);
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

      var taskEntry = {
        steps: resolvedSteps,
        params: taskDef.params || [],
        _meta: {
          filePath: parsedFile.filePath,
          line: taskDef.line,
        },
      };
      if (taskDef.label) {
        taskEntry.label = taskDef.label;
      }
      result.tasks[namespacedKey] = taskEntry;
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
 * @param {object[]} pomResults - Array of PomResult objects from extractPom()
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

module.exports = { extractPom, deriveNamespace, detectNamespaceCollisions };
