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

// ---------------------------------------------------------------------------
// Run State Machine (Task 15)
// ---------------------------------------------------------------------------

/** Runtime state for the current test run */
var runState = {
  running: false,
  paused: false,
  stopRequested: false,
  lockedTabId: null,
  currentTestName: '',
  steps: [],
  stepIndex: 0,
  passCount: 0,
  failCount: 0,
  pauseResolve: null
};

/**
 * Reset run state to defaults.
 */
function resetRunState() {
  runState.running = false;
  runState.paused = false;
  runState.stopRequested = false;
  runState.lockedTabId = null;
  runState.currentTestName = '';
  runState.steps = [];
  runState.stepIndex = 0;
  runState.passCount = 0;
  runState.failCount = 0;
  runState.pauseResolve = null;
}

/**
 * Lock the active tab for the duration of the test run.
 * Stores the tabId and calls api.tabs.update to keep it active.
 *
 * @param {number} tabId - The tab to lock
 * @returns {Promise}
 */
function lockTab(tabId) {
  runState.lockedTabId = tabId;
  return api.tabs.update(tabId, { active: true });
}

/**
 * Unlock the active tab after a test run ends.
 * Clears the lockedTabId from run state.
 */
function unlockTab() {
  runState.lockedTabId = null;
}

/**
 * Send a single step to the runtime content script and return its response.
 *
 * @param {object} step - The resolved EXECUTE_STEP message
 * @param {number} stepIndex - The current step index
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function sendStepToRuntime(step, stepIndex) {
  var msg = {};
  var keys = Object.keys(step);
  for (var i = 0; i < keys.length; i++) {
    msg[keys[i]] = step[keys[i]];
  }
  msg.type = 'EXECUTE_STEP';
  msg.stepIndex = stepIndex;

  return api.tabs.sendMessage(runState.lockedTabId, msg);
}

/**
 * Emit a LOG message to the panel after a step completes.
 *
 * @param {number} stepIndex - The index of the completed step
 * @param {object} step - The step object (with action, target, value)
 * @param {boolean} ok - Whether the step passed
 * @param {string} [error] - Error message if the step failed
 */
function emitLog(stepIndex, step, ok, error) {
  var logMsg = {
    type: 'LOG',
    stepIndex: stepIndex,
    action: step.action,
    target: step.target || null,
    value: step.value || null,
    ok: ok
  };
  if (error) {
    logMsg.error = error;
  }
  api.runtime.sendMessage(logMsg);
}

/**
 * Emit a final summary message to the panel.
 *
 * @param {string} type - 'RUN_COMPLETE' or 'RUN_STOPPED'
 * @param {number} total - Total steps attempted
 * @param {number} passed - Steps that passed
 * @param {number} failed - Steps that failed
 */
function emitSummary(type, total, passed, failed) {
  api.runtime.sendMessage({
    type: type,
    total: total,
    passed: passed,
    failed: failed
  });
}

/**
 * Start a test run. Flattens steps, locks the tab, and begins the step loop.
 *
 * @param {number} tabId - The active tab id to lock
 * @param {object} test - The test object from the spec (has .name and .steps)
 * @param {object} spec - The full spec object (has .tasks, .pageElements)
 * @param {Array|Set} checkedSteps - The checked step indexes
 * @returns {Promise}
 */
function startRun(tabId, test, spec, checkedSteps) {
  resetRunState();

  var resolvedSteps = flattenSteps(
    test.steps,
    spec.tasks || {},
    spec.pageElements || {},
    checkedSteps
  );

  runState.running = true;
  runState.currentTestName = test.name || '';
  runState.steps = resolvedSteps;
  runState.stepIndex = 0;
  runState.passCount = 0;
  runState.failCount = 0;

  return lockTab(tabId).then(function () {
    return runStepLoop();
  });
}

/**
 * Execute steps sequentially. Halts on failure or stop request.
 * Checks pause state before each step. Emits LOG after each step
 * and a summary on completion.
 *
 * @returns {Promise}
 */
function runStepLoop() {
  if (runState.stepIndex >= runState.steps.length || runState.stopRequested) {
    return finishRun();
  }

  // If paused, wait for continueRun() to resolve the pause promise
  var waitForPause;
  if (runState.paused) {
    waitForPause = new Promise(function (resolve) {
      runState.pauseResolve = resolve;
    });
  } else {
    waitForPause = Promise.resolve();
  }

  return waitForPause.then(function () {
    // After unpausing, check if stop was requested while paused
    if (runState.stopRequested) {
      return finishRun();
    }

    var currentIndex = runState.stepIndex;
    var step = runState.steps[currentIndex];

    // Handle navigate steps in the background (don't send to runtime)
    if (step.action === 'navigate') {
      return handleNavigateStep(step, currentIndex);
    }

    // Handle wait steps in the background (don't send to runtime)
    if (step.action === 'wait') {
      return handleWaitStep(step, currentIndex);
    }

    // Handle manual steps in the background (don't send to runtime)
    if (step.action === 'manual') {
      return handleManualStep(step, currentIndex);
    }

    return sendStepToRuntime(step, currentIndex).then(function (result) {
      if (runState.stopRequested) {
        return finishRun();
      }

      var ok = result && result.ok;
      var error = result && result.error;

      if (ok) {
        runState.passCount++;
      } else {
        runState.failCount++;
      }

      // Emit LOG for this step
      emitLog(currentIndex, step, !!ok, error || undefined);

      if (!ok) {
        // Halt run on failure
        unlockTab();
        runState.running = false;
        emitSummary('RUN_COMPLETE', currentIndex + 1, runState.passCount, runState.failCount);
        return;
      }

      // Advance to next step
      runState.stepIndex++;
      return runStepLoop();
    });
  });
}

/**
 * Handle a navigate step: update the tab URL, then wait for RUNTIME_READY
 * from the content script on the new page. Times out after 10 seconds.
 *
 * @param {object} step - The navigate step (has step.url)
 * @param {number} currentIndex - The current step index
 * @returns {Promise}
 */
function handleNavigateStep(step, currentIndex) {
  return api.tabs.update(runState.lockedTabId, { url: step.url }).then(function () {
    return new Promise(function (resolve, reject) {
      var timeoutId = null;
      var listener = null;

      listener = function (message, sender) {
        // Only accept RUNTIME_READY from the locked tab
        var fromTab = sender && sender.tab && sender.tab.id === runState.lockedTabId;
        if (message && message.type === 'RUNTIME_READY' && fromTab) {
          clearTimeout(timeoutId);
          api.runtime.onMessage.removeListener(listener);
          resolve();
        }
      };

      api.runtime.onMessage.addListener(listener);

      timeoutId = setTimeout(function () {
        api.runtime.onMessage.removeListener(listener);
        reject(new Error('Navigation timeout: RUNTIME_READY not received within 10 seconds'));
      }, 10000);
    });
  }).then(function () {
    // Navigation succeeded
    runState.passCount++;
    emitLog(currentIndex, step, true, undefined);
    runState.stepIndex++;
    return runStepLoop();
  }).catch(function (err) {
    // Navigation timed out or failed
    runState.failCount++;
    emitLog(currentIndex, step, false, err.message || 'Navigation failed');
    unlockTab();
    runState.running = false;
    emitSummary('RUN_COMPLETE', currentIndex + 1, runState.passCount, runState.failCount);
  });
}

/**
 * Handle a wait step: pause execution for the specified milliseconds,
 * then emit LOG and advance to the next step.
 *
 * @param {object} step - The wait step (has step.ms)
 * @param {number} currentIndex - The current step index
 * @returns {Promise}
 */
function handleWaitStep(step, currentIndex) {
  return new Promise(function (resolve) {
    setTimeout(resolve, step.ms || 0);
  }).then(function () {
    if (runState.stopRequested) {
      return finishRun();
    }
    runState.passCount++;
    emitLog(currentIndex, step, true, undefined);
    runState.stepIndex++;
    return runStepLoop();
  });
}

/**
 * Handle a manual step: emit MANUAL_PAUSE to the panel with the step's description,
 * then pause execution until the panel sends CONTINUE. Once continued, emit LOG
 * and advance to the next step.
 *
 * @param {object} step - The manual step (has step.description)
 * @param {number} currentIndex - The current step index
 * @returns {Promise}
 */
function handleManualStep(step, currentIndex) {
  // Emit MANUAL_PAUSE to the panel
  api.runtime.sendMessage({
    type: 'MANUAL_PAUSE',
    description: step.description || ''
  });

  // Pause execution using the same mechanism as pauseRun
  runState.paused = true;
  return new Promise(function (resolve) {
    runState.pauseResolve = resolve;
  }).then(function () {
    if (runState.stopRequested) {
      return finishRun();
    }
    runState.passCount++;
    emitLog(currentIndex, step, true, undefined);
    runState.stepIndex++;
    return runStepLoop();
  });
}

/**
 * Finish the run (either all steps done or stopped).
 * Unlocks tab and emits appropriate summary.
 */
function finishRun() {
  unlockTab();
  runState.running = false;

  var total = runState.stepIndex;
  var passed = runState.passCount;
  var failed = runState.failCount;

  if (runState.stopRequested) {
    runState.stopRequested = false;
    emitSummary('RUN_STOPPED', total, passed, failed);
  } else {
    emitSummary('RUN_COMPLETE', total, passed, failed);
  }
}

/**
 * Pause the current test run. Creates a promise that the step loop
 * will await before each step, blocking dispatch until continueRun() is called.
 *
 * @returns {Promise|undefined} - The pause promise (resolves when continued), or undefined if not running
 */
function pauseRun() {
  if (!runState.running) return undefined;
  runState.paused = true;
  var promise = new Promise(function (resolve) {
    runState.pauseResolve = resolve;
  });
  return promise;
}

/**
 * Continue after a pause. Resolves the pause promise to unblock the step loop
 * and resets the paused state.
 */
function continueRun() {
  if (runState.pauseResolve) {
    runState.pauseResolve();
    runState.pauseResolve = null;
  }
  runState.paused = false;
}

/**
 * Request the run to stop. The step loop will check this flag
 * and halt at the next iteration. If currently paused, also unblocks
 * the step loop so it can exit.
 */
function stopRun() {
  if (runState.running) {
    runState.stopRequested = true;
    if (runState.paused) {
      continueRun();
    }
  }
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
    findParentDescriptor: findParentDescriptor,
    runState: runState,
    resetRunState: resetRunState,
    lockTab: lockTab,
    unlockTab: unlockTab,
    sendStepToRuntime: sendStepToRuntime,
    emitLog: emitLog,
    emitSummary: emitSummary,
    startRun: startRun,
    runStepLoop: runStepLoop,
    finishRun: finishRun,
    stopRun: stopRun,
    pauseRun: pauseRun,
    continueRun: continueRun,
    handleNavigateStep: handleNavigateStep,
    handleWaitStep: handleWaitStep,
    handleManualStep: handleManualStep
  };
}
