// background.test.js — unit tests for step flattener
var test = require('node:test');
var assert = require('node:assert/strict');

// Mock chrome/browser global before requiring background.js
global.chrome = { runtime: { onMessage: { addListener: function () {} }, sendMessage: function () {} } };
var bg = require('./background.js');

// ---------------------------------------------------------------------------
// generateRandom
// ---------------------------------------------------------------------------

test('generateRandom produces string of default length 8', function () {
  var r = bg.generateRandom();
  assert.equal(r.length, 8);
  assert.ok(/^[a-z0-9]+$/.test(r));
});

test('generateRandom produces string of specified length', function () {
  var r = bg.generateRandom(12);
  assert.equal(r.length, 12);
});

// ---------------------------------------------------------------------------
// resolveValue
// ---------------------------------------------------------------------------

test('resolveValue replaces $random with 8-char string', function () {
  var result = bg.resolveValue('$random', {});
  assert.equal(result.length, 8);
  assert.ok(/^[a-z0-9]+$/.test(result));
});

test('resolveValue replaces {{param}} tokens', function () {
  var result = bg.resolveValue('hello {{name}}!', { name: 'world' });
  assert.equal(result, 'hello world!');
});

test('resolveValue replaces multiple params', function () {
  var result = bg.resolveValue('{{a}} and {{b}}', { a: 'foo', b: 'bar' });
  assert.equal(result, 'foo and bar');
});

test('resolveValue warns and substitutes empty for missing params', function () {
  var result = bg.resolveValue('hi {{missing}}!', {});
  assert.equal(result, 'hi !');
});

test('resolveValue handles embedded $random', function () {
  var result = bg.resolveValue('user-$random@test.com', {});
  // Should be "user-XXXXXXXX@test.com" where X is alphanumeric
  assert.ok(/^user-[a-z0-9]{8}@test\.com$/.test(result));
});

test('resolveValue returns non-string values unchanged', function () {
  assert.equal(bg.resolveValue(null, {}), null);
  assert.equal(bg.resolveValue(undefined, {}), undefined);
  assert.equal(bg.resolveValue(42, {}), 42);
});

// ---------------------------------------------------------------------------
// flattenSteps — basic expansion
// ---------------------------------------------------------------------------

test('flattenSteps expands simple steps without tasks', function () {
  var steps = [
    { action: 'click', target: 'btn' },
    { action: 'type', target: 'input', value: 'hello' }
  ];
  var pageElements = {
    btn: { tag: 'button', where: { id: 'btn' } },
    input: { tag: 'input', where: { id: 'inp' } }
  };

  var result = bg.flattenSteps(steps, {}, pageElements, [0, 1]);
  assert.equal(result.length, 2);
  assert.equal(result[0].action, 'click');
  assert.equal(result[0].target, 'btn');
  assert.deepEqual(result[0].elementDescriptor, pageElements.btn);
  assert.equal(result[1].action, 'type');
  assert.equal(result[1].value, 'hello');
});

test('flattenSteps expands task actions inline', function () {
  var steps = [
    { action: 'task', name: 'myTask' }
  ];
  var tasks = {
    myTask: {
      steps: [
        { action: 'click', target: 'btn' },
        { action: 'type', target: 'input', value: 'test' }
      ]
    }
  };
  var pageElements = {
    btn: { tag: 'button', where: { id: 'btn' } },
    input: { tag: 'input', where: { id: 'inp' } }
  };

  var result = bg.flattenSteps(steps, tasks, pageElements, [0]);
  assert.equal(result.length, 2);
  assert.equal(result[0].action, 'click');
  assert.equal(result[1].action, 'type');
  assert.equal(result[1].value, 'test');
});

test('flattenSteps resolves task params', function () {
  var steps = [
    { action: 'task', name: 'login', params: { user: 'admin', pass: 'secret' } }
  ];
  var tasks = {
    login: {
      params: ['user', 'pass'],
      steps: [
        { action: 'type', target: 'userInput', value: '{{user}}' },
        { action: 'typePassword', target: 'passInput', value: '{{pass}}' }
      ]
    }
  };
  var pageElements = {
    userInput: { tag: 'input', where: { id: 'user' } },
    passInput: { tag: 'input', where: { id: 'pass' } }
  };

  var result = bg.flattenSteps(steps, tasks, pageElements, [0]);
  assert.equal(result.length, 2);
  assert.equal(result[0].value, 'admin');
  assert.equal(result[1].value, 'secret');
});

// ---------------------------------------------------------------------------
// flattenSteps — skipped steps
// ---------------------------------------------------------------------------

test('flattenSteps skips unchecked steps', function () {
  var steps = [
    { action: 'click', target: 'btn' },
    { action: 'type', target: 'input', value: 'hello' },
    { action: 'click', target: 'btn' }
  ];
  var pageElements = {
    btn: { tag: 'button', where: { id: 'btn' } },
    input: { tag: 'input', where: { id: 'inp' } }
  };

  // Only check indexes 0 and 2
  var result = bg.flattenSteps(steps, {}, pageElements, [0, 2]);
  assert.equal(result.length, 2);
  assert.equal(result[0].action, 'click');
  assert.equal(result[1].action, 'click');
});

test('flattenSteps includes all steps when no checked set provided', function () {
  var steps = [
    { action: 'click', target: 'btn' },
    { action: 'type', target: 'input', value: 'hi' }
  ];
  var pageElements = {
    btn: { tag: 'button', where: { id: 'btn' } },
    input: { tag: 'input', where: { id: 'inp' } }
  };

  var result = bg.flattenSteps(steps, {}, pageElements, null);
  assert.equal(result.length, 2);
});

// ---------------------------------------------------------------------------
// flattenSteps — $random resolution
// ---------------------------------------------------------------------------

test('flattenSteps resolves $random in step values', function () {
  var steps = [
    { action: 'type', target: 'input', value: '$random' }
  ];
  var pageElements = {
    input: { tag: 'input', where: { id: 'inp' } }
  };

  var result = bg.flattenSteps(steps, {}, pageElements, [0]);
  assert.equal(result.length, 1);
  assert.ok(/^[a-z0-9]{8}$/.test(result[0].value));
});

test('flattenSteps resolves $random inside task params', function () {
  var steps = [
    { action: 'task', name: 'createUser', params: { email: '$random' } }
  ];
  var tasks = {
    createUser: {
      params: ['email'],
      steps: [
        { action: 'type', target: 'input', value: '{{email}}' }
      ]
    }
  };
  var pageElements = {
    input: { tag: 'input', where: { id: 'inp' } }
  };

  var result = bg.flattenSteps(steps, tasks, pageElements, [0]);
  assert.equal(result.length, 1);
  assert.ok(/^[a-z0-9]{8}$/.test(result[0].value));
});

// ---------------------------------------------------------------------------
// flattenSteps — nested tasks
// ---------------------------------------------------------------------------

test('flattenSteps handles nested task expansion', function () {
  var steps = [
    { action: 'task', name: 'outer' }
  ];
  var tasks = {
    outer: {
      steps: [
        { action: 'click', target: 'btn' },
        { action: 'task', name: 'inner' }
      ]
    },
    inner: {
      steps: [
        { action: 'type', target: 'input', value: 'nested' }
      ]
    }
  };
  var pageElements = {
    btn: { tag: 'button', where: { id: 'btn' } },
    input: { tag: 'input', where: { id: 'inp' } }
  };

  var result = bg.flattenSteps(steps, tasks, pageElements, [0]);
  assert.equal(result.length, 2);
  assert.equal(result[0].action, 'click');
  assert.equal(result[1].action, 'type');
  assert.equal(result[1].value, 'nested');
});

// ---------------------------------------------------------------------------
// flattenSteps — childOf / parentDescriptor
// ---------------------------------------------------------------------------

test('flattenSteps attaches parentDescriptor when childOf is present', function () {
  var steps = [
    { action: 'click', target: 'childEl' }
  ];
  var pageElements = {
    parentEl: { tag: 'div', where: { id: 'container' } },
    childEl: { tag: 'button', childOf: 'container', where: { textIs: 'Submit' } }
  };

  var result = bg.flattenSteps(steps, {}, pageElements, [0]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].elementDescriptor, pageElements.childEl);
  assert.deepEqual(result[0].parentDescriptor, pageElements.parentEl);
});

test('flattenSteps does not attach parentDescriptor when childOf is absent', function () {
  var steps = [
    { action: 'click', target: 'btn' }
  ];
  var pageElements = {
    btn: { tag: 'button', where: { id: 'btn' } }
  };

  var result = bg.flattenSteps(steps, {}, pageElements, [0]);
  assert.equal(result.length, 1);
  assert.equal(result[0].parentDescriptor, undefined);
});

// ---------------------------------------------------------------------------
// flattenSteps — non-targeted step actions
// ---------------------------------------------------------------------------

test('flattenSteps handles navigate steps', function () {
  var steps = [
    { action: 'navigate', url: 'https://example.com/{{page}}' }
  ];
  var tasks = {};
  var pageElements = {};

  // Expand inside a task that provides the param
  var outerSteps = [
    { action: 'task', name: 'goTo', params: { page: 'dashboard' } }
  ];
  var outerTasks = {
    goTo: {
      params: ['page'],
      steps: steps
    }
  };

  var result = bg.flattenSteps(outerSteps, outerTasks, pageElements, [0]);
  assert.equal(result.length, 1);
  assert.equal(result[0].action, 'navigate');
  assert.equal(result[0].url, 'https://example.com/dashboard');
});

test('flattenSteps handles wait steps', function () {
  var steps = [
    { action: 'wait', ms: 1000 }
  ];
  var result = bg.flattenSteps(steps, {}, {}, [0]);
  assert.equal(result.length, 1);
  assert.equal(result[0].action, 'wait');
  assert.equal(result[0].ms, 1000);
});

test('flattenSteps handles manual steps', function () {
  var steps = [
    { action: 'manual', description: 'Check the page' }
  ];
  var result = bg.flattenSteps(steps, {}, {}, [0]);
  assert.equal(result.length, 1);
  assert.equal(result[0].action, 'manual');
  assert.equal(result[0].description, 'Check the page');
});

// ---------------------------------------------------------------------------
// flattenSteps — ensures no unresolved tokens
// ---------------------------------------------------------------------------

test('flattenSteps leaves no unresolved {{}} tokens', function () {
  var steps = [
    { action: 'type', target: 'input', value: '{{missing}}' }
  ];
  var pageElements = {
    input: { tag: 'input', where: { id: 'inp' } }
  };

  var result = bg.flattenSteps(steps, {}, pageElements, [0]);
  assert.equal(result[0].value, '');
  // No {{...}} tokens remain
  assert.ok(result[0].value.indexOf('{{') === -1);
});

// ---------------------------------------------------------------------------
// findParentDescriptor
// ---------------------------------------------------------------------------

test('findParentDescriptor finds correct parent by childOf id', function () {
  var pageElements = {
    container: { tag: 'div', where: { id: 'main-container' } },
    other: { tag: 'span', where: { textIs: 'hello' } }
  };
  var parent = bg.findParentDescriptor('main-container', pageElements);
  assert.deepEqual(parent, pageElements.container);
});

test('findParentDescriptor returns null when no match', function () {
  var pageElements = {
    other: { tag: 'span', where: { textIs: 'hello' } }
  };
  var parent = bg.findParentDescriptor('nonexistent', pageElements);
  assert.equal(parent, null);
});

// ---------------------------------------------------------------------------
// flattenSteps with Set-based checkedIndexes
// ---------------------------------------------------------------------------

test('flattenSteps works with a native Set for checkedIndexes', function () {
  var steps = [
    { action: 'click', target: 'btn' },
    { action: 'type', target: 'input', value: 'skip me' },
    { action: 'click', target: 'btn' }
  ];
  var pageElements = {
    btn: { tag: 'button', where: { id: 'btn' } },
    input: { tag: 'input', where: { id: 'inp' } }
  };

  var checked = new Set([0, 2]);
  var result = bg.flattenSteps(steps, {}, pageElements, checked);
  assert.equal(result.length, 2);
  assert.equal(result[0].action, 'click');
  assert.equal(result[1].action, 'click');
});


// ---------------------------------------------------------------------------
// Run State Machine tests (Task 15)
// ---------------------------------------------------------------------------

test('resetRunState resets all fields to defaults', function () {
  bg.runState.running = true;
  bg.runState.paused = true;
  bg.runState.stopRequested = true;
  bg.runState.lockedTabId = 42;
  bg.runState.currentTestName = 'test';
  bg.runState.steps = [{ action: 'click' }];
  bg.runState.stepIndex = 5;
  bg.runState.passCount = 3;
  bg.runState.failCount = 2;
  bg.runState.pauseResolve = function () {};

  bg.resetRunState();

  assert.equal(bg.runState.running, false);
  assert.equal(bg.runState.paused, false);
  assert.equal(bg.runState.stopRequested, false);
  assert.equal(bg.runState.lockedTabId, null);
  assert.equal(bg.runState.currentTestName, '');
  assert.deepEqual(bg.runState.steps, []);
  assert.equal(bg.runState.stepIndex, 0);
  assert.equal(bg.runState.passCount, 0);
  assert.equal(bg.runState.failCount, 0);
  assert.equal(bg.runState.pauseResolve, null);
});

test('lockTab stores tabId and calls api.tabs.update', function () {
  bg.resetRunState();

  var updatedTabId = null;
  var updatedProps = null;
  global.chrome.tabs = {
    update: function (tabId, props) {
      updatedTabId = tabId;
      updatedProps = props;
      return Promise.resolve();
    }
  };

  return bg.lockTab(99).then(function () {
    assert.equal(bg.runState.lockedTabId, 99);
    assert.equal(updatedTabId, 99);
    assert.deepEqual(updatedProps, { active: true });
  });
});

test('unlockTab clears lockedTabId', function () {
  bg.resetRunState();
  bg.runState.lockedTabId = 42;

  bg.unlockTab();

  assert.equal(bg.runState.lockedTabId, null);
});

test('emitLog sends LOG message via api.runtime.sendMessage', function () {
  var sentMsg = null;
  global.chrome.runtime.sendMessage = function (msg) { sentMsg = msg; };

  bg.emitLog(3, { action: 'click', target: 'btn', value: null }, true, undefined);

  assert.equal(sentMsg.type, 'LOG');
  assert.equal(sentMsg.stepIndex, 3);
  assert.equal(sentMsg.action, 'click');
  assert.equal(sentMsg.target, 'btn');
  assert.equal(sentMsg.ok, true);
  assert.equal(sentMsg.error, undefined);
});

test('emitLog includes error when step fails', function () {
  var sentMsg = null;
  global.chrome.runtime.sendMessage = function (msg) { sentMsg = msg; };

  bg.emitLog(1, { action: 'type', target: 'input', value: 'hello' }, false, 'Element not found');

  assert.equal(sentMsg.type, 'LOG');
  assert.equal(sentMsg.ok, false);
  assert.equal(sentMsg.error, 'Element not found');
});

test('emitSummary sends RUN_COMPLETE message', function () {
  var sentMsg = null;
  global.chrome.runtime.sendMessage = function (msg) { sentMsg = msg; };

  bg.emitSummary('RUN_COMPLETE', 5, 4, 1);

  assert.equal(sentMsg.type, 'RUN_COMPLETE');
  assert.equal(sentMsg.total, 5);
  assert.equal(sentMsg.passed, 4);
  assert.equal(sentMsg.failed, 1);
});

test('emitSummary sends RUN_STOPPED message', function () {
  var sentMsg = null;
  global.chrome.runtime.sendMessage = function (msg) { sentMsg = msg; };

  bg.emitSummary('RUN_STOPPED', 3, 2, 0);

  assert.equal(sentMsg.type, 'RUN_STOPPED');
  assert.equal(sentMsg.total, 3);
  assert.equal(sentMsg.passed, 2);
  assert.equal(sentMsg.failed, 0);
});

test('startRun flattens steps, locks tab, and runs step loop to completion', function () {
  bg.resetRunState();

  var sentSteps = [];
  var sentLogs = [];
  var sentSummary = null;

  global.chrome.tabs = {
    update: function () { return Promise.resolve(); },
    sendMessage: function (tabId, msg) {
      sentSteps.push(msg);
      return Promise.resolve({ ok: true });
    }
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'LOG') sentLogs.push(msg);
    else sentSummary = msg;
  };

  var testObj = {
    name: 'Login Test',
    steps: [
      { action: 'click', target: 'btn' },
      { action: 'type', target: 'input', value: 'hello' }
    ]
  };
  var spec = {
    tasks: {},
    pageElements: {
      btn: { tag: 'button', where: { id: 'btn' } },
      input: { tag: 'input', where: { id: 'inp' } }
    }
  };

  return bg.startRun(10, testObj, spec, [0, 1]).then(function () {
    // Both steps sent to runtime
    assert.equal(sentSteps.length, 2);
    assert.equal(sentSteps[0].action, 'click');
    assert.equal(sentSteps[1].action, 'type');

    // LOG emitted per step
    assert.equal(sentLogs.length, 2);
    assert.equal(sentLogs[0].ok, true);
    assert.equal(sentLogs[1].ok, true);

    // Summary emitted
    assert.equal(sentSummary.type, 'RUN_COMPLETE');
    assert.equal(sentSummary.total, 2);
    assert.equal(sentSummary.passed, 2);
    assert.equal(sentSummary.failed, 0);

    // State is reset after run
    assert.equal(bg.runState.running, false);
    assert.equal(bg.runState.lockedTabId, null);
  });
});

test('startRun halts on step failure and emits RUN_COMPLETE with failure', function () {
  bg.resetRunState();

  var sentLogs = [];
  var sentSummary = null;

  global.chrome.tabs = {
    update: function () { return Promise.resolve(); },
    sendMessage: function (tabId, msg) {
      if (msg.stepIndex === 0) return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: false, error: 'Element not found' });
    }
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'LOG') sentLogs.push(msg);
    else sentSummary = msg;
  };

  var testObj = {
    name: 'Fail Test',
    steps: [
      { action: 'click', target: 'btn' },
      { action: 'click', target: 'btn' },
      { action: 'click', target: 'btn' }
    ]
  };
  var spec = {
    tasks: {},
    pageElements: {
      btn: { tag: 'button', where: { id: 'btn' } }
    }
  };

  return bg.startRun(10, testObj, spec, [0, 1, 2]).then(function () {
    // Only 2 steps attempted (halts on second failure)
    assert.equal(sentLogs.length, 2);
    assert.equal(sentLogs[0].ok, true);
    assert.equal(sentLogs[1].ok, false);
    assert.equal(sentLogs[1].error, 'Element not found');

    // Summary indicates failure
    assert.equal(sentSummary.type, 'RUN_COMPLETE');
    assert.equal(sentSummary.total, 2);
    assert.equal(sentSummary.passed, 1);
    assert.equal(sentSummary.failed, 1);

    // Tab unlocked
    assert.equal(bg.runState.lockedTabId, null);
  });
});

test('stopRun sets stopRequested flag and run emits RUN_STOPPED', function () {
  bg.resetRunState();

  var sentSummary = null;
  var stepCount = 0;

  global.chrome.tabs = {
    update: function () { return Promise.resolve(); },
    sendMessage: function (tabId, msg) {
      stepCount++;
      // Stop after first step
      if (stepCount === 1) {
        bg.stopRun();
      }
      return Promise.resolve({ ok: true });
    }
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type !== 'LOG') sentSummary = msg;
  };

  var testObj = {
    name: 'Stop Test',
    steps: [
      { action: 'click', target: 'btn' },
      { action: 'click', target: 'btn' },
      { action: 'click', target: 'btn' }
    ]
  };
  var spec = {
    tasks: {},
    pageElements: {
      btn: { tag: 'button', where: { id: 'btn' } }
    }
  };

  return bg.startRun(10, testObj, spec, [0, 1, 2]).then(function () {
    // Run was stopped
    assert.equal(sentSummary.type, 'RUN_STOPPED');
    assert.equal(bg.runState.running, false);
    assert.equal(bg.runState.lockedTabId, null);
  });
});

test('stopRun does nothing when not running', function () {
  bg.resetRunState();
  bg.stopRun();
  assert.equal(bg.runState.stopRequested, false);
});

test('sendStepToRuntime sends EXECUTE_STEP message with stepIndex', function () {
  bg.resetRunState();
  bg.runState.lockedTabId = 55;

  var sentTabId = null;
  var sentMsg = null;
  global.chrome.tabs = {
    sendMessage: function (tabId, msg) {
      sentTabId = tabId;
      sentMsg = msg;
      return Promise.resolve({ ok: true });
    }
  };

  var step = { action: 'click', target: 'btn', elementDescriptor: { tag: 'button' } };
  return bg.sendStepToRuntime(step, 7).then(function (result) {
    assert.equal(sentTabId, 55);
    assert.equal(sentMsg.type, 'EXECUTE_STEP');
    assert.equal(sentMsg.stepIndex, 7);
    assert.equal(sentMsg.action, 'click');
    assert.equal(sentMsg.target, 'btn');
    assert.equal(result.ok, true);
  });
});
