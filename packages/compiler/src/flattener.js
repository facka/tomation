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
        var tmpl = {};
        // If the template has a seed, include it as __seed
        if (decl.seed !== undefined) {
          tmpl.__seed = decl.seed;
        }
        var keys = Object.keys(decl.template);
        for (var k = 0; k < keys.length; k++) {
          tmpl[keys[k]] = decl.template[keys[k]];
        }
        allTemplates[decl.name] = tmpl;
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
 * Transform component-action invocation steps into their public, marker-bearing
 * form, recursively (including `if.then` branches).
 *
 * Component-action invocations are emitted by the parser (parser.js, extractStep)
 * as task-shaped steps carrying an INTERNAL marker:
 *   { action: 'task', name, __componentInvocation: true, componentName, instanceName, params? }
 *
 * Task 3.2 turns that internal marker into the PUBLIC data-model marker the
 * runtime/panel consume: the internal `__componentInvocation` and `instanceName`
 * fields are stripped and the step is annotated with `isComponent: true` and
 * `componentName`. `name` and `params` are preserved verbatim, so the existing
 * `{{data.*}}` template attachment (extractReferencedTemplateNames) keeps working
 * on the step's `params` exactly as for an ordinary task invocation.
 *
 * Purely additive and non-destructive: a step without `__componentInvocation` is
 * returned unchanged (same reference), so component-free input is a no-op and the
 * output is byte-identical to before. ES5 only.
 *
 * @param {Array} steps - step array (test/automation body)
 * @returns {Array} a new step array with component invocations marked; or the
 *                  same array reference when there was nothing to transform
 */
function markComponentSteps(steps) {
  if (!Array.isArray(steps)) return steps;

  var changed = false;
  var out = [];

  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    if (!step || typeof step !== 'object') {
      out.push(step);
      continue;
    }

    // Recurse into conditional branches first so nested component invocations
    // (inside an `if.then`) are marked too.
    var nestedThen = null;
    if (step.action === 'if' && Array.isArray(step.then)) {
      nestedThen = markComponentSteps(step.then);
    }

    if (step.__componentInvocation === true) {
      changed = true;
      // Rebuild the step, stripping the internal fields and adding the public
      // marker. Preserve field order: keep action/name first, then params, then
      // the marker fields.
      var marked = {};
      var keys = Object.keys(step);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (key === '__componentInvocation' || key === 'instanceName' || key === 'componentName') {
          continue;
        }
        marked[key] = step[key];
      }
      marked.isComponent = true;
      if (typeof step.componentName === 'string') {
        marked.componentName = step.componentName;
      }
      if (nestedThen !== null) {
        marked.then = nestedThen;
      }
      out.push(marked);
      continue;
    }

    // Non-component step: only clone if a nested branch changed.
    if (nestedThen !== null && nestedThen !== step.then) {
      changed = true;
      var copy = {};
      var ck = Object.keys(step);
      for (var ci = 0; ci < ck.length; ci++) {
        copy[ck[ci]] = step[ck[ci]];
      }
      copy.then = nestedThen;
      out.push(copy);
      continue;
    }

    out.push(step);
  }

  return changed ? out : steps;
}

/**
 * Emit a Component_Instance's internal locators into a flat pageElements map,
 * applying per-instance root scoping (task 3.1).
 *
 * For each instance, its component definition's internal locators are emitted as
 * page-element entries keyed PER INSTANCE so that multiple instances of the same
 * component never collide. The key scheme is:
 *
 *   Component__<componentName>__<instanceName>__<locatorVariableName>
 *
 * The `Component__` prefix keeps these keys in a namespace that cannot collide
 * with POM element keys (POM keys are `<FileNamespace>__<var>`, and a POM file
 * namespace is a PascalCase file name that never equals the literal `Component`
 * followed by another `__` segment pattern used here). Incorporating both the
 * component name AND the instance name guarantees N instances of one component
 * produce N independent entries.
 *
 * Scoping per locator (mutually exclusive):
 *   - `rootScoped: true` (opted in via `.childOf(el)`): emit a per-instance
 *     `scopeRoot` resolved to THIS instance's Root_Element (`instance.root`,
 *     the element reference produced by extractElementRef). Each instance gets
 *     its own independent `scopeRoot` — no cross-instance sharing. `scopeRoot`
 *     is emitted as its own field, distinct from `childOf`, so static same-file
 *     `childOf` emission is unaffected.
 *   - static `childOf: <name>`: emitted unchanged (preserve `childOf`).
 *   - document-scoped (neither flag): emitted unchanged with no `scopeRoot`.
 *
 * `scopeRoot` is emitted as the raw instance root element reference (a string key
 * such as `countryField` or `Form__countryField`, exactly the shape a test step
 * `target` carries before namespacing). Runtime `scopeRoot` resolution (task 6.2)
 * and any namespacing live outside the flattener's task-3 scope; here we emit the
 * raw shape, consistent with how test steps reference elements pre-namespacing.
 *
 * Purely additive: called only when component/instance data is present, so a
 * component-free project never enters this path and its output is byte-identical.
 * ES5 only.
 *
 * @param {object} pageElements - mutable target map to merge entries into
 * @param {Array}  componentFiles - array of ParsedFile objects carrying
 *                 `.components` (ComponentDef[]) and `.instances` (InstanceDef[])
 */
function emitComponentPageElements(pageElements, componentFiles) {
  if (!pageElements || !Array.isArray(componentFiles)) return;

  for (var fi = 0; fi < componentFiles.length; fi++) {
    var file = componentFiles[fi];
    if (!file || !Array.isArray(file.components) || !Array.isArray(file.instances)) {
      continue;
    }
    if (file.components.length === 0 || file.instances.length === 0) {
      continue;
    }

    // Build a component-name -> definition lookup for this file.
    var byName = {};
    for (var ci = 0; ci < file.components.length; ci++) {
      var comp = file.components[ci];
      if (comp && comp.name) {
        byName[comp.name] = comp;
      }
    }

    for (var ii = 0; ii < file.instances.length; ii++) {
      var instance = file.instances[ii];
      if (!instance || !instance.name || !instance.component) continue;

      var definition = byName[instance.component];
      if (!definition || !Array.isArray(definition.locators)) continue;

      for (var li = 0; li < definition.locators.length; li++) {
        var locator = definition.locators[li];
        if (!locator || !locator.variableName) continue;

        var key =
          'Component__' + instance.component + '__' + instance.name + '__' + locator.variableName;

        var entry = { tag: locator.tag };
        if (locator.label !== undefined) {
          entry.label = locator.label;
        }
        entry.where = locator.where || {};
        if (locator.xpath !== undefined) {
          entry.xpath = locator.xpath;
        }
        if (locator.navigate !== undefined) {
          entry.navigate = locator.navigate;
        }

        if (locator.rootScoped === true) {
          // Opted-in: per-instance scopeRoot resolved to THIS instance's root.
          // Keep it distinct from `childOf` (do not emit as childOf).
          entry.scopeRoot = instance.root;
        } else if (locator.childOf !== undefined) {
          // Static same-file childOf: emit unchanged.
          entry.childOf = locator.childOf;
        }
        // Document-scoped: neither branch — no scopeRoot, no childOf.

        pageElements[key] = entry;
      }
    }
  }
}

/**
 * Merge all POM results and test files into a flat spec-shaped object.
 *
 * @param {Array<object>} pomResults       - Array of PomResult from extractPom()
 * @param {Array<object>} parsedTestFiles  - Array of ParsedFile (type 'test') from parseFile()
 * @param {object}        [meta]           - Optional metadata; defaults to { name: "Untitled", url: "", description: "" }. Supports meta.urls as an array of URL strings.
 * @param {object}        [options]        - Optional options { cwd: string, componentFiles: Array }
 * @returns {object} Spec-shaped object
 */
function flattenSpec(pomResults, parsedTestFiles, meta, options) {
  var cwd = (options && options.cwd) || '';
  // Task 3.1: raw ParsedFiles for component (*.com.ts) files, carrying
  // `.components` / `.instances`. Optional and defaults to empty, so a
  // component-free project (and any caller that does not pass it) behaves
  // exactly as before. See the wiring note in bin/tomation.js — these are the
  // pom-type ParsedFiles whose component/instance data extractPom drops.
  var componentFiles = (options && Array.isArray(options.componentFiles)) ? options.componentFiles : [];
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

  // --- Task 3.1: emit component instances' internal locators ---
  // Additive: a no-op unless component/instance data is supplied. Each instance
  // contributes per-instance page-element entries, with a `scopeRoot` only on
  // locators that opted in via `.childOf(el)`.
  emitComponentPageElements(pageElements, componentFiles);

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

        // Task 3.2: convert any component-action invocation steps from their
        // internal (__componentInvocation) form into the public isComponent /
        // componentName marker. No-op (same reference) when there are none, so
        // component-free tests are unaffected. Done BEFORE data attachment so
        // extractReferencedTemplateNames still sees the (unchanged) params.
        if (Array.isArray(testOut.steps)) {
          testOut.steps = markComponentSteps(testOut.steps);
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

        // Task 3.2: mark component-action invocations in automation bodies, same
        // as for tests. No-op for component-free automations.
        if (Array.isArray(automationOut.steps)) {
          automationOut.steps = markComponentSteps(automationOut.steps);
        }

        // Attach data templates to the automation if it references them.
        // Mirror of the test branch: keyed by Data_Name so inline and shared
        // templates attach identically (also benefits imported shared data).
        if (hasAnyTemplates && automationOut.steps) {
          var autoReferencedNames = extractReferencedTemplateNames(automationOut.steps);
          var autoReferencedKeys = Object.keys(autoReferencedNames);

          if (autoReferencedKeys.length > 0) {
            var autoData = {};
            for (var ark = 0; ark < autoReferencedKeys.length; ark++) {
              var autoTmplName = autoReferencedKeys[ark];
              if (allDataTemplates[autoTmplName]) {
                autoData[autoTmplName] = allDataTemplates[autoTmplName];
              }
            }
            if (Object.keys(autoData).length > 0) {
              automationOut.data = autoData;
            }
          }
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

module.exports = {
  flattenSpec,
  collectDataTemplates,
  stepsReferenceData,
  extractReferencedTemplateNames,
  markComponentSteps,
  emitComponentPageElements,
};
