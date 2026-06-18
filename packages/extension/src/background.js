// background.js — service worker / orchestrator
// Implementation: Tasks 14, 15
try { importScripts('storage.js'); } catch (e) { /* Node.js test environment */ }
var api = typeof browser !== 'undefined' ? browser : chrome;

// Open side panel when the extension icon is clicked (Chrome/Edge only)
if (api.sidePanel && api.sidePanel.setPanelBehavior) {
  api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(function () { /* ignore if unsupported */ });
}

/**
 * Safely send a message to the panel via runtime.sendMessage.
 * Catches "Could not establish connection" errors that occur when
 * the panel is not open/connected.
 *
 * @param {object} msg - The message to send
 */
function safeSendMessage(msg) {
  try {
    api.runtime.sendMessage(msg).catch(function (err) {
      console.log(
        '[tomation] sendMessage failed: ' + (err.message || err) + '\n' +
        'Possible reason: The side panel or popup is not open, or the extension context was invalidated.\n' +
        'Suggested solutions:\n' +
        '  1. Open the extension side panel and try again.\n' +
        '  2. Reload the page to re-establish the content script connection.\n' +
        '  3. Reload the extension from chrome://extensions if the context was invalidated.'
      );
    });
  } catch (e) {
    console.log(
      '[tomation] sendMessage threw synchronously: ' + (e.message || e) + '\n' +
      'Possible reason: The extension runtime is no longer available (e.g., extension was updated or disabled).\n' +
      'Suggested solutions:\n' +
      '  1. Reload the extension from the extensions page.\n' +
      '  2. Reload the page to restore the connection.\n' +
      '  3. Close and reopen the browser if the issue persists.'
    );
  }
}

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
 * Evaluate a conditional expression against the current params context.
 *
 * @param {object} condition - The condition object { param, op, value? }
 * @param {object} params - The current params map
 * @returns {boolean} - Whether the condition is met
 */
function evaluateCondition(condition, params) {
  var val = params[condition.param];
  switch (condition.op) {
    case 'truthy':    return !!val;
    case 'falsy':     return !val;
    case 'equals':    return val === condition.value;
    case 'notEquals': return val !== condition.value;
    default:          return false;
  }
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

  if (step.action === 'if') {
    if (evaluateCondition(step.condition, params)) {
      var result = [];
      for (var i = 0; i < step.then.length; i++) {
        var expanded = expandStep(step.then[i], tasksMap, pageElements, params);
        for (var j = 0; j < expanded.length; j++) {
          result.push(expanded[j]);
        }
      }
      return result;
    }
    return [];
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
// Speed Delay Infrastructure
// ---------------------------------------------------------------------------

/** Mapping of execution speed names to delay durations in milliseconds */
var SPEED_DELAYS = {
  'FAST': 0,
  'NORMAL': 500,
  'SLOW': 1500
};

/**
 * Return a Promise that resolves after the delay mapped to the given speed.
 * Unknown speed values default to 0ms (no delay).
 *
 * @param {string} speed - One of 'FAST', 'NORMAL', 'SLOW' (or any other value for default)
 * @returns {Promise} - Resolves after the mapped delay
 */
function applySpeedDelay(speed) {
  var delay = SPEED_DELAYS.hasOwnProperty(speed) ? SPEED_DELAYS[speed] : 0;
  return new Promise(function (resolve) {
    setTimeout(resolve, delay);
  });
}

// ---------------------------------------------------------------------------
// Run State Machine (Task 15)
// ---------------------------------------------------------------------------

/** Default configuration (v1 behavior when no config is provided) */
var DEFAULT_RUN_CONFIG = {
  allowContinueOnFailure: false,
  allowRetryOnFailure: false,
  executionSpeed: 'FAST'
};

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
  pauseResolve: null,
  awaitingAction: false,
  failedStepIndex: null,
  retryAttempt: 0,
  config: {
    allowContinueOnFailure: false,
    allowRetryOnFailure: false,
    executionSpeed: 'FAST'
  }
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
  runState.awaitingAction = false;
  runState.failedStepIndex = null;
  runState.retryAttempt = 0;
  runState.config = {
    allowContinueOnFailure: false,
    allowRetryOnFailure: false,
    executionSpeed: 'FAST'
  };
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
  safeSendMessage(logMsg);
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
  safeSendMessage({
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
function startRun(tabId, test, spec, checkedSteps, config) {
  resetRunState();

  if (config) {
    runState.config = config;
  }

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
 * Checks pause state before each step. Inserts a speed delay before
 * dispatching each step to the runtime. On failure, enters
 * awaiting-action state if retry/skip is enabled; otherwise halts immediately.
 * Emits LOG after each step and a summary on completion.
 *
 * @returns {Promise}
 */
function runStepLoop() {
  if (runState.stepIndex >= runState.steps.length || runState.stopRequested) {
    return finishRun();
  }

  // If awaiting user action (retry/skip), do not advance
  if (runState.awaitingAction) {
    return Promise.resolve();
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

    // Apply speed delay before dispatching step to runtime
    return applySpeedDelay(runState.config.executionSpeed).then(function () {
      // Check stop again after the delay
      if (runState.stopRequested) {
        return finishRun();
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
          // Check if retry or skip is enabled
          var canRetry = runState.config.allowRetryOnFailure;
          var canSkip = runState.config.allowContinueOnFailure;

          if (canRetry || canSkip) {
            // Enter awaiting-action state — keep run alive, tab locked, pause loop
            runState.awaitingAction = true;
            runState.failedStepIndex = currentIndex;

            // Emit STEP_FAILED_AWAITING_ACTION to panel
            safeSendMessage({
              type: 'STEP_FAILED_AWAITING_ACTION',
              stepIndex: currentIndex,
              action: step.action,
              target: step.target || null,
              value: step.value || null,
              error: error || 'Step failed'
            });

            // Do NOT halt or unlock tab — just pause the loop
            return;
          }

          // v1 behavior: halt run on failure immediately
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
  safeSendMessage({
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
 * Handle a RETRY_STEP message from the panel. Re-sends the failed step
 * to the runtime. On success, resumes the step loop from the next step.
 * On failure, halts the run and unlocks the tab.
 *
 * @param {object} msg - { type: 'RETRY_STEP', stepIndex: number }
 */
function handleRetryStep(msg) {
  if (!runState.awaitingAction) {
    console.warn('[tomation] RETRY_STEP received but not awaiting action — ignoring');
    return;
  }

  if (msg.stepIndex !== runState.failedStepIndex) {
    console.warn('[tomation] RETRY_STEP stepIndex mismatch — ignoring');
    return;
  }

  runState.retryAttempt++;

  var currentIndex = runState.failedStepIndex;
  var step = runState.steps[currentIndex];

  sendStepToRuntime(step, currentIndex).then(function (result) {
    var ok = result && result.ok;
    var error = result && result.error;

    if (ok) {
      runState.awaitingAction = false;
      runState.failedStepIndex = null;
      runState.passCount++;
      runState.stepIndex++;

      // Emit LOG with retryAttempt field
      var logMsg = {
        type: 'LOG',
        stepIndex: currentIndex,
        action: step.action,
        target: step.target || null,
        value: step.value || null,
        ok: true,
        retryAttempt: runState.retryAttempt
      };
      safeSendMessage(logMsg);

      // Resume step loop
      runStepLoop();
    } else {
      // Halt run on retry failure
      runState.awaitingAction = false;
      runState.failedStepIndex = null;
      runState.running = false;
      unlockTab();

      // Emit failure LOG
      var failLogMsg = {
        type: 'LOG',
        stepIndex: currentIndex,
        action: step.action,
        target: step.target || null,
        value: step.value || null,
        ok: false,
        error: error || 'Retry failed',
        retryAttempt: runState.retryAttempt
      };
      safeSendMessage(failLogMsg);

      emitSummary('RUN_COMPLETE', currentIndex + 1, runState.passCount, runState.failCount);
    }
  });
}

/**
 * Handle a SKIP_STEP message from the panel.
 * Advances past the failed step without modifying passCount.
 * If the failed step was the last step, finishes the run; otherwise resumes the step loop.
 *
 * @param {object} msg - The SKIP_STEP message payload (must include stepIndex)
 */
function handleSkipStep(msg) {
  if (!runState.awaitingAction) {
    console.warn('[tomation] SKIP_STEP received but not awaiting action — ignoring');
    return;
  }

  if (msg.stepIndex !== runState.failedStepIndex) {
    console.warn('[tomation] SKIP_STEP stepIndex mismatch — ignoring');
    return;
  }

  runState.awaitingAction = false;
  runState.failedStepIndex = null;
  runState.stepIndex = msg.stepIndex + 1;

  if (runState.stepIndex >= runState.steps.length) {
    finishRun();
  } else {
    runStepLoop();
  }
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

// ---------------------------------------------------------------------------
// Message Router (Task 15.5)
// ---------------------------------------------------------------------------

/**
 * Handle messages from the panel (RUN_TEST, PAUSE, CONTINUE, STOP)
 * and from content scripts (STEP_RESULT, RUNTIME_READY).
 *
 * @param {object} message - The incoming message
 * @param {object} sender - The message sender info
 * @param {function} sendResponse - Callback to send a response (unused for async)
 */
function handleMessage(message, sender, sendResponse) {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'RUN_TEST':
      handleRunTest(message);
      break;
    case 'PAUSE':
      pauseRun();
      break;
    case 'CONTINUE':
      continueRun();
      break;
    case 'STOP':
      stopRun();
      break;
    case 'RETRY_STEP':
      handleRetryStep(message);
      break;
    case 'SKIP_STEP':
      handleSkipStep(message);
      break;
    // STEP_RESULT and RUNTIME_READY are handled inline by sendStepToRuntime
    // and handleNavigateStep respectively via their own listeners.
    // No additional routing needed here.
  }
}

/**
 * Handle the RUN_TEST message from the panel.
 * Queries the active tab, looks up the project by hostname, finds the test
 * by index, and starts the run.
 *
 * @param {object} message - { type: 'RUN_TEST', testIndex: number, checkedSteps: Array }
 */
function handleRunTest(message) {
  var testIndex = message.testIndex;
  var checkedSteps = message.checkedSteps;
  var config = message.config || {
    allowContinueOnFailure: false,
    allowRetryOnFailure: false,
    executionSpeed: 'FAST'
  };

  api.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    if (!tabs || tabs.length === 0) return;

    var tab = tabs[0];
    var url = new URL(tab.url);
    var hostname = url.hostname;

    return getProject(hostname).then(function (project) {
      if (!project || !project.specs || project.specs.length === 0) return;

      // Find the test across all specs in the project
      var foundTest = null;
      var foundSpec = null;
      var globalIndex = 0;

      for (var s = 0; s < project.specs.length; s++) {
        var spec = project.specs[s].spec;
        if (!spec || !spec.tests) continue;

        for (var t = 0; t < spec.tests.length; t++) {
          if (globalIndex === testIndex) {
            foundTest = spec.tests[t];
            foundSpec = spec;
            break;
          }
          globalIndex++;
        }
        if (foundTest) break;
      }

      if (foundTest && foundSpec) {
        startRun(tab.id, foundTest, foundSpec, checkedSteps, config);
      }
    });
  });
}

/**
 * Send STATE_SYNC to a newly connected panel port.
 *
 * @param {object} port - The connected port
 */
function handlePanelConnect(port) {
  if (port.name === 'panel') {
    port.postMessage({
      type: 'STATE_SYNC',
      running: runState.running,
      paused: runState.paused,
      lockedTabId: runState.lockedTabId
    });
  }
}

/**
 * Initialize the message router listeners.
 * Called once when the background script loads.
 */
function initMessageRouter() {
  api.runtime.onMessage.addListener(handleMessage);
  api.runtime.onConnect.addListener(handlePanelConnect);
}

// Initialize the router (only in extension context, not in Node test context)
if (typeof module === 'undefined' || !module.exports) {
  initMessageRouter();
}

// Export for testing in Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateRandom: generateRandom,
    resolveValue: resolveValue,
    evaluateCondition: evaluateCondition,
    flattenSteps: flattenSteps,
    expandStep: expandStep,
    expandTaskStep: expandTaskStep,
    buildStepMessage: buildStepMessage,
    findParentDescriptor: findParentDescriptor,
    safeSendMessage: safeSendMessage,
    SPEED_DELAYS: SPEED_DELAYS,
    applySpeedDelay: applySpeedDelay,
    DEFAULT_RUN_CONFIG: DEFAULT_RUN_CONFIG,
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
    handleManualStep: handleManualStep,
    handleRetryStep: handleRetryStep,
    handleMessage: handleMessage,
    handleRunTest: handleRunTest,
    handlePanelConnect: handlePanelConnect,
    initMessageRouter: initMessageRouter
  };
}
