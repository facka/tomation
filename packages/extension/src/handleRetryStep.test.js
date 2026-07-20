'use strict';

/**
 * Bug Condition Exploration Test — Unlimited Retry on Failure
 *
 * Property 1: Bug Condition - Retry Failure Halts Run Instead of Re-Awaiting
 *
 * This test is EXPECTED TO FAIL on unfixed code. Failure confirms the bug exists:
 * - When handleRetryStep is called and sendStepToRuntime returns { ok: false },
 *   the buggy code sets runState.awaitingAction = false, runState.running = false,
 *   calls unlockTab(), and emits RUN_COMPLETE — halting the run.
 * - Additionally, the buggy code emits type: 'LOG' instead of type: 'UPDATE_LOG_ENTRY'
 *
 * The test encodes the EXPECTED (correct) behavior after the fix:
 * - runState.awaitingAction remains true (run stays in awaiting state)
 * - runState.running remains true (run stays alive)
 * - runState.retryAttempt is incremented
 * - safeSendMessage is called with type: 'STEP_FAILED_AWAITING_ACTION'
 * - safeSendMessage is NOT called with type: 'RUN_COMPLETE'
 * - unlockTab is NOT called
 * - On both retry success and failure, safeSendMessage is called with
 *   type: 'UPDATE_LOG_ENTRY' (NOT type: 'LOG')
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
 */

var test = require('node:test');
var assert = require('node:assert/strict');
var fc = require('fast-check');

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

var safeSendMessageCalls = [];
var unlockTabCalled = false;
var runStepLoopCalled = false;
var sendStepResult = { ok: false, error: 'Simulated retry failure' };

global.chrome = {
  runtime: {
    onMessage: { addListener: function () {}, removeListener: function () {} },
    onConnect: { addListener: function () {} },
    sendMessage: function (msg) {
      safeSendMessageCalls.push(msg);
      return Promise.resolve();
    }
  },
  tabs: {
    query: function () { return Promise.resolve([]); },
    update: function () { return Promise.resolve(); },
    sendMessage: function () {
      return Promise.resolve(sendStepResult);
    },
    onCreated: { addListener: function () {}, removeListener: function () {} },
    onRemoved: { addListener: function () {}, removeListener: function () {} },
    onActivated: { addListener: function () {}, removeListener: function () {} }
  }
};
global.getProject = function () { return Promise.resolve(null); };

var bg = require('./background.js');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a step action (non-upload, non-navigate, non-task) */
var stepActionArb = fc.constantFrom('click', 'type', 'assertExists', 'assertHasText', 'assertVisible');

/** Generate a target element name */
var targetArb = fc.constantFrom('button', 'input', 'link', 'heading', 'form');

/** Generate a simple value for steps */
var valueArb = fc.string({ minLength: 0, maxLength: 20 })
  .filter(function (s) { return s.indexOf('{{') === -1 && s.indexOf('$random') === -1; });

/** Generate a step object */
var stepArb = fc.record({
  action: stepActionArb,
  target: targetArb,
  value: valueArb
});

/** Generate an error message for failed retries */
var errorArb = fc.constantFrom(
  'Element not found',
  'Timeout waiting for element',
  'Assertion failed: text mismatch',
  'Element not visible',
  'Click intercepted by overlay'
);

/** Generate a step index (0-based, reasonable range) */
var stepIndexArb = fc.nat({ max: 20 });

/** Generate a retry attempt count (starting state before the call increments it) */
var retryAttemptArb = fc.nat({ max: 10 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks() {
  safeSendMessageCalls = [];
  unlockTabCalled = false;
  runStepLoopCalled = false;
}

function setupRunStateForRetry(stepIndex, step, retryAttempt) {
  bg.resetRunState();
  bg.runState.running = true;
  bg.runState.awaitingAction = true;
  bg.runState.failedStepIndex = stepIndex;
  bg.runState.retryAttempt = retryAttempt;
  bg.runState.lockedTabId = 42;
  bg.runState.steps = [];
  // Fill steps up to and including the failed index
  for (var i = 0; i <= stepIndex; i++) {
    if (i === stepIndex) {
      bg.runState.steps.push(step);
    } else {
      bg.runState.push({ action: 'click', target: 'button', value: '' });
    }
  }
  bg.runState.steps[stepIndex] = step;
}

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — Retry failure should keep run alive
// ---------------------------------------------------------------------------

test('Property 1 (Bug Condition): Retry failure keeps run in awaitingAction state', function () {
  /**
   * Validates: Requirements 1.1, 2.1
   *
   * For any step and step index, when handleRetryStep is called and
   * sendStepToRuntime returns { ok: false }, the run should remain alive:
   * - runState.awaitingAction should remain true
   * - runState.running should remain true
   * - runState.retryAttempt should be incremented
   *
   * On UNFIXED code, this FAILS because the else branch sets:
   * - runState.awaitingAction = false
   * - runState.running = false
   * - calls unlockTab()
   * - emits RUN_COMPLETE
   */
  return fc.assert(
    fc.asyncProperty(
      stepArb,
      stepIndexArb,
      errorArb,
      retryAttemptArb,
      function (step, stepIndex, errorMsg, prevRetryAttempt) {
        resetMocks();

        // Configure sendStepToRuntime to return failure
        sendStepResult = { ok: false, error: errorMsg };
        global.chrome.tabs.sendMessage = function () {
          return Promise.resolve(sendStepResult);
        };

        // Set up run state
        bg.resetRunState();
        bg.runState.running = true;
        bg.runState.awaitingAction = true;
        bg.runState.failedStepIndex = stepIndex;
        bg.runState.retryAttempt = prevRetryAttempt;
        bg.runState.lockedTabId = 42;
        bg.runState.steps = [];
        for (var i = 0; i <= stepIndex; i++) {
          bg.runState.steps.push(i === stepIndex ? step : { action: 'click', target: 'button', value: '' });
        }

        // Call handleRetryStep
        bg.handleRetryStep({ type: 'RETRY_STEP', stepIndex: stepIndex });

        // Wait for the async .then() to resolve
        return new Promise(function (resolve) {
          setTimeout(resolve, 50);
        }).then(function () {
          // Assert: run remains alive
          assert.equal(bg.runState.awaitingAction, true,
            'runState.awaitingAction should remain true after failed retry, but got false');
          assert.equal(bg.runState.running, true,
            'runState.running should remain true after failed retry, but got false');
          assert.equal(bg.runState.retryAttempt, prevRetryAttempt + 1,
            'runState.retryAttempt should be incremented from ' + prevRetryAttempt + ' to ' + (prevRetryAttempt + 1));
        });
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — unlockTab NOT called on retry failure
// ---------------------------------------------------------------------------

test('Property 1 (Bug Condition): unlockTab is NOT called on retry failure', function () {
  /**
   * Validates: Requirements 1.1, 2.1
   *
   * When a retry fails, the tab should remain locked (user needs to try again).
   * On UNFIXED code, this FAILS because unlockTab() is explicitly called
   * in the else branch.
   */
  return fc.assert(
    fc.asyncProperty(
      stepArb,
      stepIndexArb,
      errorArb,
      function (step, stepIndex, errorMsg) {
        resetMocks();

        sendStepResult = { ok: false, error: errorMsg };
        global.chrome.tabs.sendMessage = function () {
          return Promise.resolve(sendStepResult);
        };

        bg.resetRunState();
        bg.runState.running = true;
        bg.runState.awaitingAction = true;
        bg.runState.failedStepIndex = stepIndex;
        bg.runState.retryAttempt = 0;
        bg.runState.lockedTabId = 42;
        bg.runState.steps = [];
        for (var i = 0; i <= stepIndex; i++) {
          bg.runState.steps.push(i === stepIndex ? step : { action: 'click', target: 'button', value: '' });
        }

        bg.handleRetryStep({ type: 'RETRY_STEP', stepIndex: stepIndex });

        return new Promise(function (resolve) {
          setTimeout(resolve, 50);
        }).then(function () {
          // Tab should still be locked
          assert.equal(bg.runState.lockedTabId, 42,
            'lockedTabId should remain 42 (tab should stay locked), but got ' + bg.runState.lockedTabId);
        });
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — STEP_FAILED_AWAITING_ACTION emitted (not RUN_COMPLETE)
// ---------------------------------------------------------------------------

test('Property 1 (Bug Condition): safeSendMessage emits STEP_FAILED_AWAITING_ACTION, not RUN_COMPLETE', function () {
  /**
   * Validates: Requirements 1.1, 2.1
   *
   * After a failed retry, the system should re-emit STEP_FAILED_AWAITING_ACTION
   * so the panel shows retry/skip buttons again.
   * It should NOT emit RUN_COMPLETE (the run is not over).
   *
   * On UNFIXED code, this FAILS because the else branch emits RUN_COMPLETE
   * via emitSummary() and never emits STEP_FAILED_AWAITING_ACTION.
   */
  return fc.assert(
    fc.asyncProperty(
      stepArb,
      stepIndexArb,
      errorArb,
      function (step, stepIndex, errorMsg) {
        resetMocks();

        sendStepResult = { ok: false, error: errorMsg };
        global.chrome.tabs.sendMessage = function () {
          return Promise.resolve(sendStepResult);
        };

        bg.resetRunState();
        bg.runState.running = true;
        bg.runState.awaitingAction = true;
        bg.runState.failedStepIndex = stepIndex;
        bg.runState.retryAttempt = 0;
        bg.runState.lockedTabId = 42;
        bg.runState.steps = [];
        for (var i = 0; i <= stepIndex; i++) {
          bg.runState.steps.push(i === stepIndex ? step : { action: 'click', target: 'button', value: '' });
        }

        bg.handleRetryStep({ type: 'RETRY_STEP', stepIndex: stepIndex });

        return new Promise(function (resolve) {
          setTimeout(resolve, 50);
        }).then(function () {
          // Should have emitted STEP_FAILED_AWAITING_ACTION
          var stepFailedMsgs = safeSendMessageCalls.filter(function (msg) {
            return msg && msg.type === 'STEP_FAILED_AWAITING_ACTION';
          });
          assert.ok(stepFailedMsgs.length > 0,
            'safeSendMessage should emit STEP_FAILED_AWAITING_ACTION on retry failure, ' +
            'but got message types: ' + JSON.stringify(safeSendMessageCalls.map(function (m) { return m.type; })));

          // Should NOT have emitted RUN_COMPLETE
          var runCompleteMsgs = safeSendMessageCalls.filter(function (msg) {
            return msg && msg.type === 'RUN_COMPLETE';
          });
          assert.equal(runCompleteMsgs.length, 0,
            'safeSendMessage should NOT emit RUN_COMPLETE on retry failure, ' +
            'but it did: ' + JSON.stringify(runCompleteMsgs));
        });
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — UPDATE_LOG_ENTRY emitted (not LOG) on retry failure
// ---------------------------------------------------------------------------

test('Property 1 (Bug Condition): retry failure emits UPDATE_LOG_ENTRY, not LOG', function () {
  /**
   * Validates: Requirements 1.2, 2.2
   *
   * On retry failure, the system should emit UPDATE_LOG_ENTRY to update
   * the existing log entry in-place, not a new LOG message that would
   * append a duplicate row.
   *
   * On UNFIXED code, this FAILS because the else branch emits { type: 'LOG' }.
   */
  return fc.assert(
    fc.asyncProperty(
      stepArb,
      stepIndexArb,
      errorArb,
      function (step, stepIndex, errorMsg) {
        resetMocks();

        sendStepResult = { ok: false, error: errorMsg };
        global.chrome.tabs.sendMessage = function () {
          return Promise.resolve(sendStepResult);
        };

        bg.resetRunState();
        bg.runState.running = true;
        bg.runState.awaitingAction = true;
        bg.runState.failedStepIndex = stepIndex;
        bg.runState.retryAttempt = 0;
        bg.runState.lockedTabId = 42;
        bg.runState.steps = [];
        for (var i = 0; i <= stepIndex; i++) {
          bg.runState.steps.push(i === stepIndex ? step : { action: 'click', target: 'button', value: '' });
        }

        bg.handleRetryStep({ type: 'RETRY_STEP', stepIndex: stepIndex });

        return new Promise(function (resolve) {
          setTimeout(resolve, 50);
        }).then(function () {
          // Should NOT have emitted LOG type
          var logMsgs = safeSendMessageCalls.filter(function (msg) {
            return msg && msg.type === 'LOG';
          });
          assert.equal(logMsgs.length, 0,
            'safeSendMessage should NOT emit type "LOG" on retry, ' +
            'but got: ' + JSON.stringify(logMsgs));

          // Should have emitted UPDATE_LOG_ENTRY
          var updateMsgs = safeSendMessageCalls.filter(function (msg) {
            return msg && msg.type === 'UPDATE_LOG_ENTRY';
          });
          assert.ok(updateMsgs.length > 0,
            'safeSendMessage should emit UPDATE_LOG_ENTRY on retry failure, ' +
            'but got message types: ' + JSON.stringify(safeSendMessageCalls.map(function (m) { return m.type; })));
        });
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — UPDATE_LOG_ENTRY emitted (not LOG) on retry success
// ---------------------------------------------------------------------------

test('Property 1 (Bug Condition): retry success emits UPDATE_LOG_ENTRY, not LOG', function () {
  /**
   * Validates: Requirements 1.3, 2.3
   *
   * On retry success, the system should emit UPDATE_LOG_ENTRY to update
   * the existing log entry in-place (showing pass with retry count),
   * not a new LOG message.
   *
   * On UNFIXED code, this FAILS because the success branch emits { type: 'LOG' }.
   */
  return fc.assert(
    fc.asyncProperty(
      stepArb,
      stepIndexArb,
      retryAttemptArb,
      function (step, stepIndex, prevRetryAttempt) {
        resetMocks();

        // Configure sendStepToRuntime to return success
        sendStepResult = { ok: true };
        global.chrome.tabs.sendMessage = function () {
          return Promise.resolve({ ok: true });
        };

        bg.resetRunState();
        bg.runState.running = true;
        bg.runState.awaitingAction = true;
        bg.runState.failedStepIndex = stepIndex;
        bg.runState.retryAttempt = prevRetryAttempt;
        bg.runState.lockedTabId = 42;
        bg.runState.stepIndex = stepIndex;
        bg.runState.steps = [];
        for (var i = 0; i <= stepIndex + 1; i++) {
          bg.runState.steps.push(i === stepIndex ? step : { action: 'click', target: 'button', value: '' });
        }

        bg.handleRetryStep({ type: 'RETRY_STEP', stepIndex: stepIndex });

        return new Promise(function (resolve) {
          setTimeout(resolve, 50);
        }).then(function () {
          // Should NOT have emitted LOG type
          var logMsgs = safeSendMessageCalls.filter(function (msg) {
            return msg && msg.type === 'LOG';
          });
          assert.equal(logMsgs.length, 0,
            'safeSendMessage should NOT emit type "LOG" on retry success, ' +
            'but got: ' + JSON.stringify(logMsgs));

          // Should have emitted UPDATE_LOG_ENTRY
          var updateMsgs = safeSendMessageCalls.filter(function (msg) {
            return msg && msg.type === 'UPDATE_LOG_ENTRY';
          });
          assert.ok(updateMsgs.length > 0,
            'safeSendMessage should emit UPDATE_LOG_ENTRY on retry success, ' +
            'but got message types: ' + JSON.stringify(safeSendMessageCalls.map(function (m) { return m.type; })));
        });
      }
    ),
    { numRuns: 50 }
  );
});
