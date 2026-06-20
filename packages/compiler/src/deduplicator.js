'use strict';

/**
 * deduplicator.js — detect conflicting keys across POM files.
 *
 * Accepts an array of PomResult objects (produced by pom.js extractPom) and
 * checks whether any namespaced element key or task key is defined in more
 * than one source POM file. On the first conflict found, processing stops and
 * an error is returned.
 *
 * Exported API:
 *   deduplicateKeys(pomResults) → DeduplicateResult
 *
 * DeduplicateResult shape:
 *   { ok: true }
 *   { ok: false, error: string }
 *
 * Requirements: 13.7
 */

/**
 * Detect duplicate namespaced keys across multiple PomResult objects.
 *
 * A duplicate is defined as the same key (in pageElements OR tasks) appearing
 * in two or more distinct source POM files (identified by `_meta.filePath`).
 *
 * On the first conflict found, returns:
 *   { ok: false, error: "Duplicate element key 'X' defined in file1 and file2" }
 *
 * If no duplicates are found, returns:
 *   { ok: true }
 *
 * @param {Array<object>} pomResults - Array of PomResult objects from extractPom()
 * @returns {{ ok: boolean, error?: string }}
 */
function deduplicateKeys(pomResults) {
  if (!Array.isArray(pomResults)) {
    return { ok: true };
  }

  // Track which file first defined each element key: { [namespacedKey]: filePath }
  var seenElements = {};
  // Track which file first defined each task key: { [namespacedKey]: filePath }
  var seenTasks = {};

  for (var i = 0; i < pomResults.length; i++) {
    var pomResult = pomResults[i];
    if (!pomResult || typeof pomResult !== 'object') continue;

    var pageElements = pomResult.pageElements || {};
    var tasks = pomResult.tasks || {};

    // --- check pageElements keys ---
    var elementKeys = Object.keys(pageElements);
    for (var ei = 0; ei < elementKeys.length; ei++) {
      var elKey = elementKeys[ei];
      var elMeta = pageElements[elKey]._meta || {};
      var elFile = elMeta.filePath || pomResult.filePath || '(unknown)';

      if (elKey in seenElements) {
        var prevFile = seenElements[elKey];
        if (prevFile !== elFile) {
          return {
            ok: false,
            error: "Duplicate element key '" + elKey + "' defined in " + prevFile + " and " + elFile,
          };
        }
      } else {
        seenElements[elKey] = elFile;
      }
    }

    // --- check task keys ---
    var taskKeys = Object.keys(tasks);
    for (var ti = 0; ti < taskKeys.length; ti++) {
      var taskKey = taskKeys[ti];
      var taskMeta = tasks[taskKey]._meta || {};
      var taskFile = taskMeta.filePath || pomResult.filePath || '(unknown)';

      if (taskKey in seenTasks) {
        var prevTaskFile = seenTasks[taskKey];
        if (prevTaskFile !== taskFile) {
          return {
            ok: false,
            error: "Duplicate element key '" + taskKey + "' defined in " + prevTaskFile + " and " + taskFile,
          };
        }
      } else {
        seenTasks[taskKey] = taskFile;
      }
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { deduplicateKeys };
