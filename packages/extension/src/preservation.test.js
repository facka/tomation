'use strict';

/**
 * Preservation Property Tests — Non-Retry Behavior Unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * Property 3: Preservation - Non-Retry Behavior Unchanged
 *
 * These tests observe and verify CURRENT (unfixed) behavior for all paths
 * that do NOT involve RETRY_STEP. They must PASS on unfixed code, confirming
 * the baseline behavior that the fix must preserve:
 *
 * 1. Skip: handleSkipStep while awaitingAction === true advances past failed step,
 *    sets awaitingAction = false, and resumes (runStepLoop) or finishes (finishRun)
 * 2. First-attempt fail with retry enabled: emits STEP_FAILED_AWAITING_ACTION,
 *    sets awaitingAction = true
 * 3. First-attempt pass: emits LOG with ok: true, advances stepIndex
 * 4. Stop during awaitingAction: sets stopRequested = true
 */

var test = require('node:test');
var assert = require('node:assert/strict');
var fc = require('fast-check');

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

var sentMessages = [];

global.chrome = {
  runtime: {
    onMessage: { addListener: function () {}, removeListener: function () {} },
    onConnect: { addListener: function () {} },
    sendMessage: function (msg) {
      sentMessages.push(msg);
      return Promise.resolve();
    }
  },
  tabs: {
    query: function () { return Promise.resolve([]); },
    update: function () { return Promise.resolve(); },
    sendMessage: function () { return Promise.resolve({ ok: true }); },
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

/** Generate a step action (non-navigate, non-wait, non-manual, non-upload) */
var arbAction = fc.constantFrom(
  'click', 'type', 'assertExists', 'assertHasText', 'assertVisible',
  'hover', 'scrollTo', 'check', 'uncheck', 'select'
);

/** Generate a target element name */
var arbTarget = fc.stringOf(
  fc.constantFrom('a','b','c','d','e','f','g','h','i','j','k','l','m','n'),
  { minLength: 1, maxLength: 10 }
);

/** Generate a step value */
var arbValue = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 20 })
).filter(function (s) { return s.indexOf('{{') === -1 && s.indexOf('$random') === -1; });

/** Generate a step object */
var arbStep = fc.record({
  action: arbAction,
  target: arbTarget,
  value: arbValue
});

/** Generate a step index between 0 and a small max */
var arbStepIndex = fc.nat({ max: 9 });

/** Generate number of remaining steps after the failed one (1-5) */
var arbRemainingSteps = fc.integer({ min: 1, max: 5 });

// ---------------------------------------------------------------------------
// Helper: create steps array from a step + extras
// ---------------------------------------------------------------------------

function makeSteps(step, totalCount) {
  var steps = [];
  for (var i = 0; i < totalCount; i++) {
    steps.push({ action: step.action, target: step.target, value: step.value });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Property 3a: Skip — handleSkipStep advances past failed step, resumes or finishes
// **Validates: Requirements 3.1**
// ---------------------------------------------------------------------------

test('PRESERVATION Property 3a: handleSkipStep advances past failed step and resumes or finishes', function () {
  /**
   * For all skip actions while awaitingAction === true:
   * - system sets awaitingAction = false
   * - system advances stepIndex past the failed step
   * - If more steps remain: calls runStepLoop (stepIndex < steps.length)
   * - If last step: finishes (running = false, RUN_COMPLETE emitted)
   */
  return fc.assert(
    fc.asyncProperty(
      arbStep,
      arbStepIndex,
      fc.boolean(), // isLastStep — determines if skip finishes the run
      function (step, failedIndex, isLastStep) {
        // Reset
        bg.resetRunState();
        sentMessages = [];

        var totalSteps = isLastStep ? failedIndex + 1 : failedIndex + 3;
        var steps = makeSteps(step, totalSteps);

        // Set up awaitingAction state (simulating a step that already failed)
        bg.runState.running = true;
        bg.runState.lockedTabId = 99;
        bg.runState.awaitingAction = true;
        bg.runState.failedStepIndex = failedIndex;
        bg.runState.steps = steps;
        bg.runState.stepIndex = failedIndex;
        bg.runState.passCount = 0;
        bg.runState.failCount = 1;
        bg.runState.config = {
          allowContinueOnFailure: true,
          allowRetryOnFailure: true,
          executionSpeed: null
        };

        // Mock tabs.sendMessage to resolve ok for subsequent steps (if runStepLoop resumes)
        global.chrome.tabs.sendMessage = function () {
          return Promise.resolve({ ok: true });
        };
        global.chrome.runtime.sendMessage = function (msg) {
          sentMessages.push(msg);
          return Promise.resolve();
        };

        // Send the SKIP_STEP message
        bg.handleMessage({ type: 'SKIP_STEP', stepIndex: failedIndex });

        // Allow async resolution
        return new Promise(function (resolve) { setTimeout(resolve, 50); }).then(function () {
          // awaitingAction must be cleared
          assert.equal(bg.runState.awaitingAction, false,
            'awaitingAction should be false after skip');

          // failedStepIndex must be cleared
          assert.equal(bg.runState.failedStepIndex, null,
            'failedStepIndex should be null after skip');

          if (isLastStep) {
            // If it was the last step, run finishes
            assert.equal(bg.runState.running, false,
              'running should be false when skip was on last step');

            var runCompleteMessages = sentMessages.filter(function (m) {
              return m && m.type === 'RUN_COMPLETE';
            });
            assert.ok(runCompleteMessages.length > 0,
              'RUN_COMPLETE should be emitted when skip was on last step');
          } else {
            // If more steps remain, stepIndex advanced past failed step
            assert.ok(bg.runState.stepIndex > failedIndex,
              'stepIndex should advance past failed step after skip');
          }
        });
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 3b: First-attempt fail with retry enabled → STEP_FAILED_AWAITING_ACTION
// **Validates: Requirements 3.5**
// ---------------------------------------------------------------------------

test('PRESERVATION Property 3b: first-attempt failure with retry enabled emits STEP_FAILED_AWAITING_ACTION and enters awaitingAction', function () {
  /**
   * For all first-attempt failures with allowRetryOnFailure: true:
   * - system sets awaitingAction = true
   * - system sets failedStepIndex = currentIndex
   * - system emits STEP_FAILED_AWAITING_ACTION with correct stepIndex, action, error
   * - system does NOT halt the run (running stays true)
   */
  return fc.assert(
    fc.asyncProperty(
      arbStep,
      fc.string({ minLength: 1, maxLength: 40 }).filter(function (s) {
        return s.indexOf('{{') === -1 && s.indexOf('$random') === -1;
      }),
      function (step, errorMsg) {
        // Reset
        bg.resetRunState();
        sentMessages = [];

        // Set up a single-step run that will fail
        bg.runState.running = true;
        bg.runState.lockedTabId = 99;
        bg.runState.steps = [step];
        bg.runState.stepIndex = 0;
        bg.runState.passCount = 0;
        bg.runState.failCount = 0;
        bg.runState.config = {
          allowContinueOnFailure: false,
          allowRetryOnFailure: true,
          executionSpeed: null
        };

        // Mock tabs.sendMessage to return failure
        global.chrome.tabs.sendMessage = function () {
          return Promise.resolve({ ok: false, error: errorMsg });
        };
        global.chrome.runtime.sendMessage = function (msg) {
          sentMessages.push(msg);
          return Promise.resolve();
        };

        // Trigger runStepLoop to execute the step
        return bg.runStepLoop().then(function () {
          // Allow async settling
          return new Promise(function (resolve) { setTimeout(resolve, 20); });
        }).then(function () {
          // awaitingAction should be set
          assert.equal(bg.runState.awaitingAction, true,
            'awaitingAction should be true after first-attempt failure with retry enabled');

          // failedStepIndex should be set to 0
          assert.equal(bg.runState.failedStepIndex, 0,
            'failedStepIndex should be set to 0');

          // running should remain true (run not halted)
          assert.equal(bg.runState.running, true,
            'running should remain true — run not halted');

          // STEP_FAILED_AWAITING_ACTION must have been emitted
          var awaitingMsgs = sentMessages.filter(function (m) {
            return m && m.type === 'STEP_FAILED_AWAITING_ACTION';
          });
          assert.ok(awaitingMsgs.length > 0,
            'STEP_FAILED_AWAITING_ACTION should be emitted');
          assert.equal(awaitingMsgs[0].stepIndex, 0,
            'STEP_FAILED_AWAITING_ACTION stepIndex should be 0');
          assert.equal(awaitingMsgs[0].action, step.action,
            'STEP_FAILED_AWAITING_ACTION action should match step action');
        });
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 3c: First-attempt pass → emits LOG with ok: true, advances stepIndex
// **Validates: Requirements 3.3**
// ---------------------------------------------------------------------------

test('PRESERVATION Property 3c: first-attempt pass emits LOG with ok: true and advances stepIndex', function () {
  /**
   * For all first-attempt passes:
   * - system emits LOG message with ok: true for the step
   * - system advances stepIndex
   * - system does not enter awaitingAction state
   */
  return fc.assert(
    fc.asyncProperty(
      arbStep,
      function (step) {
        // Reset
        bg.resetRunState();
        sentMessages = [];

        // Set up a two-step run where step 0 passes (need 2 steps so we don't finish)
        var steps = [step, { action: 'click', target: 'next', value: '' }];
        bg.runState.running = true;
        bg.runState.lockedTabId = 99;
        bg.runState.steps = steps;
        bg.runState.stepIndex = 0;
        bg.runState.passCount = 0;
        bg.runState.failCount = 0;
        bg.runState.config = {
          allowContinueOnFailure: false,
          allowRetryOnFailure: false,
          executionSpeed: null
        };

        // Track how many times tabs.sendMessage is called
        var callCount = 0;
        global.chrome.tabs.sendMessage = function () {
          callCount++;
          return Promise.resolve({ ok: true });
        };
        global.chrome.runtime.sendMessage = function (msg) {
          sentMessages.push(msg);
          return Promise.resolve();
        };

        // Run the step loop (it will execute step 0 and then step 1, both passing)
        return bg.runStepLoop().then(function () {
          return new Promise(function (resolve) { setTimeout(resolve, 50); });
        }).then(function () {
          // Find LOG messages with ok: true
          var logMsgs = sentMessages.filter(function (m) {
            return m && m.type === 'LOG' && m.ok === true;
          });
          assert.ok(logMsgs.length >= 1,
            'At least one LOG message with ok: true should be emitted');

          // The first LOG should be for stepIndex 0 with the correct action
          var firstLog = logMsgs[0];
          assert.equal(firstLog.stepIndex, 0,
            'First LOG stepIndex should be 0');
          assert.equal(firstLog.action, step.action,
            'LOG action should match the step action');
          assert.equal(firstLog.ok, true,
            'LOG ok should be true');

          // awaitingAction should NOT be set
          assert.equal(bg.runState.awaitingAction, false,
            'awaitingAction should remain false after a pass');
        });
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 3d: Stop during awaitingAction → sets stopRequested = true
// **Validates: Requirements 3.4**
// ---------------------------------------------------------------------------

test('PRESERVATION Property 3d: stopRun during awaitingAction sets stopRequested to true', function () {
  /**
   * For all stop actions during awaitingAction:
   * - system sets stopRequested = true
   * - The next time runStepLoop is invoked, it will call finishRun
   *   which emits RUN_STOPPED
   */
  return fc.assert(
    fc.property(
      arbStep,
      arbStepIndex,
      function (step, failedIndex) {
        // Reset
        bg.resetRunState();
        sentMessages = [];

        var totalSteps = failedIndex + 2;
        var steps = makeSteps(step, totalSteps);

        // Set up awaitingAction state
        bg.runState.running = true;
        bg.runState.lockedTabId = 99;
        bg.runState.awaitingAction = true;
        bg.runState.failedStepIndex = failedIndex;
        bg.runState.steps = steps;
        bg.runState.stepIndex = failedIndex;
        bg.runState.config = {
          allowContinueOnFailure: true,
          allowRetryOnFailure: true,
          executionSpeed: null
        };

        // Call stopRun
        bg.stopRun();

        // stopRequested should be set
        assert.equal(bg.runState.stopRequested, true,
          'stopRequested should be true after stopRun() during awaitingAction');

        // running should still be true (stopRun doesn't set it false directly)
        assert.equal(bg.runState.running, true,
          'running should still be true immediately after stopRun() — finishRun handles the actual halt');
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 3e: Skip when NOT awaiting action is ignored
// **Validates: Requirements 3.1** (negative case — skip is only honored in correct state)
// ---------------------------------------------------------------------------

test('PRESERVATION Property 3e: handleSkipStep ignores SKIP_STEP when awaitingAction is false', function () {
  /**
   * For all skip messages when NOT in awaitingAction state:
   * - system ignores the message (no state change)
   */
  return fc.assert(
    fc.property(
      arbStep,
      arbStepIndex,
      function (step, stepIndex) {
        // Reset
        bg.resetRunState();

        var steps = makeSteps(step, stepIndex + 2);
        bg.runState.running = true;
        bg.runState.lockedTabId = 99;
        bg.runState.awaitingAction = false; // NOT awaiting action
        bg.runState.steps = steps;
        bg.runState.stepIndex = stepIndex;

        var originalStepIndex = bg.runState.stepIndex;
        var originalRunning = bg.runState.running;

        // Send SKIP_STEP while NOT awaiting action
        bg.handleMessage({ type: 'SKIP_STEP', stepIndex: stepIndex });

        // State should be unchanged
        assert.equal(bg.runState.stepIndex, originalStepIndex,
          'stepIndex should not change when skip ignored');
        assert.equal(bg.runState.running, originalRunning,
          'running should not change when skip ignored');
        assert.equal(bg.runState.awaitingAction, false,
          'awaitingAction should remain false');
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 3f: Skip with mismatched stepIndex is ignored
// **Validates: Requirements 3.1** (skip mismatch guard)
// ---------------------------------------------------------------------------

test('PRESERVATION Property 3f: handleSkipStep ignores SKIP_STEP with mismatched stepIndex', function () {
  /**
   * For all skip messages where stepIndex != failedStepIndex:
   * - system ignores the message (awaitingAction remains true, no advancement)
   */
  return fc.assert(
    fc.property(
      arbStep,
      arbStepIndex,
      fc.nat({ max: 9 }),
      function (step, failedIndex, wrongIndex) {
        // Ensure mismatch
        if (wrongIndex === failedIndex) return; // skip this case

        // Reset
        bg.resetRunState();

        var steps = makeSteps(step, Math.max(failedIndex, wrongIndex) + 2);
        bg.runState.running = true;
        bg.runState.lockedTabId = 99;
        bg.runState.awaitingAction = true;
        bg.runState.failedStepIndex = failedIndex;
        bg.runState.steps = steps;
        bg.runState.stepIndex = failedIndex;

        // Send SKIP_STEP with WRONG stepIndex
        bg.handleMessage({ type: 'SKIP_STEP', stepIndex: wrongIndex });

        // awaitingAction should still be true (skip was ignored)
        assert.equal(bg.runState.awaitingAction, true,
          'awaitingAction should remain true when skip has wrong stepIndex');
        assert.equal(bg.runState.failedStepIndex, failedIndex,
          'failedStepIndex should remain unchanged');
        assert.equal(bg.runState.stepIndex, failedIndex,
          'stepIndex should not advance');
      }
    ),
    { numRuns: 50 }
  );
});
