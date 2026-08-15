'use strict';

var path = require('path');

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
 *   tests:        Array<{ name, steps }>,
 *   automations:  Array<{ name, params: [{name, type, optional?, options?}], steps }>
 * }
 *
 * Notes:
 *   - _meta is stripped from every pageElements / tasks entry (internal bookkeeping only)
 *   - line is stripped from every test definition before inclusion
 *   - line and name (variable name) are stripped from every automation; label becomes the output name
 *   - All keys from all POM results are merged into a single flat map
 *   - All tests from all test files are collected into a single array
 *   - All automations from all parsed files are collected into a single array
 *
 * Exported API:
 *   flattenSpec(pomResults, parsedTestFiles, meta) → SpecObject
 *
 * Requirements: 13.6
 */

var path = require('path');

var DEFAULT_META = { name: 'Untitled', url: '', description: '' };

/**
 * Compute a display-friendly relative source path from an absolute file path.
 * Makes path relative to cwd, strips leading 'tests/' or 'automations/' segments,
 * and removes file extensions (.test.ts, .automation.ts, etc.)
 *
 * @param {string} filePath - Absolute source file path
 * @param {string} [cwd] - Project root directory
 * @returns {string} Relative display path (e.g., "login" or "auth/login")
 */
function computeSourcePath(filePath, cwd) {
  if (!filePath) return '';
  var rel = cwd ? path.relative(cwd, filePath) : filePath;
  // Normalize to forward slashes
  rel = rel.replace(/\\/g, '/');
  // Strip leading 'tests/', 'automations/', or 'pom/' prefix
  rel = rel.replace(/^(tests|automations|pom)\//, '');
  // Remove file extensions (.test.ts, .automation.ts, .pom.ts, .ts, .js, .tsx)
  rel = rel.replace(/\.(test|automation|pom)\.(ts|js|tsx)$/, '').replace(/\.(ts|js|tsx)$/, '');
  return rel;
}

/**
 * Collect all Data template declarations from parsed files into a single map.
 * Templates from all files (test files, data files) are merged by template name.
 *
 * @param {Array<object>} parsedFiles - Array of ParsedFile objects
 * @returns {object} Map of templateName → template structure
 */
function collectDataTemplates(parsedFiles) {
  var allTemplates = {};
  if (!Array.isArray(parsedFiles)) return allTemplates;

  for (var i = 0; i < parsedFiles.length; i++) {
    var file = parsedFiles[i];
    if (!file || !Array.isArray(file.dataTemplates)) continue;

    for (var j = 0; j < file.dataTemplates.length; j++) {
      var decl = file.dataTemplates[j];
      if (decl && decl.name && decl.template) {
        allTemplates[decl.name] = decl.template;
      }
    }
  }

  return allTemplates;
}

/**
 * Check if a test's steps contain {{data.*}} token references.
 * Walks steps recursively (including if.then branches).
 *
 * @param {Array} steps - Test step array
 * @returns {boolean} true if at least one step references a data token
 */
function stepsReferenceData(steps) {
  if (!Array.isArray(steps)) return false;

  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    if (!step || typeof step !== 'object') continue;

    // Check value field for {{data.*}} tokens
    if (typeof step.value === 'string' && /\{\{data\.[^}]+\}\}/.test(step.value)) {
      return true;
    }

    // Check params object values
    if (step.params && typeof step.params === 'object') {
      var paramKeys = Object.keys(step.params);
      for (var pk = 0; pk < paramKeys.length; pk++) {
        var paramVal = step.params[paramKeys[pk]];
        if (typeof paramVal === 'string' && /\{\{data\.[^}]+\}\}/.test(paramVal)) {
          return true;
        }
      }
    }

    // Recurse into conditional branches
    if (step.action === 'if' && Array.isArray(step.then)) {
      if (stepsReferenceData(step.then)) return true;
    }
  }

  return false;
}

/**
 * Extract the set of template names referenced by {{data.X.Y}} tokens in steps.
 *
 * @param {Array} steps - Test step array
 * @returns {object} Set of template names (keys)
 */
function extractReferencedTemplateNames(steps) {
  var names = {};
  if (!Array.isArray(steps)) return names;

  var regex = /\{\{data\.([^.}]+)\.[^}]+\}\}/g;

  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    if (!step || typeof step !== 'object') continue;

    if (typeof step.value === 'string') {
      var match;
      while ((match = regex.exec(step.value)) !== null) {
        names[match[1]] = true;
      }
      regex.lastIndex = 0;
    }

    if (step.params && typeof step.params === 'object') {
      var paramKeys = Object.keys(step.params);
      for (var pk = 0; pk < paramKeys.length; pk++) {
        var paramVal = step.params[paramKeys[pk]];
        if (typeof paramVal === 'string') {
          while ((match = regex.exec(paramVal)) !== null) {
            names[match[1]] = true;
          }
          regex.lastIndex = 0;
        }
      }
    }

    if (step.action === 'if' && Array.isArray(step.then)) {
      var nestedNames = extractReferencedTemplateNames(step.then);
      var nestedKeys = Object.keys(nestedNames);
      for (var nk = 0; nk < nestedKeys.length; nk++) {
        names[nestedKeys[nk]] = true;
      }
    }
  }

  return names;
}

/**
 * Merge all POM results and test files into a flat spec-shaped object.
 *
 * @param {Array<object>} pomResults       - Array of PomResult from extractPom()
 * @param {Array<object>} parsedTestFiles  - Array of ParsedFile (type 'test') from parseFile()
 * @param {object}        [meta]           - Optional metadata; defaults to { name: "Untitled", url: "", description: "" }. Supports meta.urls as an array of URL strings.
 * @param {object}        [options]        - Optional options { cwd: string }
 * @returns {object} Spec-shaped object
 */
function flattenSpec(pomResults, parsedTestFiles, meta, options) {
  var cwd = (options && options.cwd) || '';
  // Resolve meta: use provided value, falling back to defaults field-by-field
  var resolvedMeta = {
    name:        (meta && typeof meta.name        === 'string') ? meta.name        : DEFAULT_META.name,
    url:         (meta && typeof meta.url         === 'string') ? meta.url         : DEFAULT_META.url,
    description: (meta && typeof meta.description === 'string') ? meta.description : DEFAULT_META.description,
  };

  // Include urls array when provided
  if (meta && Array.isArray(meta.urls)) {
    resolvedMeta.urls = meta.urls;
  }

  // Include testFiles base URL when provided (for file upload support)
  if (meta && typeof meta.testFiles === 'string') {
    resolvedMeta.testFiles = meta.testFiles;
  }

  // Stamp compiler version from package.json
  try {
    var compilerPkg = require(path.join(__dirname, '..', 'package.json'));
    resolvedMeta.compilerVersion = compilerPkg.version;
  } catch (e) {
    // Silently skip if package.json is unavailable
  }

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

  // Collect all data templates from all parsed files (test files + data files)
  var allDataTemplates = collectDataTemplates(parsedTestFiles);
  var hasAnyTemplates = Object.keys(allDataTemplates).length > 0;

  if (Array.isArray(parsedTestFiles)) {
    for (var fi = 0; fi < parsedTestFiles.length; fi++) {
      var testFile = parsedTestFiles[fi];
      if (!testFile || !Array.isArray(testFile.tests)) continue;

      // Collect data templates local to this file
      var fileTemplates = {};
      if (testFile.dataTemplates && testFile.dataTemplates.length > 0) {
        for (var dti = 0; dti < testFile.dataTemplates.length; dti++) {
          var decl = testFile.dataTemplates[dti];
          if (decl && decl.name && decl.template) {
            fileTemplates[decl.name] = decl.template;
          }
        }
      }

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
        // Include source file path for display labeling (path/filename: testName)
        if (testFile.filePath) {
          testOut.sourceFile = computeSourcePath(testFile.filePath, cwd);
        }

        // Attach data templates to the test if it references them
        if (hasAnyTemplates && testOut.steps) {
          var referencedNames = extractReferencedTemplateNames(testOut.steps);
          var referencedKeys = Object.keys(referencedNames);

          if (referencedKeys.length > 0) {
            // Include only referenced templates
            var testData = {};
            for (var rk = 0; rk < referencedKeys.length; rk++) {
              var tmplName = referencedKeys[rk];
              if (allDataTemplates[tmplName]) {
                testData[tmplName] = allDataTemplates[tmplName];
              }
            }
            if (Object.keys(testData).length > 0) {
              testOut.data = testData;
            }
          } else if (Object.keys(fileTemplates).length > 0) {
            // If no explicit {{data.*}} references but the file declares templates,
            // include all file-local templates (supports tests that use templates
            // via other mechanisms)
            testOut.data = fileTemplates;
          }
        }

        tests.push(testOut);
      }
    }
  }

  // --- Collect all automations from all parsed test files ---
  var automations = [];
  if (Array.isArray(parsedTestFiles)) {
    for (var ai = 0; ai < parsedTestFiles.length; ai++) {
      var automationFile = parsedTestFiles[ai];
      if (!automationFile || !Array.isArray(automationFile.automations)) continue;

      for (var ati = 0; ati < automationFile.automations.length; ati++) {
        var automationDef = automationFile.automations[ati];
        if (!automationDef || typeof automationDef !== 'object') continue;

        // Build output entry: { name: label, params: [...], steps: [...] }
        // Strip internal fields: line
        // Use name (which includes namespace prefix if set), falling back to label
        var automationOut = {
          name: automationDef.name || automationDef.label,
          params: [],
          steps: automationDef.steps || [],
        };
        // Include source file path for display labeling (path/filename: automationName)
        if (automationFile.filePath) {
          automationOut.sourceFile = computeSourcePath(automationFile.filePath, cwd);
        }

        // Preserve param declaration order, include relevant fields only
        if (Array.isArray(automationDef.params)) {
          for (var api = 0; api < automationDef.params.length; api++) {
            var paramDef = automationDef.params[api];
            var paramOut = { name: paramDef.name, type: paramDef.type };
            if (paramDef.optional) {
              paramOut.optional = true;
            }
            if (paramDef.defaultValue !== undefined) {
              paramOut.defaultValue = paramDef.defaultValue;
            }
            if (Array.isArray(paramDef.options)) {
              paramOut.options = paramDef.options;
            }
            automationOut.params.push(paramOut);
          }
        }

        automations.push(automationOut);
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
    automations: automations,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { flattenSpec, collectDataTemplates, stepsReferenceData, extractReferencedTemplateNames };
