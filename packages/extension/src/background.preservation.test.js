// background.preservation.test.js — Property-based preservation tests
// **Validates: Requirements 3.1, 3.2, 3.3**
//
// These tests verify that EXISTING behavior is preserved on unfixed code:
// - Normal step execution passes through results unchanged
// - Non-connection failures flow through existing LOG/RUN_COMPLETE unchanged
// - safeSendMessage logs errors without crashing

var test = require('node:test');
var assert = require('node:assert/strict');
var fc = require('fast-check');

// Mock chrome/browser global before requiring background.js
global.chrome = {
  runtime: {
    onMessage: {
      addListener: function () {},
      removeListener: function () {}
    },
    onConnect: {
      addListener: function () {}
    },
    sendMessage: function () { return Promise.resolve(); }
  },
  tabs: {
    query: function () { return Promise.resolve([]); },
    update: function () { return Promise.resolve(); },
    sendMessage: function () { return Promise.resolve({ ok: true }); },
    onCreated: {
      addListener: function () {},
      removeListener: function () {}
    },
    onRemoved: {
      addListener: function () {},
      removeListener: function () {}
    },
    onActivated: {
      addListener: function () {},
      removeListener: function () {}
    }
  }
};

// Mock getProject global (normally provided by storage.js)
global.getProject = function () { return Promise.resolve(null); };

var bg = require('./background.js');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// Generate arbitrary step action names (common actions used in the extension)
var arbAction = fc.constantFrom(
  'click', 'type', 'typePassword', 'select', 'check', 'uncheck',
  'hover', 'scrollTo', 'assertText', 'assertVisible', 'assertValue',
  'saveText', 'saveAttribute', 'saveValue'
);

// Generate arbitrary target names
var arbTarget = fc.stringOf(
  fc.constantFrom('a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p'),
  { minLength: 1, maxLength: 12 }
);

// Generate arbitrary step value strings
var arbValue = fc.oneof(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.constantFrom('hello', 'world', '123', 'test@email.com', '')
);

// Generate a step object
var arbStep = fc.record({
  action: arbAction,
  target: arbTarget,
  value: fc.option(arbValue, { nil: undefined })
}).map(function (s) {
  var step = { action: s.action, target: s.target };
  if (s.value !== undefined) step.value = s.value;
  return step;
});

// Generate arbitrary successful results from content script
var arbSuccessResult = fc.record({
  ok: fc.constant(true),
  savedValue: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined })
}).map(function (r) {
  var result = { ok: true };
  if (r.savedValue !== undefined) result.savedValue = r.savedValue;
  return result;
});

// Generate arbitrary non-connection error messages
var arbNonConnectionError = fc.oneof(
  fc.constantFrom(
    'Element not found',
    'Timeout waiting for element',
    'Assertion failed: expected "foo" but got "bar"',
    'Element is not visible',
    'Cannot type into non-input element',
    'Element is disabled',
    'Select option not found',
    'Multiple elements matched selector'
  ),
  fc.string({ minLength: 1, maxLength: 80 }).filter(function (s) {
    // Exclude anything resembling a connection error
    return s.indexOf('Could not establish connection') === -1 &&
           s.indexOf('Receiving end does not exist') === -1;
  })
);

// Generate arbitrary failure results (non-connection errors)
var arbFailureResult = arbNonConnectionError.map(function (errMsg) {
  return { ok: false, error: errMsg };
});

// ---------------------------------------------------------------------------
// Property 2.1: sendStepToRuntime passes through successful results unchanged
// **Validates: Requirements 3.1**
// ---------------------------------------------------------------------------

test('PRESERVATION: sendStepToRuntime passes through successful result unchanged for all step types', function () {
  return fc.assert(
    fc.asyncProperty(arbStep, arbSuccessResult, function (step, expectedResult) {
      bg.resetRunState();
      bg.runState.lockedTabId = 100;

      // Mock tabs.sendMessage to resolve with the expected result
      global.chrome.tabs.sendMessage = function (tabId, msg) {
        return Promise.resolve(expectedResult);
      };

      return bg.sendStepToRuntime(step, 0).then(function (result) {
        // The result from sendStepToRuntime must be identical to what sendMessage resolved with
        assert.deepEqual(result, expectedResult);
      });
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 2.2: Non-connection failures reported through existing LOG/RUN_COMPLETE flow
// **Validates: Requirements 3.2**
// ---------------------------------------------------------------------------

test('PRESERVATION: non-connection failures halt run and emit LOG + RUN_COMPLETE unchanged', function () {
  return fc.assert(
    fc.asyncProperty(arbStep, arbNonConnectionError, function (step, errorMsg) {
      bg.resetRunState();

      var sentLogs = [];
      var sentSummary = null;

      global.chrome.tabs = {
        update: function () { return Promise.resolve(); },
        sendMessage: function (tabId, msg) {
          // Return failure for the step
          return Promise.resolve({ ok: false, error: errorMsg });
        },
        onCreated: { addListener: function () {}, removeListener: function () {} },
        onRemoved: { addListener: function () {}, removeListener: function () {} },
        onActivated: { addListener: function () {}, removeListener: function () {} }
      };
      global.chrome.runtime.sendMessage = function (msg) {
        if (!msg) return Promise.resolve();
        if (msg.type === 'LOG') sentLogs.push(msg);
        else if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
        return Promise.resolve();
      };

      var testObj = {
        name: 'Fail Test',
        steps: [step]
      };
      var spec = {
        tasks: {},
        pageElements: {}
      };
      // Add a simple pageElement if target is provided
      if (step.target) {
        spec.pageElements[step.target] = { tag: 'div', where: { id: step.target } };
      }

      return bg.startRun(100, testObj, spec, [0]).then(function () {
        // Verify the failure was reported through LOG
        var failLog = sentLogs.filter(function (l) { return l.ok === false; });
        assert.ok(failLog.length >= 1, 'Expected at least one failure LOG');
        assert.equal(failLog[0].error, errorMsg);
        assert.equal(failLog[0].ok, false);

        // Verify RUN_COMPLETE was emitted with correct counts
        assert.ok(sentSummary !== null, 'Expected RUN_COMPLETE summary');
        assert.equal(sentSummary.type, 'RUN_COMPLETE');
        assert.equal(sentSummary.failed, 1);
        assert.equal(sentSummary.passed, 0);

        // Verify run halted
        assert.equal(bg.runState.running, false);
        assert.equal(bg.runState.lockedTabId, null);
      });
    }),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 2.3: sendStepToRuntime passes through failure results unchanged
// **Validates: Requirements 3.2**
// ---------------------------------------------------------------------------

test('PRESERVATION: sendStepToRuntime passes through failure result unchanged for all step types', function () {
  return fc.assert(
    fc.asyncProperty(arbStep, arbFailureResult, function (step, expectedResult) {
      bg.resetRunState();
      bg.runState.lockedTabId = 100;

      // Mock tabs.sendMessage to resolve with the failure result
      global.chrome.tabs.sendMessage = function (tabId, msg) {
        return Promise.resolve(expectedResult);
      };

      return bg.sendStepToRuntime(step, 0).then(function (result) {
        // The result from sendStepToRuntime must be identical to what sendMessage resolved with
        assert.deepEqual(result, expectedResult);
      });
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 2.4: Upload steps process successful results through .then() unchanged
// **Validates: Requirements 3.1**
// ---------------------------------------------------------------------------

test('PRESERVATION: upload steps process successful results through .then() identically', function () {
  return fc.assert(
    fc.asyncProperty(arbTarget, arbValue, function (target, fileName) {
      bg.resetRunState();

      var sentLogs = [];
      var sentSummary = null;

      global.chrome.tabs = {
        update: function () { return Promise.resolve(); },
        sendMessage: function (tabId, msg) {
          if (msg.action === 'upload') {
            return Promise.resolve({ ok: true });
          }
          return Promise.resolve({ ok: true });
        },
        onCreated: { addListener: function () {}, removeListener: function () {} },
        onRemoved: { addListener: function () {}, removeListener: function () {} },
        onActivated: { addListener: function () {}, removeListener: function () {} }
      };
      global.chrome.runtime.sendMessage = function (msg) {
        if (!msg) return Promise.resolve();
        if (msg.type === 'LOG') sentLogs.push(msg);
        else if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
        return Promise.resolve();
      };

      var testObj = {
        name: 'Upload Test',
        steps: [{ action: 'upload', target: target, value: fileName || 'test.pdf' }]
      };
      var spec = {
        tasks: {},
        pageElements: {},
        meta: {} // No testFiles — triggers stub file path (no fetch needed)
      };
      if (target) {
        spec.pageElements[target] = { tag: 'input', where: { id: target } };
      }

      return bg.startRun(100, testObj, spec, [0]).then(function () {
        // Verify the upload step was logged as passed
        var passLogs = sentLogs.filter(function (l) { return l.ok === true; });
        assert.ok(passLogs.length >= 1, 'Expected at least one passing LOG for upload');
        assert.equal(passLogs[0].action, 'upload');

        // Verify RUN_COMPLETE
        assert.ok(sentSummary !== null, 'Expected RUN_COMPLETE');
        assert.equal(sentSummary.type, 'RUN_COMPLETE');
        assert.equal(sentSummary.passed, 1);
        assert.equal(sentSummary.failed, 0);
      });
    }),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 2.5: safeSendMessage logs error without crashing when runtime is unavailable
// **Validates: Requirements 3.3**
// ---------------------------------------------------------------------------

test('PRESERVATION: safeSendMessage logs error without crashing for all message types', function () {
  return fc.assert(
    fc.property(
      fc.record({
        type: fc.constantFrom('LOG', 'RUN_COMPLETE', 'RUN_STOPPED', 'STEP_STARTING', 'STEP_FAILED_AWAITING_ACTION'),
        stepIndex: fc.nat(100),
        action: arbAction,
        ok: fc.boolean()
      }),
      function (msg) {
        var loggedMessages = [];

        // Mock runtime.sendMessage to reject (simulating panel not open)
        global.chrome.runtime.sendMessage = function (m) {
          return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
        };

        // Mock console.log to capture output
        var originalLog = console.log;
        console.log = function (text) {
          loggedMessages.push(text);
        };

        try {
          // safeSendMessage should NOT throw
          bg.safeSendMessage(msg);
          // No exception means the function handles errors gracefully
        } finally {
          console.log = originalLog;
        }

        // Restore runtime.sendMessage for other tests
        global.chrome.runtime.sendMessage = function () { return Promise.resolve(); };
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 2.6: safeSendMessage handles synchronous throw without crashing
// **Validates: Requirements 3.3**
// ---------------------------------------------------------------------------

test('PRESERVATION: safeSendMessage handles synchronous throw without crashing', function () {
  return fc.assert(
    fc.property(
      fc.record({
        type: fc.constantFrom('LOG', 'RUN_COMPLETE', 'RUN_STOPPED'),
        stepIndex: fc.nat(50)
      }),
      arbNonConnectionError,
      function (msg, errorText) {
        var loggedMessages = [];

        // Mock runtime.sendMessage to throw synchronously
        global.chrome.runtime.sendMessage = function () {
          throw new Error(errorText);
        };

        // Mock console.log to capture output
        var originalLog = console.log;
        console.log = function (text) {
          loggedMessages.push(text);
        };

        try {
          // safeSendMessage should NOT throw even with synchronous errors
          bg.safeSendMessage(msg);
          // Verify console.log was called (error was logged)
          assert.ok(loggedMessages.length > 0, 'Expected at least one console.log call');
          assert.ok(
            loggedMessages[0].indexOf('[tomation]') !== -1,
            'Expected logged message to contain [tomation] prefix'
          );
        } finally {
          console.log = originalLog;
          global.chrome.runtime.sendMessage = function () { return Promise.resolve(); };
        }
      }
    ),
    { numRuns: 50 }
  );
});
