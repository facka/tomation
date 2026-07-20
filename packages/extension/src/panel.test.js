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

  assert.equal(label.textContent, 'Task Login.fillCredentials');
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
  assert.equal(label.textContent, 'AssertExists Login.errorMessage');
});


// ---------------------------------------------------------------------------
// Tests: Run View (Task 19.1)
// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9
// ---------------------------------------------------------------------------

function createRunViewEnv() {
  var html = '<!DOCTYPE html><html><body>' +
    '<div id="view-home" class="view active"></div>' +
    '<div id="view-test-plan" class="view">' +
    '  <h2 id="test-plan-title"></h2>' +
    '  <ul id="step-checklist" class="step-checklist"></ul>' +
    '  <div><button id="run-btn" class="btn btn-primary">Run</button>' +
    '  <button id="back-home-btn" class="btn">Back</button></div>' +
    '</div>' +
    '<div id="view-run" class="view">' +
    '  <h2 id="run-title"></h2>' +
    '  <div class="controller-bar">' +
    '    <button id="pause-btn" class="btn">Pause</button>' +
    '    <button id="continue-btn" class="btn" disabled>Continue</button>' +
    '    <button id="stop-btn" class="btn btn-danger">Stop</button>' +
    '  </div>' +
    '  <div id="manual-banner" class="manual-banner">' +
    '    <p id="manual-description"></p>' +
    '    <button id="manual-continue-btn" class="btn btn-primary">Continue</button>' +
    '  </div>' +
    '  <div id="log-container" class="log-container"></div>' +
    '  <div id="run-summary" class="log-summary" style="display:none;"></div>' +
    '  <div id="run-done-actions" style="display:none;">' +
    '    <button id="back-home-from-run-btn" class="btn">Back to Home</button>' +
    '  </div>' +
    '</div>' +
    '<div id="view-error" class="view"><div id="error-message"></div><button id="error-back-btn"></button></div>' +
    '<div id="project-content"></div>' +
    '<div id="warning-banner" class="warning-banner"></div>' +
    '<button id="load-spec-btn"></button>' +
    '<input type="file" id="spec-file-input" />' +
    '</body></html>';

  var dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  var window = dom.window;
  var sentMessages = [];

  window.eval('var browser = { ' +
    'runtime: { ' +
    '  sendMessage: function(msg) { window.__sentMessages.push(msg); return Promise.resolve(); }, ' +
    '  onMessage: { addListener: function(fn) { window.__messageListener = fn; } } ' +
    '}, ' +
    'tabs: { ' +
    '  query: function(opts, cb) { cb([]); }, ' +
    '  onActivated: { addListener: function() {} }, ' +
    '  onUpdated: { addListener: function() {} } ' +
    '}, ' +
    'storage: { local: { get: function() { return Promise.resolve({}); }, set: function() { return Promise.resolve(); } } } ' +
    '};');

  window.__sentMessages = sentMessages;

  // Load storage.js
  window.eval(storageJsSource);
  window.eval('getProject = function() { return Promise.resolve(null); };');

  // Load panel.js
  window.eval(panelJsSource);

  // Explicitly call init() to wire up event listeners (JSDOM readyState is 'loading')
  window.init();

  return { dom: dom, window: window, document: window.document, sentMessages: sentMessages };
}

test('switchToRunView shows run view and sets isRunning (Req 7.1)', function () {
  var env = createRunViewEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);

  env.window.switchToRunView();

  var runView = env.document.getElementById('view-run');
  assert.ok(runView.classList.contains('active'), 'Run view should be active');
  assert.equal(env.window.isRunning, true);
});

test('switchToRunView sets run title from current test (Req 7.1)', function () {
  var env = createRunViewEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);

  env.window.switchToRunView();

  var titleEl = env.document.getElementById('run-title');
  assert.equal(titleEl.textContent, 'Login with valid credentials');
});

test('switchToRunView resets button states (Req 7.4)', function () {
  var env = createRunViewEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);

  env.window.switchToRunView();

  var pauseBtn = env.document.getElementById('pause-btn');
  var continueBtn = env.document.getElementById('continue-btn');
  var stopBtn = env.document.getElementById('stop-btn');

  assert.equal(pauseBtn.disabled, false, 'Pause should be enabled');
  assert.equal(continueBtn.disabled, true, 'Continue should be disabled');
  assert.equal(stopBtn.disabled, false, 'Stop should be enabled');
});

test('onRunClick switches to run view after sending message (Req 7.1)', function () {
  var env = createRunViewEnv();
  var spec = createSampleSpec();
  setTestState(env, spec, 0);
  env.window.renderTestPlan();

  env.window.onRunClick();

  var runView = env.document.getElementById('view-run');
  assert.ok(runView.classList.contains('active'), 'Run view should be active after onRunClick');
  assert.equal(env.sentMessages[0].type, 'RUN_TEST');
});

test('appendLogEntry renders a passing step with checkmark (Req 7.2)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  env.window.appendLogEntry({
    stepIndex: 0,
    action: 'click',
    target: 'Login__submitButton',
    value: null,
    ok: true
  });

  var logContainer = env.document.getElementById('log-container');
  var entries = logContainer.querySelectorAll('.log-entry');
  assert.equal(entries.length, 1);
  assert.ok(entries[0].classList.contains('pass'));
  assert.ok(entries[0].innerHTML.indexOf('✓') !== -1);
  assert.ok(entries[0].innerHTML.indexOf('Click') !== -1);
});

test('appendLogEntry renders a failing step with X mark (Req 7.2)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  env.window.appendLogEntry({
    stepIndex: 0,
    action: 'assertExists',
    target: 'Login__errorMessage',
    value: null,
    ok: false,
    error: 'Element not found'
  });

  var logContainer = env.document.getElementById('log-container');
  var entries = logContainer.querySelectorAll('.log-entry');
  assert.equal(entries.length, 1);
  assert.ok(entries[0].classList.contains('fail'));
  assert.ok(entries[0].innerHTML.indexOf('✗') !== -1);
  assert.ok(entries[0].innerHTML.indexOf('Element not found') !== -1);
});

test('appendLogEntry masks typePassword value with **** (Req 7.2)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  env.window.appendLogEntry({
    stepIndex: 0,
    action: 'typePassword',
    target: 'Login__passwordInput',
    value: 'supersecret123',
    ok: true
  });

  var logContainer = env.document.getElementById('log-container');
  var entry = logContainer.querySelector('.log-entry');
  assert.ok(entry.innerHTML.indexOf('****') !== -1, 'Should show masked value');
  assert.ok(entry.innerHTML.indexOf('supersecret123') === -1, 'Should NOT show real password');
});

test('appendLogEntry renders task header row (Req 7.3)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  env.window.appendLogEntry({ taskName: 'Login__fillCredentials' });

  var logContainer = env.document.getElementById('log-container');
  var entries = logContainer.querySelectorAll('.log-entry');
  assert.equal(entries.length, 1);
  assert.ok(entries[0].classList.contains('task-header'));
  assert.equal(entries[0].textContent, 'Task Login.fillCredentials');
});

test('appendLogEntry renders indented child step (Req 7.3)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  env.window.appendLogEntry({ taskName: 'Login__fillCredentials' });
  env.window.appendLogEntry({
    stepIndex: 0,
    action: 'type',
    target: 'Login__usernameInput',
    value: 'user1',
    ok: true,
    indented: true
  });

  var logContainer = env.document.getElementById('log-container');
  var entries = logContainer.querySelectorAll('.log-entry');
  assert.equal(entries.length, 2);
  assert.ok(entries[1].classList.contains('indented'));
});

test('Pause button sends PAUSE and toggles button states (Req 7.5)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  var pauseBtn = env.document.getElementById('pause-btn');
  var event = env.document.createEvent('Event');
  event.initEvent('click', true, true);
  pauseBtn.dispatchEvent(event);

  assert.equal(env.sentMessages.length, 1);
  assert.equal(env.sentMessages[0].type, 'PAUSE');
  assert.equal(pauseBtn.disabled, true, 'Pause should be disabled after click');

  var continueBtn = env.document.getElementById('continue-btn');
  assert.equal(continueBtn.disabled, false, 'Continue should be enabled after pause');
});

test('Continue button sends CONTINUE and restores button states (Req 7.6)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  // First pause
  var pauseBtn = env.document.getElementById('pause-btn');
  var pauseEvent = env.document.createEvent('Event');
  pauseEvent.initEvent('click', true, true);
  pauseBtn.dispatchEvent(pauseEvent);

  // Then continue
  var continueBtn = env.document.getElementById('continue-btn');
  var contEvent = env.document.createEvent('Event');
  contEvent.initEvent('click', true, true);
  continueBtn.dispatchEvent(contEvent);

  assert.equal(env.sentMessages.length, 2);
  assert.equal(env.sentMessages[1].type, 'CONTINUE');
  assert.equal(continueBtn.disabled, true, 'Continue should be disabled again');
  assert.equal(pauseBtn.disabled, false, 'Pause should be re-enabled');
});

test('Stop button sends STOP and disables itself (Req 7.7)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  var stopBtn = env.document.getElementById('stop-btn');
  var event = env.document.createEvent('Event');
  event.initEvent('click', true, true);
  stopBtn.dispatchEvent(event);

  assert.equal(env.sentMessages.length, 1);
  assert.equal(env.sentMessages[0].type, 'STOP');
  assert.equal(stopBtn.disabled, true);
});

test('onBackgroundMessage LOG appends entry (Req 7.2)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  env.window.onBackgroundMessage({
    type: 'LOG',
    stepIndex: 0,
    action: 'click',
    target: 'Login__submitButton',
    ok: true
  });

  var logContainer = env.document.getElementById('log-container');
  var entries = logContainer.querySelectorAll('.log-entry');
  assert.equal(entries.length, 1);
});

test('onBackgroundMessage MANUAL_PAUSE shows banner (Req 7.8)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  env.window.onBackgroundMessage({
    type: 'MANUAL_PAUSE',
    description: 'Please verify the login form is visible'
  });

  var banner = env.document.getElementById('manual-banner');
  assert.ok(banner.classList.contains('visible'), 'Banner should be visible');

  var desc = env.document.getElementById('manual-description');
  assert.equal(desc.textContent, 'Please verify the login form is visible');
});

test('Manual Continue button sends CONTINUE and hides banner (Req 7.9)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  // Show banner first
  env.window.showManualBanner('Do something manual');

  // Click manual continue
  var manualBtn = env.document.getElementById('manual-continue-btn');
  var event = env.document.createEvent('Event');
  event.initEvent('click', true, true);
  manualBtn.dispatchEvent(event);

  assert.equal(env.sentMessages.length, 1);
  assert.equal(env.sentMessages[0].type, 'CONTINUE');

  var banner = env.document.getElementById('manual-banner');
  assert.ok(!banner.classList.contains('visible'), 'Banner should be hidden after continue');
});

test('onBackgroundMessage RUN_COMPLETE shows summary (Req 7.7)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  env.window.onBackgroundMessage({
    type: 'RUN_COMPLETE',
    total: 5,
    passed: 4,
    failed: 1
  });

  var summaryEl = env.document.getElementById('run-summary');
  assert.equal(summaryEl.style.display, 'block');
  assert.ok(summaryEl.textContent.indexOf('Total: 5') !== -1);
  assert.ok(summaryEl.textContent.indexOf('Passed: 4') !== -1);
  assert.ok(summaryEl.textContent.indexOf('Failed: 1') !== -1);

  var doneActions = env.document.getElementById('run-done-actions');
  assert.equal(doneActions.style.display, 'block');
});

test('onBackgroundMessage RUN_STOPPED shows summary (Req 7.7)', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  env.window.onBackgroundMessage({
    type: 'RUN_STOPPED',
    total: 3,
    passed: 2,
    failed: 0
  });

  var summaryEl = env.document.getElementById('run-summary');
  assert.equal(summaryEl.style.display, 'block');
  assert.ok(summaryEl.textContent.indexOf('Total: 3') !== -1);
  assert.equal(env.window.isRunning, false);
});

test('showRunSummary disables all controller buttons', function () {
  var env = createRunViewEnv();
  env.window.switchToRunView();

  env.window.showRunSummary({ total: 5, passed: 5, failed: 0 });

  var pauseBtn = env.document.getElementById('pause-btn');
  var continueBtn = env.document.getElementById('continue-btn');
  var stopBtn = env.document.getElementById('stop-btn');
  assert.equal(pauseBtn.disabled, true);
  assert.equal(continueBtn.disabled, true);
  assert.equal(stopBtn.disabled, true);
});

test('onBackgroundMessage STATE_SYNC restores run view when running (Req 7.1)', function () {
  var env = createRunViewEnv();

  env.window.onBackgroundMessage({
    type: 'STATE_SYNC',
    running: true,
    paused: false,
    lockedTabId: 1
  });

  var runView = env.document.getElementById('view-run');
  assert.ok(runView.classList.contains('active'), 'Run view should be active');
  assert.equal(env.window.isRunning, true);
});

test('onBackgroundMessage STATE_SYNC restores paused state (Req 7.5)', function () {
  var env = createRunViewEnv();

  env.window.onBackgroundMessage({
    type: 'STATE_SYNC',
    running: true,
    paused: true,
    lockedTabId: 1
  });

  var pauseBtn = env.document.getElementById('pause-btn');
  var continueBtn = env.document.getElementById('continue-btn');
  assert.equal(pauseBtn.disabled, true, 'Pause should be disabled when already paused');
  assert.equal(continueBtn.disabled, false, 'Continue should be enabled when paused');
});

test('onBackgroundMessage STATE_SYNC does not switch view when not running', function () {
  var env = createRunViewEnv();

  env.window.onBackgroundMessage({
    type: 'STATE_SYNC',
    running: false,
    paused: false,
    lockedTabId: null
  });

  var homeView = env.document.getElementById('view-home');
  assert.ok(homeView.classList.contains('active'), 'Home view should remain active');
});


// ---------------------------------------------------------------------------
// Tests: Search Filter (Task 1.1)
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
// ---------------------------------------------------------------------------

function createSearchEnv() {
  var html = '<!DOCTYPE html><html><body>' +
    '<div id="view-home" class="view active">' +
    '  <h1>Tomation</h1>' +
    '  <div id="warning-banner" class="warning-banner"></div>' +
    '  <div class="tab-bar">' +
    '    <button class="tab-btn active" data-tab="tests">☑ Tests</button>' +
    '    <button class="tab-btn" data-tab="automations">⚡ Automations</button>' +
    '  </div>' +
    '  <div id="tab-content-tests" class="tab-content active">' +
    '    <div class="search-wrapper">' +
    '      <input type="text" class="tab-search-input" maxlength="100" placeholder="Search tests..." />' +
    '    </div>' +
    '    <div class="search-empty-state" style="display:none;">No tests found</div>' +
    '  </div>' +
    '  <div id="tab-content-automations" class="tab-content">' +
    '    <div class="search-wrapper">' +
    '      <input type="text" class="tab-search-input" maxlength="100" placeholder="Search automations..." />' +
    '    </div>' +
    '    <div class="search-empty-state" style="display:none;">No automations found</div>' +
    '  </div>' +
    '  <div id="project-content"></div>' +
    '  <div id="search-empty-state" style="display:none;">No tests found</div>' +
    '  <button id="load-spec-btn"></button>' +
    '  <input type="file" id="spec-file-input" />' +
    '</div>' +
    '<div id="view-test-plan" class="view">' +
    '  <h2 id="test-plan-title"></h2>' +
    '  <ul id="step-checklist" class="step-checklist"></ul>' +
    '  <div><button id="run-btn" class="btn btn-primary">Run</button>' +
    '  <button id="back-home-btn" class="btn">Back</button></div>' +
    '</div>' +
    '<div id="view-run" class="view">' +
    '  <h2 id="run-title"></h2>' +
    '  <div class="controller-bar">' +
    '    <button id="pause-btn" class="btn">Pause</button>' +
    '    <button id="continue-btn" class="btn" disabled>Continue</button>' +
    '    <button id="stop-btn" class="btn btn-danger">Stop</button>' +
    '  </div>' +
    '  <div id="manual-banner" class="manual-banner">' +
    '    <p id="manual-description"></p>' +
    '    <button id="manual-continue-btn" class="btn btn-primary">Continue</button>' +
    '  </div>' +
    '  <div id="log-container" class="log-container"></div>' +
    '  <div id="run-summary" class="log-summary" style="display:none;"></div>' +
    '  <div id="run-done-actions" style="display:none;">' +
    '    <button id="back-home-from-run-btn" class="btn">Back to Home</button>' +
    '  </div>' +
    '</div>' +
    '<div id="view-error" class="view"><div id="error-message"></div><button id="error-back-btn"></button></div>' +
    '</body></html>';

  var dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  var window = dom.window;
  var sentMessages = [];

  window.eval('var browser = { ' +
    'runtime: { ' +
    '  sendMessage: function(msg) { window.__sentMessages.push(msg); return Promise.resolve(); }, ' +
    '  onMessage: { addListener: function(fn) { window.__messageListener = fn; } } ' +
    '}, ' +
    'tabs: { ' +
    '  query: function(opts, cb) { cb([]); }, ' +
    '  onActivated: { addListener: function() {} }, ' +
    '  onUpdated: { addListener: function() {} } ' +
    '}, ' +
    'storage: { local: { get: function() { return Promise.resolve({}); }, set: function() { return Promise.resolve(); } } } ' +
    '};');

  window.__sentMessages = sentMessages;

  // Load storage.js
  window.eval(storageJsSource);
  window.eval('getProject = function() { return Promise.resolve(null); };');

  // Load panel.js
  window.eval(panelJsSource);

  // Explicitly call init() to wire up event listeners
  window.init();

  return { dom: dom, window: window, document: window.document, sentMessages: sentMessages };
}

function renderProjectWithSpecs(env, specs) {
  var contentEl = env.document.querySelector('.tab-content.active');
  var html = '';
  for (var i = 0; i < specs.length; i++) {
    var spec = specs[i];
    html += '<div class="spec-section">';
    html += '<div class="spec-header">' + spec.name + '</div>';
    html += '<ul class="test-list">';
    for (var j = 0; j < spec.tests.length; j++) {
      html += '<li data-spec-index="' + i + '" data-test-index="' + j + '">' + spec.tests[j] + '</li>';
    }
    html += '</ul>';
    html += '</div>';
  }
  contentEl.insertAdjacentHTML('beforeend', html);
}

test('filterTests returns all names when query is empty (Req 1.5)', function () {
  var env = createSearchEnv();
  var names = ['Login test', 'Logout test', 'Signup test'];
  var result = env.window.filterTests(names, '');
  assert.deepEqual(result, names);
});

test('filterTests returns all names when query is null-ish (Req 1.5)', function () {
  var env = createSearchEnv();
  var names = ['Login test', 'Logout test'];
  var result = env.window.filterTests(names, null);
  assert.deepEqual(result, names);
});

test('filterTests filters by case-insensitive substring (Req 1.2)', function () {
  var env = createSearchEnv();
  var names = ['Login test', 'Logout test', 'Signup test'];
  var result = env.window.filterTests(names, 'login');
  assert.deepEqual(result, ['Login test']);
});

test('filterTests is case-insensitive for query (Req 1.2)', function () {
  var env = createSearchEnv();
  var names = ['Login test', 'Logout test'];
  var result = env.window.filterTests(names, 'LOGIN');
  assert.deepEqual(result, ['Login test']);
});

test('filterTests returns empty when no match (Req 1.4)', function () {
  var env = createSearchEnv();
  var names = ['Login test', 'Logout test'];
  var result = env.window.filterTests(names, 'zzzzz');
  assert.deepEqual(result, []);
});

test('filterTests handles special characters without regex issues (Req 1.2)', function () {
  var env = createSearchEnv();
  var names = ['Test (login)', 'Test [signup]', 'Test.*pattern'];
  var result = env.window.filterTests(names, '(login)');
  assert.deepEqual(result, ['Test (login)']);
});

test('applySearchFilter hides non-matching test items (Req 1.2)', function () {
  var env = createSearchEnv();
  renderProjectWithSpecs(env, [
    { name: 'Spec A', tests: ['Login test', 'Logout test', 'Signup test'] }
  ]);

  var searchInput = env.document.querySelector('.tab-content.active .tab-search-input');
  searchInput.value = 'login';
  env.window.applySearchFilter();

  var items = env.document.querySelectorAll('.tab-content.active .test-list li');
  assert.equal(items[0].style.display, '', 'Login test should be visible');
  assert.equal(items[1].style.display, 'none', 'Logout test should be hidden');
  assert.equal(items[2].style.display, 'none', 'Signup test should be hidden');
});

test('applySearchFilter hides spec section when no tests match (Req 1.3)', function () {
  var env = createSearchEnv();
  renderProjectWithSpecs(env, [
    { name: 'Spec A', tests: ['Login test'] },
    { name: 'Spec B', tests: ['Signup test'] }
  ]);

  var searchInput = env.document.querySelector('.tab-content.active .tab-search-input');
  searchInput.value = 'signup';
  env.window.applySearchFilter();

  var sections = env.document.querySelectorAll('.tab-content.active .spec-section');
  assert.equal(sections[0].style.display, 'none', 'Spec A section should be hidden');
  assert.equal(sections[1].style.display, '', 'Spec B section should be visible');
});

test('applySearchFilter shows empty state when no tests match anywhere (Req 1.4)', function () {
  var env = createSearchEnv();
  renderProjectWithSpecs(env, [
    { name: 'Spec A', tests: ['Login test'] },
    { name: 'Spec B', tests: ['Signup test'] }
  ]);

  var searchInput = env.document.querySelector('.tab-content.active .tab-search-input');
  searchInput.value = 'zzzznonexistent';
  env.window.applySearchFilter();

  var emptyState = env.document.querySelector('.tab-content.active .search-empty-state');
  assert.equal(emptyState.style.display, 'block', 'Empty state should be shown');
});

test('applySearchFilter restores full list when search is cleared (Req 1.5)', function () {
  var env = createSearchEnv();
  renderProjectWithSpecs(env, [
    { name: 'Spec A', tests: ['Login test', 'Logout test'] },
    { name: 'Spec B', tests: ['Signup test'] }
  ]);

  var searchInput = env.document.querySelector('.tab-content.active .tab-search-input');

  // First, filter
  searchInput.value = 'login';
  env.window.applySearchFilter();

  // Then clear
  searchInput.value = '';
  env.window.applySearchFilter();

  var sections = env.document.querySelectorAll('.tab-content.active .spec-section');
  assert.equal(sections[0].style.display, '', 'Spec A should be visible');
  assert.equal(sections[1].style.display, '', 'Spec B should be visible');

  var items = env.document.querySelectorAll('.tab-content.active .test-list li');
  for (var i = 0; i < items.length; i++) {
    assert.equal(items[i].style.display, '', 'All items should be visible after clearing');
  }

  var emptyState = env.document.querySelector('.tab-content.active .search-empty-state');
  assert.equal(emptyState.style.display, 'none', 'Empty state should be hidden');
});

test('search input fires applySearchFilter on input event (Req 1.1, 1.2)', function () {
  var env = createSearchEnv();
  renderProjectWithSpecs(env, [
    { name: 'Spec A', tests: ['Login test', 'Logout test'] }
  ]);

  var searchInput = env.document.querySelector('.tab-content.active .tab-search-input');
  searchInput.value = 'logout';

  // Fire input event
  var event = env.document.createEvent('Event');
  event.initEvent('input', true, true);
  searchInput.dispatchEvent(event);

  var items = env.document.querySelectorAll('.tab-content.active .test-list li');
  assert.equal(items[0].style.display, 'none', 'Login test should be hidden');
  assert.equal(items[1].style.display, '', 'Logout test should be visible');
});

test('search input has maxlength of 100 (Req 1.1)', function () {
  var env = createSearchEnv();
  var searchInput = env.document.querySelector('.tab-content.active .tab-search-input');
  assert.equal(searchInput.getAttribute('maxlength'), '100');
});

test('applySearchFilter matches tests across multiple specs (Req 1.6 cross-spec)', function () {
  var env = createSearchEnv();
  renderProjectWithSpecs(env, [
    { name: 'Auth Spec', tests: ['Login test', 'Logout test'] },
    { name: 'User Spec', tests: ['Login flow e2e', 'Profile update'] }
  ]);

  var searchInput = env.document.querySelector('.tab-content.active .tab-search-input');
  searchInput.value = 'login';
  env.window.applySearchFilter();

  var sections = env.document.querySelectorAll('.tab-content.active .spec-section');
  // Both specs have a 'login' match
  assert.equal(sections[0].style.display, '', 'Auth Spec should be visible');
  assert.equal(sections[1].style.display, '', 'User Spec should be visible');

  // Verify correct items are shown
  var authItems = sections[0].querySelectorAll('.test-list li');
  assert.equal(authItems[0].style.display, '', 'Login test visible');
  assert.equal(authItems[1].style.display, 'none', 'Logout test hidden');

  var userItems = sections[1].querySelectorAll('.test-list li');
  assert.equal(userItems[0].style.display, '', 'Login flow e2e visible');
  assert.equal(userItems[1].style.display, 'none', 'Profile update hidden');
});
