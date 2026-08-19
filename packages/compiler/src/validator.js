'use strict';

/**
 * Known valid step action strings.
 * Used for documentation and future validation of step actions.
 */
var KNOWN_ACTIONS = {
  click: true,
  type: true,
  typePassword: true,
  navigate: true,
  wait: true,
  waitGone: true,
  assert: true,
  assertText: true,
  assertValue: true,
  assertVisible: true,
  assertNotVisible: true,
  select: true,
  hover: true,
  clear: true,
  task: true,
  'if': true,
  saveText: true,
  saveAttribute: true,
  saveValue: true,
  saveExpression: true
};

/**
 * validateSpec(obj)
 *
 * Validates a parsed spec object against the tomation-spec format.
 *
 * Returns { ok: true, spec: obj } on success.
 * Returns { ok: false, error: "..." } on failure.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.6a, 1.7, 1.8
 */
function validateSpec(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'Unsupported spec format or version' };
  }

  // Requirement 1.1 — format and version checks
  if (obj.format !== 'tomation-spec' || obj.version !== 1) {
    return { ok: false, error: 'Unsupported spec format or version' };
  }

  // Requirement 1.2 — required top-level fields
  var requiredFields = ['format', 'version', 'pageElements', 'tasks', 'tests'];
  for (var i = 0; i < requiredFields.length; i++) {
    var field = requiredFields[i];
    if (!(field in obj)) {
      return { ok: false, error: 'Missing field: ' + field };
    }
  }

  var pageElements = obj.pageElements;
  var tasks = obj.tasks;
  var tests = obj.tests;

  // pageElements must be a plain object
  if (pageElements === null || typeof pageElements !== 'object' || Array.isArray(pageElements)) {
    return { ok: false, error: 'Missing field: pageElements' };
  }

  // tasks must be a plain object
  if (tasks === null || typeof tasks !== 'object' || Array.isArray(tasks)) {
    return { ok: false, error: 'Missing field: tasks' };
  }

  // tests must be an array
  if (!Array.isArray(tests)) {
    return { ok: false, error: 'Missing field: tests' };
  }

  // Requirement 1.6 — validate each pageElements entry has tag and where with at least one key
  var elementKeys = Object.keys(pageElements);
  for (var ei = 0; ei < elementKeys.length; ei++) {
    var key = elementKeys[ei];
    var entry = pageElements[key];

    if (entry === null || typeof entry !== 'object') {
      return { ok: false, error: 'pageElements entry "' + key + '" must be an object' };
    }

    if (!entry.tag || typeof entry.tag !== 'string') {
      return { ok: false, error: 'pageElements entry "' + key + '" missing required field: tag' };
    }

    if (entry.where === null || typeof entry.where !== 'object' || Array.isArray(entry.where)) {
      return { ok: false, error: 'pageElements entry "' + key + '" missing required field: where' };
    }

    if (Object.keys(entry.where).length === 0 && !entry.xpath && !entry.navigate) {
      return { ok: false, error: 'pageElements entry "' + key + '" where object must have at least one key' };
    }
  }

  // Requirement 1.6a — validate childOf references
  // Build a map of valid childOf targets:
  // 1. id matcher values → element keys (legacy: childOf references where.id)
  // 2. element keys themselves (for xpath/navigate elements without where.id)
  var validChildOfTargets = {};
  for (var ci = 0; ci < elementKeys.length; ci++) {
    var elKey = elementKeys[ci];
    var elEntry = pageElements[elKey];
    // Map where.id values
    if (elEntry.where && typeof elEntry.where.id === 'string') {
      validChildOfTargets[elEntry.where.id] = elKey;
    }
    // Also map element keys directly (for xpath/navigate parents)
    validChildOfTargets[elKey] = elKey;
  }

  for (var coi = 0; coi < elementKeys.length; coi++) {
    var coKey = elementKeys[coi];
    var coEntry = pageElements[coKey];
    if ('childOf' in coEntry) {
      var childOfValue = coEntry.childOf;
      if (typeof childOfValue !== 'string' || childOfValue === '') {
        return {
          ok: false,
          error: 'pageElements entry "' + coKey + '" childOf must be a non-empty string'
        };
      }
      // The referenced value must match an existing entry's where.id OR an element key
      if (!(childOfValue in validChildOfTargets)) {
        return {
          ok: false,
          error:
            'pageElements entry "' +
            coKey +
            '" childOf "' +
            childOfValue +
            '" does not reference any pageElements entry'
        };
      }
    }
  }

  // Requirement 1.7 — validate each tasks entry has a steps array
  var taskKeys = Object.keys(tasks);
  for (var ti = 0; ti < taskKeys.length; ti++) {
    var taskKey = taskKeys[ti];
    var task = tasks[taskKey];
    if (task === null || typeof task !== 'object') {
      return { ok: false, error: 'tasks entry "' + taskKey + '" must be an object' };
    }
    if (!Array.isArray(task.steps)) {
      return { ok: false, error: 'tasks entry "' + taskKey + '" missing required field: steps' };
    }
    if (task.params !== undefined && !Array.isArray(task.params)) {
      return { ok: false, error: 'tasks entry "' + taskKey + '" params must be an array' };
    }
  }

  // Requirement 1.8 — validate each tests entry has name string and steps array
  for (var tei = 0; tei < tests.length; tei++) {
    var test = tests[tei];
    if (test === null || typeof test !== 'object') {
      return { ok: false, error: 'tests entry at index ' + tei + ' must be an object' };
    }
    if (typeof test.name !== 'string' || test.name === '') {
      return { ok: false, error: 'tests entry at index ' + tei + ' missing required field: name' };
    }
    if (!Array.isArray(test.steps)) {
      return { ok: false, error: 'tests entry at index ' + tei + ' missing required field: steps' };
    }
  }

  // Collect all steps from tasks and tests for target/task-name validation
  // Requirement 1.3 — every step target references a key in pageElements
  // Requirement 1.4 — every task action name references a key in tasks
  var pageElementKeySet = {};
  for (var pk = 0; pk < elementKeys.length; pk++) {
    pageElementKeySet[elementKeys[pk]] = true;
  }

  var taskKeySet = {};
  for (var tk = 0; tk < taskKeys.length; tk++) {
    taskKeySet[taskKeys[tk]] = true;
  }

  // Walk all steps in tasks
  for (var wti = 0; wti < taskKeys.length; wti++) {
    var wTaskKey = taskKeys[wti];
    var wTask = tasks[wTaskKey];
    var stepResult = validateSteps(wTask.steps, pageElementKeySet, taskKeySet);
    if (stepResult !== null) {
      return { ok: false, error: stepResult };
    }
  }

  // Walk all steps in tests
  for (var wtei = 0; wtei < tests.length; wtei++) {
    var wTest = tests[wtei];
    var testStepResult = validateSteps(wTest.steps, pageElementKeySet, taskKeySet);
    if (testStepResult !== null) {
      return { ok: false, error: testStepResult };
    }
  }

  // Detect circular task references after basic reference validation.
  var cycleError = detectTaskCycles(tasks);
  if (cycleError !== null) {
    return { ok: false, error: cycleError };
  }

  // Validate data fields on tests (Requirements: 7.3, 10.4)
  for (var dvi = 0; dvi < tests.length; dvi++) {
    var dvTest = tests[dvi];
    if (!dvTest || !dvTest.data || typeof dvTest.data !== 'object') continue;

    // Validate each data template entry
    var dvTemplateNames = Object.keys(dvTest.data);
    for (var dvti = 0; dvti < dvTemplateNames.length; dvti++) {
      var dvTmplName = dvTemplateNames[dvti];
      var dvTemplate = dvTest.data[dvTmplName];
      if (!dvTemplate || typeof dvTemplate !== 'object') continue;

      // Validate Fake.oneOf has non-empty values array (Requirement 7.3)
      var oneOfError = validateDataTemplateOneOf(dvTmplName, dvTemplate);
      if (oneOfError !== null) {
        return { ok: false, error: oneOfError };
      }
    }

    // Validate {{data.X.Y}} references in test steps (Requirement 10.4)
    if (Array.isArray(dvTest.steps)) {
      var dataRefError = validateDataReferences(dvTest.steps, dvTest.data, dvTest.name || ('index ' + dvi));
      if (dataRefError !== null) {
        return { ok: false, error: dataRefError };
      }
    }
  }

  return { ok: true, spec: obj };
}

/**
 * Validates all steps in a steps array.
 * Returns an error string if invalid, or null if all steps are valid.
 *
 * @param {Array} steps
 * @param {Object} pageElementKeySet - set of valid pageElement keys
 * @param {Object} taskKeySet - set of valid task keys
 * @returns {string|null}
 */
function validateSteps(steps, pageElementKeySet, taskKeySet) {
  if (!Array.isArray(steps)) {
    return null;
  }
  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    if (step === null || typeof step !== 'object') {
      continue;
    }

    // Requirement 1.3 — target field must reference a key in pageElements
    if ('target' in step) {
      var target = step.target;
      if (!(target in pageElementKeySet)) {
        var stepContext = step.action ? ' (action: ' + step.action + ')' : '';
        if (step.name) {
          stepContext = ' (action: ' + (step.action || 'unknown') + ', name: ' + step.name + ')';
      }
        return 'Step references unknown element: ' + target + stepContext;
    }
    }

    // Requirement 1.4 — task action name must reference a key in tasks
    if (step.action === 'task') {
      var name = step.name;
      if (!(name in taskKeySet)) {
        return 'Step references unknown task: ' + name;
      }
    }

    // Validate nested conditional branches recursively.
    if (step.action === 'if' && Array.isArray(step.then)) {
      var nestedResult = validateSteps(step.then, pageElementKeySet, taskKeySet);
      if (nestedResult !== null) {
        return nestedResult;
      }
    }
  }
  return null;
}

/**
 * Detect cycles in task-to-task dependencies.
 * Returns an error string when a cycle is found, otherwise null.
 *
 * @param {Object} tasks
 * @returns {string|null}
 */
function detectTaskCycles(tasks) {
  var taskKeys = Object.keys(tasks || {});
  if (taskKeys.length === 0) return null;

  var depsByTask = {};
  for (var i = 0; i < taskKeys.length; i++) {
    var taskKey = taskKeys[i];
    var task = tasks[taskKey] || {};
    depsByTask[taskKey] = collectTaskRefs(task.steps || []);
  }

  var state = {}; // 0/undefined=unvisited, 1=visiting, 2=visited
  var stack = [];
  var stackIndex = {};

  function dfs(node) {
    state[node] = 1;
    stackIndex[node] = stack.length;
    stack.push(node);

    var deps = depsByTask[node] || [];
    for (var di = 0; di < deps.length; di++) {
      var dep = deps[di];
      // Unknown task references are handled by validateSteps; ignore here.
      if (!(dep in depsByTask)) continue;

      if (state[dep] === 1) {
        var startIdx = stackIndex[dep];
        var cyclePath = stack.slice(startIdx).concat([dep]);
        return 'Circular task reference detected: ' + cyclePath.join(' -> ');
      }

      if (state[dep] !== 2) {
        var err = dfs(dep);
        if (err) return err;
      }
    }

    stack.pop();
    delete stackIndex[node];
    state[node] = 2;
    return null;
  }

  for (var ti = 0; ti < taskKeys.length; ti++) {
    var start = taskKeys[ti];
    if (state[start] === 2) continue;
    var error = dfs(start);
    if (error) return error;
  }

  return null;
}

/**
 * Collect task action names from steps recursively (including if.then blocks).
 *
 * @param {Array} steps
 * @returns {Array<string>}
 */
function collectTaskRefs(steps) {
  var refs = [];
  if (!Array.isArray(steps)) return refs;

  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    if (!step || typeof step !== 'object') continue;

    if (step.action === 'task' && typeof step.name === 'string') {
      refs.push(step.name);
    }

    if (step.action === 'if' && Array.isArray(step.then)) {
      var nested = collectTaskRefs(step.then);
      for (var ni = 0; ni < nested.length; ni++) {
        refs.push(nested[ni]);
      }
    }
  }

  return refs;
}

/**
 * Recursively validate that no Fake.oneOf descriptor has an empty values array.
 * Returns an error string if invalid, or null if all entries are valid.
 *
 * @param {string} templateName - Name of the Data template (for error messages)
 * @param {object} template - Template object (may be nested)
 * @returns {string|null}
 */
function validateDataTemplateOneOf(templateName, template) {
  if (!template || typeof template !== 'object') return null;

  var keys = Object.keys(template);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = template[key];
    if (!value || typeof value !== 'object') continue;

    // Check if this is a Fake descriptor
    if (value.type === 'fake' && value.method === 'oneOf') {
      var values = value.options && value.options.values;
      if (!values || !Array.isArray(values) || values.length === 0) {
        return 'Fake.oneOf requires at least one option in data template "' + templateName + '" property "' + key + '"';
      }
    }

    // Recurse into nested objects (non-fake, non-array objects)
    if (value.type !== 'fake' && !Array.isArray(value)) {
      var nestedError = validateDataTemplateOneOf(templateName + '.' + key, value);
      if (nestedError !== null) return nestedError;
    }
  }

  return null;
}

/**
 * Validate that {{data.X.Y}} references in test steps point to existing template properties.
 * Returns an error string if invalid, or null if all references are valid.
 *
 * @param {Array} steps - Test step array
 * @param {object} dataMap - Test's data map (templateName → template structure)
 * @param {string} testName - Test name for error messages
 * @returns {string|null}
 */
function validateDataReferences(steps, dataMap, testName) {
  if (!Array.isArray(steps) || !dataMap) return null;

  var regex = /\{\{data\.([^}]+)\}\}/g;

  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    if (!step || typeof step !== 'object') continue;

    // Check value field
    if (typeof step.value === 'string') {
      var match;
      while ((match = regex.exec(step.value)) !== null) {
        var err = validateSingleDataPath(match[1], dataMap, testName);
        if (err !== null) return err;
      }
      regex.lastIndex = 0;
    }

    // Check params object values
    if (step.params && typeof step.params === 'object') {
      var paramKeys = Object.keys(step.params);
      for (var pk = 0; pk < paramKeys.length; pk++) {
        var paramVal = step.params[paramKeys[pk]];
        if (typeof paramVal === 'string') {
          while ((match = regex.exec(paramVal)) !== null) {
            var paramErr = validateSingleDataPath(match[1], dataMap, testName);
            if (paramErr !== null) return paramErr;
          }
          regex.lastIndex = 0;
        }
      }
    }

    // Recurse into conditional branches
    if (step.action === 'if' && Array.isArray(step.then)) {
      var nestedError = validateDataReferences(step.then, dataMap, testName);
      if (nestedError !== null) return nestedError;
    }
  }

  return null;
}

/**
 * Validate a single data path (e.g., "patient.name") against the data map.
 * Returns an error string if the path doesn't resolve, or null if valid.
 *
 * @param {string} dataPath - Dot-separated path (e.g., "patient.name")
 * @param {object} dataMap - Test's data map (templateName → template structure)
 * @param {string} testName - Test name for error messages
 * @returns {string|null}
 */
function validateSingleDataPath(dataPath, dataMap, testName) {
  var parts = dataPath.split('.');
  if (parts.length < 2) {
    return 'Invalid data reference "{{data.' + dataPath + '}}" in test "' + testName + '": expected format {{data.templateName.property}}';
  }

  var templateName = parts[0];
  if (!dataMap[templateName]) {
    return 'Unknown data template "' + templateName + '" referenced in test "' + testName + '"';
  }

  // Walk the template structure to verify the property path exists
  var current = dataMap[templateName];
  for (var i = 1; i < parts.length; i++) {
    if (!current || typeof current !== 'object') {
      return 'Unknown data property "' + parts.slice(1).join('.') + '" on template "' + templateName + '" in test "' + testName + '"';
    }
    if (!(parts[i] in current)) {
      return 'Unknown data property "' + parts.slice(1).join('.') + '" on template "' + templateName + '" in test "' + testName + '"';
    }
    current = current[parts[i]];
  }

  return null;
}

module.exports = { validateSpec, KNOWN_ACTIONS };
