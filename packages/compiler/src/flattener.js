'use strict';

/**
 * flattener.js — merges POM results and parsed test files into a spec-shaped object.
 *
 * Accepts:
 *   - pomResults:       Array of PomResult objects (from pom.js / extractPom)
 *   - parsedTestFiles:  Array of ParsedFile objects of type 'test' (from parser.js / parseFile)
 *   - meta:             Optional metadata object; defaults to { name: "Untitled", url: "", description: "" }
 *
 * Returns a spec-shaped object ready for validation and emission:
 * {
 *   format: "tomation-spec",
 *   version: 1,
 *   meta: { name, url, description },
 *   pageElements: { [key]: { tag, label?, childOf?, where } },
 *   tasks:        { [key]: { steps, params? } },
 *   tests:        Array<{ name, steps }>
 * }
 *
 * Notes:
 *   - _meta is stripped from every pageElements / tasks entry (internal bookkeeping only)
 *   - line is stripped from every test definition before inclusion
 *   - All keys from all POM results are merged into a single flat map
 *   - All tests from all test files are collected into a single array
 *
 * Exported API:
 *   flattenSpec(pomResults, parsedTestFiles, meta) → SpecObject
 *
 * Requirements: 13.6
 */

var DEFAULT_META = { name: 'Untitled', url: '', description: '' };

/**
 * Merge all POM results and test files into a flat spec-shaped object.
 *
 * @param {Array<object>} pomResults       - Array of PomResult from extractPom()
 * @param {Array<object>} parsedTestFiles  - Array of ParsedFile (type 'test') from parseFile()
 * @param {object}        [meta]           - Optional metadata; defaults to { name: "Untitled", url: "", description: "" }
 * @returns {object} Spec-shaped object
 */
function flattenSpec(pomResults, parsedTestFiles, meta) {
  // Resolve meta: use provided value, falling back to defaults field-by-field
  var resolvedMeta = {
    name:        (meta && typeof meta.name        === 'string') ? meta.name        : DEFAULT_META.name,
    url:         (meta && typeof meta.url         === 'string') ? meta.url         : DEFAULT_META.url,
    description: (meta && typeof meta.description === 'string') ? meta.description : DEFAULT_META.description,
  };

  // --- Merge pageElements from all POM results ---
  var pageElements = {};
  if (Array.isArray(pomResults)) {
    for (var pi = 0; pi < pomResults.length; pi++) {
      var pomResult = pomResults[pi];
      if (!pomResult || typeof pomResult.pageElements !== 'object') continue;

      var elKeys = Object.keys(pomResult.pageElements);
      for (var ei = 0; ei < elKeys.length; ei++) {
        var elKey = elKeys[ei];
        var elEntry = pomResult.pageElements[elKey];
        if (!elEntry || typeof elEntry !== 'object') continue;

        // Strip _meta — it's internal bookkeeping, not spec data
        var elOut = {};
        var elFields = Object.keys(elEntry);
        for (var efi = 0; efi < elFields.length; efi++) {
          if (elFields[efi] !== '_meta') {
            elOut[elFields[efi]] = elEntry[elFields[efi]];
          }
        }
        pageElements[elKey] = elOut;
      }
    }
  }

  // --- Merge tasks from all POM results ---
  var tasks = {};
  if (Array.isArray(pomResults)) {
    for (var ti = 0; ti < pomResults.length; ti++) {
      var taskPomResult = pomResults[ti];
      if (!taskPomResult || typeof taskPomResult.tasks !== 'object') continue;

      var taskKeys = Object.keys(taskPomResult.tasks);
      for (var tki = 0; tki < taskKeys.length; tki++) {
        var taskKey = taskKeys[tki];
        var taskEntry = taskPomResult.tasks[taskKey];
        if (!taskEntry || typeof taskEntry !== 'object') continue;

        // Strip _meta
        var taskOut = {};
        var taskFields = Object.keys(taskEntry);
        for (var tfi = 0; tfi < taskFields.length; tfi++) {
          if (taskFields[tfi] !== '_meta') {
            taskOut[taskFields[tfi]] = taskEntry[taskFields[tfi]];
          }
        }
        tasks[taskKey] = taskOut;
      }
    }
  }

  // --- Collect all tests from all parsed test files ---
  var tests = [];
  if (Array.isArray(parsedTestFiles)) {
    for (var fi = 0; fi < parsedTestFiles.length; fi++) {
      var testFile = parsedTestFiles[fi];
      if (!testFile || !Array.isArray(testFile.tests)) continue;

      for (var tti = 0; tti < testFile.tests.length; tti++) {
        var testDef = testFile.tests[tti];
        if (!testDef || typeof testDef !== 'object') continue;

        // Strip line — it's internal bookkeeping, not spec data
        var testOut = {};
        var testFields = Object.keys(testDef);
        for (var tei = 0; tei < testFields.length; tei++) {
          if (testFields[tei] !== 'line') {
            testOut[testFields[tei]] = testDef[testFields[tei]];
          }
        }
        tests.push(testOut);
      }
    }
  }

  return {
    format: 'tomation-spec',
    version: 1,
    meta: resolvedMeta,
    pageElements: pageElements,
    tasks: tasks,
    tests: tests,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { flattenSpec };
