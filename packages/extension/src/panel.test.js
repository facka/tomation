'use strict';

/**
 * Tests for panel.js — Test Plan View (Task 18.1)
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var JSDOM = require('jsdom').JSDOM;

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

var panelJsSource = fs.readFileSync(path.join(__dirname, 'panel.js'), 'utf8');
var storageJsSource = fs.readFileSync(path.join(__dirname, 'storage.js'), 'utf8');

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

  // Set up the browser API mock
  var sentMessages = [];
  window.eval('var browser = { ' +
    'runtime: { sendMessage: function(msg) { window.__sentMessages.push(msg); return Promise.resolve(); } }, ' +
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

function createSampleSpec() {
  return {
    format: 'tomation-spec',
    version: 1,
    meta: { name: 'Test', url: '' },
    pageElements: {
      'Login__usernameInput': { tag: 'input', where: { id: 'username' } },
      'Login__passwordInput': { tag: 'input', where: { id: 'password' } },
      'Login__submitButton': { tag: 'button', where: { id: 'login-btn' } },
      'Login__errorMessage': { tag: 'div', where: { id: 'error-msg' } }
    },
    tasks: {
      'Login__fillCredentials': {
        steps: [
          { action: 'type', target: 'Login__usernameInput', value: 'testuser' },
          { action: 'typePassword', target: 'Login__passwordInput', value: 'secret' }
        ]
      },
      'Login__submit': {
        steps: [
          { action: 'click', target: 'Login__submitButton' }
        ]
      }
    },
    tests: [
      {
        name: 'Login with valid credentials',
        steps: [
          { action: 'task', name: 'Login__fillCredentials' },
          { action: 'task', name: 'Login__submit' },
          { action: 'assertExists', target: 'Login__errorMessage' }
        ]
      }
    ]
  };
}

function setTestState(env, spec, testIndex) {
  env.window.currentSpec = { filename: 'spec.json', spec: spec };
  env.window.currentTest = spec.tests[testIndex];
  env.window.currentTestIndex = testIndex;
}

// ---------------------------------------------------------------------------
// Tests: renderTestPlan
// ---------------------------------------------------------------------------

test('renderTestPlan renders test name as heading (Req 6.1)', function () {
  var env = createTestEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);

  var titleEl = env.document.getElementById('test-plan-title');
  titleEl.textContent = env.window.currentTest.name;
  env.window.renderTestPlan();

  assert.equal(titleEl.textContent, 'Login with valid credentials');
});

test('renderTestPlan renders all steps as checklist items (Req 6.1)', function () {
  var env = createTestEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);
  env.window.renderTestPlan();

  var checklist = env.document.getElementById('step-checklist');
  var items = checklist.querySelectorAll('li');

  // 3 top-level steps: task (2 children) + task (1 child) + assertExists
  // = 1 task header + 2 children + 1 task header + 1 child + 1 regular = 6 items
  assert.equal(items.length, 6);
});

test('renderTestPlan expands task steps with indented children (Req 6.2)', function () {
  var env = createTestEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);
  env.window.renderTestPlan();

  var checklist = env.document.getElementById('step-checklist');
  var indented = checklist.querySelectorAll('li.indented');

  // 2 children from Login__fillCredentials + 1 from Login__submit = 3
  assert.equal(indented.length, 3);
});

test('renderTestPlan task header shows task name (Req 6.2)', function () {
  var env = createTestEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);
  env.window.renderTestPlan();

  var checklist = env.document.getElementById('step-checklist');
  var firstItem = checklist.querySelectorAll('li')[0];
  var label = firstItem.querySelector('label');

  assert.equal(label.textContent, 'Login__fillCredentials');
});

test('renderTestPlan all checkboxes start checked (Req 6.3)', function () {
  var env = createTestEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);
  env.window.renderTestPlan();

  var checklist = env.document.getElementById('step-checklist');
  var checkboxes = checklist.querySelectorAll('input[type="checkbox"]');

  assert.ok(checkboxes.length > 0, 'Should have checkboxes');
  for (var i = 0; i < checkboxes.length; i++) {
    assert.equal(checkboxes[i].checked, true, 'Checkbox ' + i + ' should be checked');
  }
});

test('unchecking task checkbox unchecks all child checkboxes (Req 6.5)', function () {
  var env = createTestEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);
  env.window.renderTestPlan();

  var checklist = env.document.getElementById('step-checklist');

  // Find the first task checkbox (step index 0)
  var taskCb = checklist.querySelector('input[data-step-index="0"][data-is-task="true"]');
  assert.ok(taskCb, 'Task checkbox should exist');

  // Uncheck it and fire the change event
  taskCb.checked = false;
  var event = env.document.createEvent('Event');
  event.initEvent('change', true, true);
  taskCb.dispatchEvent(event);

  // All child checkboxes for step index 0 should be unchecked
  var childCbs = checklist.querySelectorAll('input[data-step-index="0"][data-child-index]');
  assert.ok(childCbs.length > 0, 'Should have child checkboxes');
  for (var i = 0; i < childCbs.length; i++) {
    assert.equal(childCbs[i].checked, false, 'Child checkbox ' + i + ' should be unchecked');
  }
});

test('unchecking task does not affect other task children (Req 6.5)', function () {
  var env = createTestEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);
  env.window.renderTestPlan();

  var checklist = env.document.getElementById('step-checklist');

  // Uncheck first task (index 0)
  var taskCb = checklist.querySelector('input[data-step-index="0"][data-is-task="true"]');
  taskCb.checked = false;
  var event = env.document.createEvent('Event');
  event.initEvent('change', true, true);
  taskCb.dispatchEvent(event);

  // Second task children (step index 1) should remain checked
  var otherChildCbs = checklist.querySelectorAll('input[data-step-index="1"][data-child-index]');
  assert.ok(otherChildCbs.length > 0, 'Should have other task children');
  for (var i = 0; i < otherChildCbs.length; i++) {
    assert.equal(otherChildCbs[i].checked, true, 'Other task child should remain checked');
  }
});

test('Run button sends RUN_TEST message with all checked step indices (Req 6.6)', function () {
  var env = createTestEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);
  env.window.renderTestPlan();

  // Click Run
  env.window.onRunClick();

  assert.equal(env.sentMessages.length, 1);
  var msg = env.sentMessages[0];
  assert.equal(msg.type, 'RUN_TEST');
  assert.equal(msg.testIndex, 0);
  assert.equal(JSON.stringify(msg.checkedSteps), JSON.stringify([0, 1, 2]));
});

test('Run button only sends checked step indices after uncheck', function () {
  var env = createTestEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);
  env.window.renderTestPlan();

  var checklist = env.document.getElementById('step-checklist');

  // Uncheck the second task (step index 1)
  var taskCb = checklist.querySelector('input[data-step-index="1"][data-is-task="true"]');
  taskCb.checked = false;

  env.window.onRunClick();

  assert.equal(env.sentMessages.length, 1);
  var msg = env.sentMessages[0];
  assert.equal(JSON.stringify(msg.checkedSteps), JSON.stringify([0, 2]));
});

test('renderTestPlan handles regular (non-task) steps correctly', function () {
  var env = createTestEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);
  env.window.renderTestPlan();

  var checklist = env.document.getElementById('step-checklist');

  // The last step (assertExists) is not a task — should not be indented
  var allItems = checklist.querySelectorAll('li');
  var lastItem = allItems[allItems.length - 1];
  assert.equal(lastItem.className, '', 'Regular step should not be indented');

  var label = lastItem.querySelector('label');
  assert.equal(label.textContent, 'assertExists Login__errorMessage');
});
