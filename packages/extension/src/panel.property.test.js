'use strict';

/**
 * Property-based tests for panel.js — Home view rendering.
 *
 * Requirements: 8.3, 8.6
 * // Feature: tomation, Property (8.3, 8.6)
 */

var test = require('node:test');
var assert = require('node:assert/strict');
var fc = require('fast-check');
var fs = require('node:fs');
var path = require('node:path');
var JSDOM = require('jsdom').JSDOM;

var panelJsSource = fs.readFileSync(path.join(__dirname, 'panel.js'), 'utf8');
var storageJsSource = fs.readFileSync(path.join(__dirname, 'storage.js'), 'utf8');

// ---------------------------------------------------------------------------
// Test environment setup
// ---------------------------------------------------------------------------

function createTestEnv() {
  var html = '<!DOCTYPE html><html><body>' +
    '<div id="view-home" class="view active"></div>' +
    '<div id="view-test-plan" class="view">' +
    '  <h2 id="test-plan-title"></h2>' +
    '  <ul id="step-checklist" class="step-checklist"></ul>' +
    '  <div><button id="run-btn" class="btn btn-primary">Run</button>' +
    '  <button id="back-home-btn" class="btn">Back</button></div>' +
    '</div>' +
    '<div id="view-run" class="view"></div>' +
    '<div id="view-error" class="view"><div id="error-message"></div><button id="error-back-btn"></button></div>' +
    '<div id="project-content"></div>' +
    '<div id="warning-banner" class="warning-banner"></div>' +
    '<button id="load-spec-btn"></button>' +
    '<input type="file" id="spec-file-input" />' +
    '<button id="back-home-from-run-btn"></button>' +
    '</body></html>';

  var dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  var window = dom.window;

  var sentMessages = [];
  window.eval('var browser = { ' +
    'runtime: { sendMessage: function(msg) { window.__sentMessages.push(msg); return Promise.resolve(); }, onMessage: { addListener: function() {} } }, ' +
    'tabs: { ' +
    '  query: function(opts, cb) { cb([]); }, ' +
    '  onActivated: { addListener: function() {} }, ' +
    '  onUpdated: { addListener: function() {} } ' +
    '}, ' +
    'storage: { local: { get: function() { return Promise.resolve({}); }, set: function() { return Promise.resolve(); } } } ' +
    '};');

  window.__sentMessages = sentMessages;

  // Load storage.js (provides getProject, addSpec, etc.)
  window.eval(storageJsSource);

  // Override getProject to not actually hit storage
  window.eval('getProject = function() { return Promise.resolve(null); };');

  // Load panel.js
  window.eval(panelJsSource);

  return { dom: dom, window: window, document: window.document, sentMessages: sentMessages };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a safe string for filenames (alphanumeric + dash, 1-20 chars) */
var safeStringArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9\-]{0,19}$/);

/** Generate a test name (non-empty alphanumeric string) */
var testNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{0,29}$/);

/** Generate an array of test objects for a spec */
function testsArb(count) {
  return fc.array(
    fc.record({
      name: testNameArb,
      steps: fc.constant([])
    }),
    { minLength: count, maxLength: count }
  );
}

/** Generate a spec entry with a given number of tests */
var specEntryArb = fc.integer({ min: 0, max: 5 }).chain(function (testCount) {
  return fc.record({
    id: fc.uuid(),
    filename: safeStringArb.map(function (s) { return s + '.json'; }),
    loadedAt: fc.constant(new Date().toISOString()),
    spec: testsArb(testCount).map(function (tests) {
      return {
        format: 'tomation-spec',
        version: 1,
        meta: { name: 'Test', url: '' },
        pageElements: {},
        tasks: {},
        tests: tests
      };
    })
  });
});

/** Generate a project with N spec entries */
var projectArb = fc.integer({ min: 1, max: 10 }).chain(function (n) {
  return fc.array(specEntryArb, { minLength: n, maxLength: n }).map(function (specs) {
    return {
      host: 'example.com',
      name: 'Test Project',
      specs: specs,
      lastUsed: new Date().toISOString()
    };
  });
});

/** Generate a hostname (simple alphanumeric domain) */
var hostnameArb = fc.stringMatching(/^[a-z][a-z0-9]{2,10}\.[a-z]{2,4}$/);

// ---------------------------------------------------------------------------
// Property: Project Rendering — N spec sections and M test items
// Validates: Requirements 8.3
// Feature: tomation, Property (8.3, 8.6)
// ---------------------------------------------------------------------------

test('Property (project rendering): For any project with N specs and M total tests, render produces N spec sections and M test items', async function () {
  await fc.assert(
    fc.asyncProperty(projectArb, async function (project) {
      var env = createTestEnv();
      var expectedSpecCount = project.specs.length;
      var expectedTestCount = 0;
      for (var i = 0; i < project.specs.length; i++) {
        if (project.specs[i].spec && project.specs[i].spec.tests) {
          expectedTestCount += project.specs[i].spec.tests.length;
        }
      }

      // Set currentHostname and override getProject to return our generated project
      env.window.eval('currentHostname = "example.com";');
      env.window.eval('getProject = function() { return Promise.resolve(' + JSON.stringify(project) + '); };');

      // Call renderHomeView
      env.window.eval('renderHomeView();');

      // Wait for the promise chain in renderHomeView to resolve (microtask flush)
      await new Promise(function (resolve) { setTimeout(resolve, 10); });

      var contentEl = env.document.getElementById('project-content');
      var specSections = contentEl.querySelectorAll('.spec-section');
      var testItems = contentEl.querySelectorAll('.test-list li');

      assert.equal(specSections.length, expectedSpecCount,
        'Expected ' + expectedSpecCount + ' spec sections, got ' + specSections.length);
      assert.equal(testItems.length, expectedTestCount,
        'Expected ' + expectedTestCount + ' test items, got ' + testItems.length);
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property: meta.url mismatch warning — warning visible when host differs
// Validates: Requirements 8.6
// Feature: tomation, Property (8.3, 8.6)
// ---------------------------------------------------------------------------

test('Property (meta.url mismatch warning): For any spec with meta.url host != currentHostname, warning element is visible', async function () {
  await fc.assert(
    fc.asyncProperty(
      hostnameArb,
      hostnameArb.filter(function (h) { return h.length > 3; }),
      safeStringArb,
      async function (currentHost, specHost, filename) {
        // Ensure the two hostnames are different
        fc.pre(currentHost !== specHost);

        var env = createTestEnv();

        var project = {
          host: currentHost,
          name: 'Test',
          specs: [{
            id: '00000000-0000-4000-8000-000000000001',
            filename: filename + '.json',
            loadedAt: new Date().toISOString(),
            spec: {
              format: 'tomation-spec',
              version: 1,
              meta: { name: 'Test', url: 'https://' + specHost + '/page' },
              pageElements: {},
              tasks: {},
              tests: [{ name: 'Test 1', steps: [] }]
            }
          }],
          lastUsed: new Date().toISOString()
        };

        // Set currentHostname and override getProject
        env.window.eval('currentHostname = ' + JSON.stringify(currentHost) + ';');
        env.window.eval('getProject = function() { return Promise.resolve(' + JSON.stringify(project) + '); };');

        // Call renderHomeView
        env.window.eval('renderHomeView();');

        // Wait for promise chain resolution
        await new Promise(function (resolve) { setTimeout(resolve, 10); });

        var warningEl = env.document.getElementById('warning-banner');
        var hasVisible = warningEl.classList.contains('visible');

        assert.equal(hasVisible, true,
          'Warning banner should be visible when spec host "' + specHost +
          '" differs from current hostname "' + currentHost + '"');
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property: Test Plan — All checkboxes checked by default
// Validates: Requirements 6.3
// Feature: tomation, Property (6.3, 6.5)
// ---------------------------------------------------------------------------

/** Generate a regular step (non-task) */
var regularStepArb = fc.record({
  action: fc.constantFrom('click', 'type', 'navigate', 'assertExists'),
  target: fc.constant('someElement')
});

/** Generate a task step referencing a task name */
function taskStepArb(taskName) {
  return fc.constant({ action: 'task', name: taskName });
}

/** Generate a list of child steps for a task */
var childStepsArb = fc.array(
  fc.record({
    action: fc.constantFrom('click', 'type', 'assertExists'),
    target: fc.constant('childElement')
  }),
  { minLength: 1, maxLength: 5 }
);

/**
 * Generate a test with N steps (mix of regular and task steps).
 * Returns { steps, tasks, expectedCheckboxCount }
 */
var testPlanArb = fc.integer({ min: 1, max: 8 }).chain(function (stepCount) {
  return fc.array(
    fc.record({
      isTask: fc.boolean(),
      childCount: fc.integer({ min: 1, max: 5 })
    }),
    { minLength: stepCount, maxLength: stepCount }
  ).map(function (stepDefs) {
    var steps = [];
    var tasks = {};
    var expectedCheckboxCount = 0;

    for (var i = 0; i < stepDefs.length; i++) {
      if (stepDefs[i].isTask) {
        var taskName = 'task_' + i;
        var childSteps = [];
        for (var c = 0; c < stepDefs[i].childCount; c++) {
          childSteps.push({ action: 'click', target: 'el_' + c });
        }
        tasks[taskName] = { steps: childSteps };
        steps.push({ action: 'task', name: taskName });
        // Task header checkbox + child checkboxes
        expectedCheckboxCount += 1 + childSteps.length;
      } else {
        steps.push({ action: 'click', target: 'someElement' });
        expectedCheckboxCount += 1;
      }
    }

    return { steps: steps, tasks: tasks, expectedCheckboxCount: expectedCheckboxCount };
  });
});

test('Property (test plan all checked): For any test with N steps, initial checked state has all N checked', function () {
  fc.assert(
    fc.property(testPlanArb, function (testPlan) {
      var env = createTestEnv();

      // Set up currentSpec and currentTest on the window
      env.window.eval('currentSpec = ' + JSON.stringify({
        spec: { tasks: testPlan.tasks }
      }) + ';');
      env.window.eval('currentTest = ' + JSON.stringify({
        name: 'Generated Test',
        steps: testPlan.steps
      }) + ';');

      // Call renderTestPlan
      env.window.eval('renderTestPlan();');

      // Query all checkboxes in the step-checklist
      var checklist = env.document.getElementById('step-checklist');
      var checkboxes = checklist.querySelectorAll('input[type="checkbox"]');

      // Verify the count matches expected
      assert.equal(checkboxes.length, testPlan.expectedCheckboxCount,
        'Expected ' + testPlan.expectedCheckboxCount + ' checkboxes, got ' + checkboxes.length);

      // Verify all checkboxes are checked
      for (var i = 0; i < checkboxes.length; i++) {
        assert.equal(checkboxes[i].checked, true,
          'Checkbox at index ' + i + ' should be checked by default');
      }
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property: Test Plan — Task uncheck cascades to children
// Validates: Requirements 6.5
// Feature: tomation, Property (6.3, 6.5)
// ---------------------------------------------------------------------------

/**
 * Generate a test with at least one task step that has N children.
 * Returns { steps, tasks, taskStepIndex, childCount }
 */
var taskUncheckedArb = fc.integer({ min: 1, max: 5 }).chain(function (childCount) {
  return fc.integer({ min: 0, max: 3 }).map(function (prefixCount) {
    var steps = [];
    var tasks = {};

    // Add some regular steps before the task
    for (var p = 0; p < prefixCount; p++) {
      steps.push({ action: 'click', target: 'el_prefix_' + p });
    }

    // Add the task step
    var taskName = 'cascadeTask';
    var childSteps = [];
    for (var c = 0; c < childCount; c++) {
      childSteps.push({ action: 'click', target: 'child_el_' + c });
    }
    tasks[taskName] = { steps: childSteps };
    steps.push({ action: 'task', name: taskName });

    var taskStepIndex = prefixCount; // The index in the steps array

    return {
      steps: steps,
      tasks: tasks,
      taskStepIndex: taskStepIndex,
      childCount: childCount
    };
  });
});

test('Property (task uncheck cascades): For any task with N children, unchecking task results in all N children unchecked', function () {
  fc.assert(
    fc.property(taskUncheckedArb, function (testData) {
      var env = createTestEnv();

      // Set up currentSpec and currentTest on the window
      env.window.eval('currentSpec = ' + JSON.stringify({
        spec: { tasks: testData.tasks }
      }) + ';');
      env.window.eval('currentTest = ' + JSON.stringify({
        name: 'Cascade Test',
        steps: testData.steps
      }) + ';');

      // Call renderTestPlan
      env.window.eval('renderTestPlan();');

      var checklist = env.document.getElementById('step-checklist');

      // Find the task checkbox (has data-is-task="true" and matching data-step-index)
      var taskCb = checklist.querySelector(
        'input[data-is-task="true"][data-step-index="' + testData.taskStepIndex + '"]'
      );
      assert.ok(taskCb, 'Task checkbox should exist at step index ' + testData.taskStepIndex);

      // Verify all children are currently checked
      var childCbs = checklist.querySelectorAll(
        'input[data-step-index="' + testData.taskStepIndex + '"][data-child-index]'
      );
      assert.equal(childCbs.length, testData.childCount,
        'Expected ' + testData.childCount + ' child checkboxes');

      // Simulate unchecking the task checkbox
      taskCb.checked = false;
      var event = new env.window.Event('change', { bubbles: true });
      Object.defineProperty(event, 'target', { value: taskCb, writable: false });
      taskCb.dispatchEvent(event);

      // Verify all child checkboxes are now unchecked
      for (var i = 0; i < childCbs.length; i++) {
        assert.equal(childCbs[i].checked, false,
          'Child checkbox at index ' + i + ' should be unchecked after task uncheck');
      }
    }),
    { numRuns: 100 }
  );
});
