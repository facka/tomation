'use strict';

/**
 * Bug Condition Exploration Test — Content Script Connection Error
 *
 * Property 1: Bug Condition - Connection Error Produces Unhandled Rejection
 *
 * This test is EXPECTED TO FAIL on unfixed code. Failure confirms the bug exists:
 * - sendStepToRuntime returns a rejected promise that no caller handles
 * - sendUploadToRuntime's .then() is never reached and no .catch() exists
 *
 * The test encodes the EXPECTED (correct) behavior after the fix:
 * - sendStepToRuntime resolves with { ok: false, error: <string containing "content script"> }
 * - sendUploadToRuntime resolves gracefully (emits LOG with error, sends RUN_COMPLETE)
 * - runState.running === false after the connection error (run halted gracefully)
 * - safeSendMessage was called with a RUN_COMPLETE message containing the error
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2
 */

var test = require('node:test');
var assert = require('node:assert/strict');
var fc = require('fast-check');

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

var CONNECTION_ERROR_MSG = 'Could not establish connection. Receiving end does not exist.';

var safeSendMessageCalls = [];

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
      return Promise.reject(new Error(CONNECTION_ERROR_MSG));
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

/** Generate a step object suitable for sendStepToRuntime */
var stepArb = fc.record({
  action: stepActionArb,
  target: targetArb,
  value: valueArb
});

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — sendStepToRuntime resolves with failure object
// ---------------------------------------------------------------------------

test('Property 1 (Bug Condition): sendStepToRuntime resolves with { ok: false } on connection error', function () {
  /**
   * Validates: Requirements 1.1, 2.1
   *
   * For any step object, when api.tabs.sendMessage rejects with
   * "Could not establish connection. Receiving end does not exist.",
   * sendStepToRuntime SHOULD resolve (not reject) with { ok: false, error: <string> }
   * where error contains "content script".
   *
   * On UNFIXED code, this will FAIL because sendStepToRuntime propagates
   * the rejection — it returns api.tabs.sendMessage() directly without .catch().
   */
  return fc.assert(
    fc.asyncProperty(
      stepArb,
      fc.nat({ max: 20 }),
      function (step, stepIndex) {
        // Reset state
        bg.resetRunState();
        bg.runState.running = true;
        bg.runState.lockedTabId = 42;

        // Mock sendMessage to reject with the connection error
        global.chrome.tabs.sendMessage = function () {
          return Promise.reject(new Error(CONNECTION_ERROR_MSG));
        };

        return bg.sendStepToRuntime(step, stepIndex).then(function (result) {
          // The function should resolve with a failure object
          assert.ok(result, 'sendStepToRuntime should resolve with a result object');
          assert.equal(result.ok, false, 'result.ok should be false');
          assert.ok(
            typeof result.error === 'string' && result.error.toLowerCase().indexOf('content script') !== -1,
            'result.error should contain "content script", got: ' + (result.error || 'undefined')
          );
        });
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — sendUploadToRuntime resolves gracefully
// ---------------------------------------------------------------------------

test('Property 1 (Bug Condition): upload step connection error halts run gracefully', function () {
  /**
   * Validates: Requirements 1.2, 2.2
   *
   * When an upload step is sent to a tab without content script,
   * the run should halt gracefully: emits LOG with error, sends RUN_COMPLETE,
   * and sets runState.running = false.
   *
   * On UNFIXED code, this will FAIL because sendUploadToRuntime has no .catch()
   * on the api.tabs.sendMessage call — the .then() is never reached and the
   * rejection propagates unhandled.
   */
  return fc.assert(
    fc.asyncProperty(
      targetArb,
      valueArb,
      function (target, value) {
        // Reset state
        bg.resetRunState();
        bg.runState.running = true;
        bg.runState.lockedTabId = 42;
        bg.runState.steps = [{ action: 'upload', target: target, value: value }];
        bg.runState.stepIndex = 0;
        bg.runState.passCount = 0;
        bg.runState.failCount = 0;
        safeSendMessageCalls = [];

        // Mock sendMessage to reject with the connection error
        global.chrome.tabs.sendMessage = function () {
          return Promise.reject(new Error(CONNECTION_ERROR_MSG));
        };

        // Start a run with an upload step — this exercises handleUploadStep → sendUploadToRuntime
        var testObj = { name: 'test', steps: [{ action: 'upload', target: target, value: value }] };
        var spec = {
          tasks: {},
          pageElements: {}
        };
        spec.pageElements[target] = { tag: 'input', where: { id: target } };

        return bg.startRun(42, testObj, spec, [0], {
          allowContinueOnFailure: false,
          allowRetryOnFailure: false,
          executionSpeed: null
        }).then(function () {
          // After the run, it should have halted gracefully
          assert.equal(bg.runState.running, false,
            'runState.running should be false after connection error');

          // A RUN_COMPLETE message should have been sent
          var runCompleteMessages = safeSendMessageCalls.filter(function (msg) {
            return msg && msg.type === 'RUN_COMPLETE';
          });
          assert.ok(runCompleteMessages.length > 0,
            'safeSendMessage should have been called with RUN_COMPLETE');
        });
      }
    ),
    { numRuns: 20 }
  );
});

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — full run with connection error halts gracefully
// ---------------------------------------------------------------------------

test('Property 1 (Bug Condition): full run halts gracefully on connection error', function () {
  /**
   * Validates: Requirements 1.1, 1.3, 2.1
   *
   * When a regular step is sent during a run and the content script is not loaded,
   * the run should halt gracefully: runState.running === false,
   * and safeSendMessage is called with RUN_COMPLETE.
   *
   * On UNFIXED code, this will FAIL because the rejected promise from
   * sendStepToRuntime propagates through runStepLoop's .then() chain,
   * causing an unhandled rejection instead of a graceful halt.
   */
  return fc.assert(
    fc.asyncProperty(
      stepArb,
      function (step) {
        // Reset state
        bg.resetRunState();
        safeSendMessageCalls = [];

        // Mock sendMessage to reject with the connection error
        global.chrome.tabs.sendMessage = function () {
          return Promise.reject(new Error(CONNECTION_ERROR_MSG));
        };
        global.chrome.tabs.update = function () { return Promise.resolve(); };

        var testObj = { name: 'test', steps: [step] };
        var spec = {
          tasks: {},
          pageElements: {}
        };
        spec.pageElements[step.target] = { tag: 'input', where: { id: step.target } };

        return bg.startRun(42, testObj, spec, [0], {
          allowContinueOnFailure: false,
          allowRetryOnFailure: false,
          executionSpeed: null
        }).then(function () {
          // Run should have halted gracefully
          assert.equal(bg.runState.running, false,
            'runState.running should be false after connection error');

          // A RUN_COMPLETE message should have been sent via safeSendMessage
          var runCompleteMessages = safeSendMessageCalls.filter(function (msg) {
            return msg && msg.type === 'RUN_COMPLETE';
          });
          assert.ok(runCompleteMessages.length > 0,
            'safeSendMessage should have been called with RUN_COMPLETE, got: ' +
            JSON.stringify(safeSendMessageCalls.map(function (m) { return m.type; }))
          );

          // The RUN_COMPLETE message should indicate failure
          var runComplete = runCompleteMessages[0];
          assert.ok(runComplete.failed > 0,
            'RUN_COMPLETE should report at least 1 failure');
        });
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — safeSendMessage called with RUN_COMPLETE
// containing error info after connection failure
// ---------------------------------------------------------------------------

test('Property 1 (Bug Condition): LOG message contains content script error info', function () {
  /**
   * Validates: Requirements 1.3, 2.1
   *
   * When the connection error occurs, a LOG message should be emitted
   * (via safeSendMessage) containing error info about the content script
   * not being available.
   *
   * On UNFIXED code, this will FAIL because no LOG is emitted at all —
   * the rejection bypasses the emitLog call entirely.
   */
  return fc.assert(
    fc.asyncProperty(
      stepArb,
      function (step) {
        // Reset state
        bg.resetRunState();
        safeSendMessageCalls = [];

        // Mock sendMessage to reject with the connection error
        global.chrome.tabs.sendMessage = function () {
          return Promise.reject(new Error(CONNECTION_ERROR_MSG));
        };
        global.chrome.tabs.update = function () { return Promise.resolve(); };

        var testObj = { name: 'test', steps: [step] };
        var spec = {
          tasks: {},
          pageElements: {}
        };
        spec.pageElements[step.target] = { tag: 'input', where: { id: step.target } };

        return bg.startRun(42, testObj, spec, [0], {
          allowContinueOnFailure: false,
          allowRetryOnFailure: false,
          executionSpeed: null
        }).then(function () {
          // A LOG message should have been emitted with error info
          var logMessages = safeSendMessageCalls.filter(function (msg) {
            return msg && msg.type === 'LOG';
          });
          assert.ok(logMessages.length > 0,
            'A LOG message should have been emitted for the failed step');

          var logMsg = logMessages[logMessages.length - 1];
          assert.equal(logMsg.ok, false,
            'LOG message should have ok=false');
          assert.ok(
            typeof logMsg.error === 'string' && logMsg.error.toLowerCase().indexOf('content script') !== -1,
            'LOG error should mention "content script", got: ' + (logMsg.error || 'undefined')
          );
        });
      }
    ),
    { numRuns: 50 }
  );
});
