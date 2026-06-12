// background.js — service worker / orchestrator
// Implementation: Tasks 14, 15
var api = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Generate a random alphanumeric string of the given length.
 * @param {number} [len=8] - Length of the random string
 * @returns {string}
 */
function generateRandom(len) {
  if (len === undefined) len = 8;
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  for (var i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Resolve all {{paramName}} tokens and $random values in a string.
 * Missing params are substituted with "" and a warning is logged.
 *
 * @param {string} value - The string to resolve
 * @param {object} params - The params map from the task invocation
 * @returns {string} - Fully resolved string with no remaining tokens
 */
function resolveValue(value, params) {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') return value;

  // Resolve $random
  if (value === '$random') {
    return generateRandom(8);
  }

  // Resolve {{paramName}} tokens
  var resolved = value.replace(/\{\{([^}]+)\}\}/g, function (match, paramName) {
    if (params && params.hasOwnProperty(paramName)) {
      return params[paramName];
    }
    console.warn('[tomation] Missing param "' + paramName + '" — substituting empty string');
    return '';
  });

  // Resolve any $random tokens embedded in the string
  resolved = resolved.replace(/\$random/g, function () {
    return generateRandom(8);
  });

  return resolved;
}

/**
 * Flatten test steps by expanding task actions inline, resolving parameters,
 * and skipping unchecked steps. Returns an array of resolved step messages
 * ready to be sent as EXECUTE_STEP to the runtime.
 *
 * @param {Array} testSteps - The test's steps array
 * @param {object} tasksMap - The spec's tasks map (key → { params?, steps[] })
 * @param {object} pageElements - The spec's pageElements map (key → descriptor)
 * @param {Set|Array} checkedIndexes - Set or array of top-level step indexes that are checked (included)
 * @returns {Array} - Ordered array of resolved EXECUTE_STEP message objects
 */
function flattenSteps(testSteps, tasksMap, pageElements, checkedIndexes) {
  var checked;
  if (checkedIndexes && typeof checkedIndexes.has === 'function') {
    checked = checkedIndexes;
  } else if (Array.isArray(checkedIndexes)) {
    checked = {};
    for (var ci = 0; ci < checkedIndexes.length; ci++) {
      checked[checkedIndexes[ci]] = true;
    }
    checked.has = function (idx) { return this[idx] === true; };
  } else {
    // If no checked set provided, include all steps
    checked = { has: function () { return true; } };
  }

  var result = [];

  for (var i = 0; i < testSteps.length; i++) {
    if (!checked.has(i)) {
      continue;
    }

    var step = testSteps[i];
    var expanded = expandStep(step, tasksMap, pageElements, {});
    for (var j = 0; j < expanded.length; j++) {
      result.push(expanded[j]);
    }
  }

  return result;
}

/**
 * Recursively expand a single step. If the step is a task action, expand
 * the task's steps inline with parameter resolution. Otherwise, build
 * the EXECUTE_STEP message with resolved values and element descriptors.
 *
 * @param {object} step - A single step object
 * @param {object} tasksMap - The spec's tasks map
 * @param {object} pageElements - The spec's pageElements map
 * @param {object} params - Current parameter context for template resolution
 * @returns {Array} - Array of resolved step message objects
 */
function expandStep(step, tasksMap, pageElements, params) {
  if (step.action === 'task') {
    return expandTaskStep(step, tasksMap, pageElements, params);
  }

  return [buildStepMessage(step, pageElements, params)];
}

/**
 * Expand a task action step by looking up the task definition and
 * recursively expanding its child steps with merged parameters.
 *
 * @param {object} step - The task step { action: "task", name: string, params?: object }
 * @param {object} tasksMap - The spec's tasks map
 * @param {object} pageElements - The spec's pageElements map
 * @param {object} parentParams - Inherited params from an outer task context
 * @returns {Array} - Array of resolved step message objects
 */
function expandTaskStep(step, tasksMap, pageElements, parentParams) {
  var taskName = step.name;
  var taskDef = tasksMap[taskName];

  if (!taskDef) {
    console.warn('[tomation] Task "' + taskName + '" not found in tasks map');
    return [];
  }

  // Merge parent params with this invocation's params
  var mergedParams = {};
  var pk;
  if (parentParams) {
    var parentKeys = Object.keys(parentParams);
    for (var pi = 0; pi < parentKeys.length; pi++) {
      pk = parentKeys[pi];
      mergedParams[pk] = parentParams[pk];
    }
  }
  if (step.params) {
    var stepParamKeys = Object.keys(step.params);
    for (var si = 0; si < stepParamKeys.length; si++) {
      pk = stepParamKeys[si];
      // Resolve param values themselves (they may contain {{tokens}} from outer context)
      mergedParams[pk] = resolveValue(step.params[pk], parentParams);
    }
  }

  var result = [];
  var taskSteps = taskDef.steps;

  for (var i = 0; i < taskSteps.length; i++) {
    var childStep = taskSteps[i];
    var expanded = expandStep(childStep, tasksMap, pageElements, mergedParams);
    for (var j = 0; j < expanded.length; j++) {
      result.push(expanded[j]);
    }
  }

  return result;
}

/**
 * Build a single EXECUTE_STEP message object from a resolved step.
 * Attaches elementDescriptor and parentDescriptor when applicable.
 *
 * @param {object} step - The step object (non-task)
 * @param {object} pageElements - The spec's pageElements map
 * @param {object} params - Current params for template resolution
 * @returns {object} - The EXECUTE_STEP message object
 */
function buildStepMessage(step, pageElements, params) {
  var msg = {
    type: 'EXECUTE_STEP',
    action: step.action
  };

  // Resolve value field
  if (step.value !== undefined) {
    msg.value = resolveValue(step.value, params);
  }

  // Copy over action-specific fields
  if (step.target !== undefined) {
    msg.target = step.target;
  }
  if (step.url !== undefined) {
    msg.url = resolveValue(step.url, params);
  }
  if (step.ms !== undefined) {
    msg.ms = step.ms;
  }
  if (step.gone !== undefined) {
    msg.gone = step.gone;
  }
  if (step.description !== undefined) {
    msg.description = resolveValue(step.description, params);
  }
  if (step.name !== undefined) {
    msg.name = step.name;
  }

  // Attach element descriptors for steps with a target
  if (step.target && pageElements) {
    var descriptor = pageElements[step.target];
    if (descriptor) {
      msg.elementDescriptor = descriptor;

      // If the descriptor has a childOf field, resolve the parent element descriptor
      if (descriptor.childOf) {
        var parentDescriptor = findParentDescriptor(descriptor.childOf, pageElements);
        if (parentDescriptor) {
          msg.parentDescriptor = parentDescriptor;
        }
      }
    }
  }

  return msg;
}

/**
 * Find the parent element descriptor by childOf value.
 * childOf references the `id` matcher value of another pageElement entry.
 *
 * @param {string} childOfId - The id value referenced by childOf
 * @param {object} pageElements - The spec's pageElements map
 * @returns {object|null} - The parent element descriptor or null if not found
 */
function findParentDescriptor(childOfId, pageElements) {
  var keys = Object.keys(pageElements);
  for (var i = 0; i < keys.length; i++) {
    var entry = pageElements[keys[i]];
    if (entry.where && entry.where.id === childOfId) {
      return entry;
    }
  }
  return null;
}

// Export for testing in Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateRandom: generateRandom,
    resolveValue: resolveValue,
    flattenSteps: flattenSteps,
    expandStep: expandStep,
    expandTaskStep: expandTaskStep,
    buildStepMessage: buildStepMessage,
    findParentDescriptor: findParentDescriptor
  };
}
