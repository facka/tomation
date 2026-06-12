'use strict';

/**
 * Property-based tests for background.js — step flattener, template resolution,
 * and background orchestration (run state machine).
 *
 * Requirements: 4.1–4.4, 5.1, 5.4, 5.5, 5.11, 6.4
 * Tag: // Feature: tomation, Property 4, 5, 7, 8
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');

// Mock chrome/browser global before requiring background.js
global.chrome = {
  runtime: {
    onMessage: { addListener: function () {}, removeListener: function () {} },
    onConnect: { addListener: function () {} },
    sendMessage: function () {}
  },
  tabs: {
    query: function () { return Promise.resolve([]); },
    update: function () { return Promise.resolve(); },
    sendMessage: function () { return Promise.resolve({ ok: true }); }
  }
};
global.getProject = function () { return Promise.resolve(null); };

const bg = require('./background.js');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a valid alphanumeric param name (1-12 chars, starts with letter) */
const paramNameArb = fc.string({ minLength: 1, maxLength: 12 })
  .filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s));

/** Generate a simple value string that does NOT contain {{ or $random */
const safeValueArb = fc.string({ minLength: 0, maxLength: 30 })
  .filter(s => !s.includes('{{') && !s.includes('$random') && !s.includes('}}'));

/** Generate a simple action name (non-task actions) */
const simpleActionArb = fc.constantFrom('click', 'type', 'assertExists', 'assertHasText');

/** Generate a simple (non-task) step */
const simpleStepArb = fc.record({
  action: simpleActionArb,
  target: fc.constant('el'),
  value: safeValueArb
});

// ---------------------------------------------------------------------------
// Property 4: Template Parameter Resolution Completeness
// Feature: tomation, Property 4: Template Parameter Resolution Completeness
// ---------------------------------------------------------------------------

test('Property 4: Template Parameter Resolution Completeness — no unresolved tokens in output', function () {
  // Validates: Requirements 4.1, 4.2, 4.3, 4.4
  fc.assert(
    fc.property(
      // Generate 1-5 param name/value pairs
      fc.array(
        fc.tuple(paramNameArb, safeValueArb),
        { minLength: 1, maxLength: 5 }
      ),
      // Generate 1-5 step value templates that use some of those params
      fc.nat({ max: 4 }),
      function (paramPairs, extraStepCount) {
        // Build params map
        var params = {};
        for (var i = 0; i < paramPairs.length; i++) {
          params[paramPairs[i][0]] = paramPairs[i][1];
        }

        var paramNames = Object.keys(params);

        // Build steps that use {{paramName}} tokens in their value fields
        var taskSteps = [];
        var stepCount = Math.min(extraStepCount + 1, 5);
        for (var s = 0; s < stepCount; s++) {
          var paramIdx = s % paramNames.length;
          taskSteps.push({
            action: 'type',
            target: 'el',
            value: 'prefix-{{' + paramNames[paramIdx] + '}}-suffix'
          });
        }

        var tasksMap = {
          testTask: {
            params: paramNames,
            steps: taskSteps
          }
        };

        var testSteps = [
          { action: 'task', name: 'testTask', params: params }
        ];

        var pageElements = {
          el: { tag: 'input', where: { id: 'el' } }
        };

        var result = bg.flattenSteps(testSteps, tasksMap, pageElements, [0]);

        // Assert: no output step value contains unresolved {{...}} or $random tokens
        for (var r = 0; r < result.length; r++) {
          var val = result[r].value || '';
          assert.ok(val.indexOf('{{') === -1, 'Found unresolved {{ token in: ' + val);
          assert.ok(val.indexOf('$random') === -1, 'Found unresolved $random in: ' + val);
        }
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 4: Missing params are substituted with empty string — no leftover tokens', function () {
  // Validates: Requirements 4.4
  fc.assert(
    fc.property(
      // Generate param names that will be referenced but NOT provided
      fc.array(paramNameArb, { minLength: 1, maxLength: 4 }),
      function (missingParamNames) {
        // Deduplicate
        var unique = [];
        var seen = {};
        for (var i = 0; i < missingParamNames.length; i++) {
          if (!seen[missingParamNames[i]]) {
            unique.push(missingParamNames[i]);
            seen[missingParamNames[i]] = true;
          }
        }

        // Build steps with {{paramName}} tokens but provide NO params
        var taskSteps = [];
        for (var s = 0; s < unique.length; s++) {
          taskSteps.push({
            action: 'type',
            target: 'el',
            value: '{{' + unique[s] + '}}'
          });
        }

        var tasksMap = {
          testTask: {
            params: unique,
            steps: taskSteps
          }
        };

        // Invoke with empty params map
        var testSteps = [
          { action: 'task', name: 'testTask', params: {} }
        ];

        var pageElements = {
          el: { tag: 'input', where: { id: 'el' } }
        };

        var result = bg.flattenSteps(testSteps, tasksMap, pageElements, [0]);

        // Assert: no {{...}} tokens remain — all substituted with empty string
        for (var r = 0; r < result.length; r++) {
          var val = result[r].value || '';
          assert.ok(val.indexOf('{{') === -1, 'Found unresolved {{ token: ' + val);
          assert.ok(val.indexOf('}}') === -1, 'Found unresolved }} token: ' + val);
          assert.equal(val, '', 'Missing param should result in empty string');
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 7: Step Flattening Preserves Order and Count
// Feature: tomation, Property 7: Step Flattening Preserves Order and Count
// ---------------------------------------------------------------------------

test('Property 7: Step Flattening Preserves Order and Count — nested tasks', function () {
  // Validates: Requirements 5.1
  fc.assert(
    fc.property(
      // Generate 1-3 inner tasks, each with 1-5 simple steps
      fc.array(
        fc.array(simpleStepArb, { minLength: 1, maxLength: 5 }),
        { minLength: 1, maxLength: 3 }
      ),
      function (innerTaskStepArrays) {
        var tasksMap = {};
        var outerSteps = [];
        var expectedTotalSteps = 0;

        // Build inner tasks
        for (var t = 0; t < innerTaskStepArrays.length; t++) {
          var taskName = 'task' + t;
          tasksMap[taskName] = {
            steps: innerTaskStepArrays[t]
          };
          outerSteps.push({ action: 'task', name: taskName });
          expectedTotalSteps += innerTaskStepArrays[t].length;
        }

        var pageElements = {
          el: { tag: 'input', where: { id: 'el' } }
        };

        // All steps checked
        var checkedIndexes = [];
        for (var c = 0; c < outerSteps.length; c++) {
          checkedIndexes.push(c);
        }

        var result = bg.flattenSteps(outerSteps, tasksMap, pageElements, checkedIndexes);

        // Assert: total count equals sum of all terminal steps
        assert.equal(result.length, expectedTotalSteps,
          'Expected ' + expectedTotalSteps + ' steps but got ' + result.length);

        // Assert: relative order within each task is preserved
        var offset = 0;
        for (var ti = 0; ti < innerTaskStepArrays.length; ti++) {
          var taskSteps = innerTaskStepArrays[ti];
          for (var si = 0; si < taskSteps.length; si++) {
            assert.equal(result[offset + si].action, taskSteps[si].action,
              'Action mismatch at position ' + (offset + si));
          }
          offset += taskSteps.length;
        }
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 7: Step Flattening Preserves Order and Count — deeply nested (2 levels)', function () {
  // Validates: Requirements 5.1
  fc.assert(
    fc.property(
      // Generate 1-3 leaf steps for the innermost task
      fc.array(simpleStepArb, { minLength: 1, maxLength: 3 }),
      // Generate 1-2 leaf steps before the nested task call in the middle task
      fc.array(simpleStepArb, { minLength: 1, maxLength: 2 }),
      function (innerLeafSteps, middleLeafSteps) {
        var tasksMap = {
          innerTask: {
            steps: innerLeafSteps
          },
          middleTask: {
            steps: middleLeafSteps.concat([{ action: 'task', name: 'innerTask' }])
          }
        };

        var testSteps = [
          { action: 'task', name: 'middleTask' }
        ];

        var pageElements = {
          el: { tag: 'input', where: { id: 'el' } }
        };

        var result = bg.flattenSteps(testSteps, tasksMap, pageElements, [0]);

        var expectedCount = middleLeafSteps.length + innerLeafSteps.length;
        assert.equal(result.length, expectedCount,
          'Expected ' + expectedCount + ' steps but got ' + result.length);

        // Order: middleLeafSteps first, then innerLeafSteps
        for (var m = 0; m < middleLeafSteps.length; m++) {
          assert.equal(result[m].action, middleLeafSteps[m].action,
            'Middle task step order mismatch at position ' + m);
        }
        for (var i = 0; i < innerLeafSteps.length; i++) {
          assert.equal(result[middleLeafSteps.length + i].action, innerLeafSteps[i].action,
            'Inner task step order mismatch at position ' + (middleLeafSteps.length + i));
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 8: Skipped Steps Are Never Executed
// Feature: tomation, Property 8: Skipped Steps Are Never Executed
// ---------------------------------------------------------------------------

test('Property 8: Skipped Steps Are Never Executed — checked subset only', function () {
  // Validates: Requirements 6.4
  fc.assert(
    fc.property(
      // Generate 1-10 simple steps
      fc.array(simpleStepArb, { minLength: 1, maxLength: 10 }),
      // Generate a random subset of indexes to check (as booleans per index)
      fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
      function (steps, booleans) {
        // Trim booleans to match steps length
        var stepCount = steps.length;
        var checkedIndexes = [];
        for (var i = 0; i < stepCount; i++) {
          // Use boolean at index i if available, otherwise checked by default
          var isChecked = i < booleans.length ? booleans[i] : true;
          if (isChecked) {
            checkedIndexes.push(i);
          }
        }

        var pageElements = {
          el: { tag: 'input', where: { id: 'el' } }
        };

        var result = bg.flattenSteps(steps, {}, pageElements, checkedIndexes);

        // Assert: output length equals number of checked indexes
        assert.equal(result.length, checkedIndexes.length,
          'Expected ' + checkedIndexes.length + ' steps but got ' + result.length);

        // Assert: output steps correspond exactly to checked steps in order
        for (var j = 0; j < checkedIndexes.length; j++) {
          var expectedStep = steps[checkedIndexes[j]];
          assert.equal(result[j].action, expectedStep.action,
            'Step action mismatch at output position ' + j +
            ': expected ' + expectedStep.action + ' but got ' + result[j].action);
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property 5 (tab lock): Tab Is Unlocked After Any Run Outcome
// Feature: tomation, Property 5, 8
// ---------------------------------------------------------------------------

test('Property 5 (tab lock): Tab is unlocked after a passing run', function () {
  // Validates: Requirements 5.4, 5.5
  return fc.assert(
    fc.asyncProperty(
      // Generate 1-10 simple steps (all will pass)
      fc.array(
        fc.record({
          action: fc.constantFrom('click', 'type', 'assertExists'),
          target: fc.constant('el'),
          value: fc.constant('hello')
        }),
        { minLength: 1, maxLength: 10 }
      ),
      function (steps) {
        // Track tabs.update calls
        var tabsUpdateCalls = [];
        global.chrome.tabs.update = function (tabId, opts) {
          tabsUpdateCalls.push({ tabId: tabId, opts: opts });
          return Promise.resolve();
        };
        // All steps succeed
        global.chrome.tabs.sendMessage = function () {
          return Promise.resolve({ ok: true });
        };
        // Capture runtime.sendMessage (LOG messages)
        global.chrome.runtime.sendMessage = function () {};

        bg.resetRunState();

        var test_obj = { name: 'test', steps: steps };
        var spec = { tasks: {}, pageElements: { el: { tag: 'input', where: { id: 'el' } } } };
        var checkedIndexes = [];
        for (var i = 0; i < steps.length; i++) { checkedIndexes.push(i); }

        return bg.startRun(42, test_obj, spec, checkedIndexes).then(function () {
          // After run completes, tab should be unlocked
          assert.equal(bg.runState.lockedTabId, null,
            'lockedTabId should be null after passing run');
          // tabs.update should have been called at least once at the start (lock)
          assert.ok(tabsUpdateCalls.length >= 1,
            'tabs.update should have been called at start to lock tab');
          assert.deepEqual(tabsUpdateCalls[0].opts, { active: true },
            'First tabs.update call should lock with { active: true }');
          assert.equal(tabsUpdateCalls[0].tabId, 42,
            'First tabs.update call should use the correct tabId');
        });
      }
    ),
    { numRuns: 50 }
  );
});

test('Property 5 (tab lock): Tab is unlocked after a failing run', function () {
  // Validates: Requirements 5.4, 5.5
  return fc.assert(
    fc.asyncProperty(
      // Generate 2-10 steps; one will fail
      fc.array(
        fc.record({
          action: fc.constantFrom('click', 'type', 'assertExists'),
          target: fc.constant('el'),
          value: fc.constant('hello')
        }),
        { minLength: 2, maxLength: 10 }
      ),
      // Choose which step index will fail (0-based, within the array length)
      fc.nat({ max: 9 }),
      function (steps, failAtRaw) {
        var failAt = failAtRaw % steps.length;

        var tabsUpdateCalls = [];
        global.chrome.tabs.update = function (tabId, opts) {
          tabsUpdateCalls.push({ tabId: tabId, opts: opts });
          return Promise.resolve();
        };

        var stepCounter = 0;
        global.chrome.tabs.sendMessage = function () {
          var current = stepCounter++;
          if (current === failAt) {
            return Promise.resolve({ ok: false, error: 'simulated failure' });
          }
          return Promise.resolve({ ok: true });
        };
        global.chrome.runtime.sendMessage = function () {};

        bg.resetRunState();

        var test_obj = { name: 'test', steps: steps };
        var spec = { tasks: {}, pageElements: { el: { tag: 'input', where: { id: 'el' } } } };
        var checkedIndexes = [];
        for (var i = 0; i < steps.length; i++) { checkedIndexes.push(i); }

        return bg.startRun(99, test_obj, spec, checkedIndexes).then(function () {
          // After run fails, tab should be unlocked
          assert.equal(bg.runState.lockedTabId, null,
            'lockedTabId should be null after failing run');
          // tabs.update should have been called at start (lock)
          assert.ok(tabsUpdateCalls.length >= 1,
            'tabs.update should have been called');
          assert.deepEqual(tabsUpdateCalls[0].opts, { active: true },
            'First tabs.update call should lock with { active: true }');
        });
      }
    ),
    { numRuns: 50 }
  );
});

test('Property 5 (tab lock): Tab is unlocked after a stopped run', function () {
  // Validates: Requirements 5.4, 5.5
  return fc.assert(
    fc.asyncProperty(
      // Generate 2-10 steps
      fc.array(
        fc.record({
          action: fc.constantFrom('click', 'type', 'assertExists'),
          target: fc.constant('el'),
          value: fc.constant('hello')
        }),
        { minLength: 2, maxLength: 10 }
      ),
      function (steps) {
        var tabsUpdateCalls = [];
        global.chrome.tabs.update = function (tabId, opts) {
          tabsUpdateCalls.push({ tabId: tabId, opts: opts });
          return Promise.resolve();
        };

        var stepCounter = 0;
        global.chrome.tabs.sendMessage = function () {
          stepCounter++;
          // After the first step, request stop
          if (stepCounter === 1) {
            bg.stopRun();
          }
          return Promise.resolve({ ok: true });
        };
        global.chrome.runtime.sendMessage = function () {};

        bg.resetRunState();

        var test_obj = { name: 'test', steps: steps };
        var spec = { tasks: {}, pageElements: { el: { tag: 'input', where: { id: 'el' } } } };
        var checkedIndexes = [];
        for (var i = 0; i < steps.length; i++) { checkedIndexes.push(i); }

        return bg.startRun(77, test_obj, spec, checkedIndexes).then(function () {
          // After stop, tab should be unlocked
          assert.equal(bg.runState.lockedTabId, null,
            'lockedTabId should be null after stopped run');
          // tabs.update should have been called at start (lock)
          assert.ok(tabsUpdateCalls.length >= 1,
            'tabs.update should have been called');
          assert.deepEqual(tabsUpdateCalls[0].opts, { active: true },
            'First tabs.update call should lock with { active: true }');
        });
      }
    ),
    { numRuns: 50 }
  );
});

// ---------------------------------------------------------------------------
// Property 8 (LOG count): Exactly N LOG Messages for N Steps
// Feature: tomation, Property 5, 8
// ---------------------------------------------------------------------------

test('Property 8 (LOG count): Exactly N LOG messages emitted for N passing steps', function () {
  // Validates: Requirements 5.11
  return fc.assert(
    fc.asyncProperty(
      // Generate 1-10 simple steps (all will pass)
      fc.array(
        fc.record({
          action: fc.constantFrom('click', 'type', 'assertExists'),
          target: fc.constant('el'),
          value: fc.constant('val')
        }),
        { minLength: 1, maxLength: 10 }
      ),
      function (steps) {
        var logMessages = [];
        global.chrome.tabs.update = function () { return Promise.resolve(); };
        global.chrome.tabs.sendMessage = function () {
          return Promise.resolve({ ok: true });
        };
        global.chrome.runtime.sendMessage = function (msg) {
          if (msg && msg.type === 'LOG') {
            logMessages.push(msg);
          }
        };

        bg.resetRunState();

        var test_obj = { name: 'test', steps: steps };
        var spec = { tasks: {}, pageElements: { el: { tag: 'input', where: { id: 'el' } } } };
        var checkedIndexes = [];
        for (var i = 0; i < steps.length; i++) { checkedIndexes.push(i); }

        return bg.startRun(10, test_obj, spec, checkedIndexes).then(function () {
          // Exactly N LOG messages for N steps
          assert.equal(logMessages.length, steps.length,
            'Expected ' + steps.length + ' LOG messages but got ' + logMessages.length);

          // Each LOG message should have the correct stepIndex
          for (var j = 0; j < logMessages.length; j++) {
            assert.equal(logMessages[j].stepIndex, j,
              'LOG message ' + j + ' should have stepIndex ' + j);
            assert.equal(logMessages[j].ok, true,
              'LOG message ' + j + ' should have ok=true for passing steps');
          }
        });
      }
    ),
    { numRuns: 50 }
  );
});
