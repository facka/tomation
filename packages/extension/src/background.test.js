// background.test.js — unit tests for step flattener
var test = require('node:test');
var assert = require('node:assert/strict');

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
    sendMessage: function () {}
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
    }
  }
};

// Mock getProject global (normally provided by storage.js in the extension context)
global.getProject = function () { return Promise.resolve(null); };

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
    else if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
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
    else if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
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
    if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
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


// ---------------------------------------------------------------------------
// Pause / Continue / Stop controls (Task 15.2)
// ---------------------------------------------------------------------------

test('pauseRun sets paused=true and creates a pauseResolve function', function () {
  bg.resetRunState();
  bg.runState.running = true;

  var promise = bg.pauseRun();

  assert.equal(bg.runState.paused, true);
  assert.equal(typeof bg.runState.pauseResolve, 'function');
  assert.ok(promise instanceof Promise);

  // Clean up: resolve the promise so it doesn't hang
  bg.continueRun();
  return promise;
});

test('pauseRun does nothing when not running', function () {
  bg.resetRunState();
  // running is false by default

  var result = bg.pauseRun();

  assert.equal(bg.runState.paused, false);
  assert.equal(bg.runState.pauseResolve, null);
  assert.equal(result, undefined);
});

test('continueRun resolves the pause and sets paused=false', function () {
  bg.resetRunState();
  bg.runState.running = true;

  var promise = bg.pauseRun();
  var resolved = false;

  promise.then(function () { resolved = true; });

  assert.equal(bg.runState.paused, true);
  assert.equal(typeof bg.runState.pauseResolve, 'function');

  bg.continueRun();

  assert.equal(bg.runState.paused, false);
  assert.equal(bg.runState.pauseResolve, null);

  // Allow the promise microtask to settle
  return promise.then(function () {
    assert.equal(resolved, true);
  });
});

test('continueRun does nothing when no pauseResolve exists', function () {
  bg.resetRunState();
  // No crash expected
  bg.continueRun();
  assert.equal(bg.runState.paused, false);
  assert.equal(bg.runState.pauseResolve, null);
});

test('stopRun while paused calls continueRun to unblock', function () {
  bg.resetRunState();
  bg.runState.running = true;

  var promise = bg.pauseRun();

  assert.equal(bg.runState.paused, true);
  assert.equal(typeof bg.runState.pauseResolve, 'function');

  bg.stopRun();

  // stopRequested is set
  assert.equal(bg.runState.stopRequested, true);
  // paused is cleared by continueRun
  assert.equal(bg.runState.paused, false);
  assert.equal(bg.runState.pauseResolve, null);

  // The pause promise should be resolved (not hanging)
  return promise;
});

test('pause during a run suspends step dispatch until continue', function () {
  bg.resetRunState();

  var stepsSent = [];
  var sentSummary = null;

  global.chrome.tabs = {
    update: function () { return Promise.resolve(); },
    sendMessage: function (tabId, msg) {
      stepsSent.push(msg);
      // Pause after first step is sent
      if (stepsSent.length === 1) {
        bg.pauseRun();
      }
      return Promise.resolve({ ok: true });
    }
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
  };

  var testObj = {
    name: 'Pause Test',
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

  var runPromise = bg.startRun(10, testObj, spec, [0, 1, 2]);

  // After the speed delay + microtask tick, step 1 should be done but step 2 should be paused
  return new Promise(function (resolve) {
    setTimeout(function () {
      // Only 1 step sent so far (the pause happened after first step's sendMessage)
      assert.equal(bg.runState.paused, true);

      // Continue the run
      bg.continueRun();

      // Let the rest of the run complete
      runPromise.then(function () {
        assert.equal(stepsSent.length, 3);
        assert.equal(sentSummary.type, 'RUN_COMPLETE');
        assert.equal(sentSummary.total, 3);
        assert.equal(sentSummary.passed, 3);
        resolve();
      });
    }, 200);
  });
});

test('stop while paused unblocks and halts the run', function () {
  bg.resetRunState();

  var stepsSent = [];
  var sentSummary = null;

  global.chrome.tabs = {
    update: function () { return Promise.resolve(); },
    sendMessage: function (tabId, msg) {
      stepsSent.push(msg);
      // Pause after first step
      if (stepsSent.length === 1) {
        bg.pauseRun();
      }
      return Promise.resolve({ ok: true });
    }
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
  };

  var testObj = {
    name: 'Stop While Paused Test',
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

  var runPromise = bg.startRun(10, testObj, spec, [0, 1, 2]);

  return new Promise(function (resolve) {
    setTimeout(function () {
      assert.equal(bg.runState.paused, true);

      // Stop while paused — should unblock and halt
      bg.stopRun();

      runPromise.then(function () {
        // Run should have stopped
        assert.equal(sentSummary.type, 'RUN_STOPPED');
        assert.equal(bg.runState.running, false);
        resolve();
      });
    }, 200);
  });
});


// ---------------------------------------------------------------------------
// Navigate step handling (Task 15.3)
// ---------------------------------------------------------------------------

test('navigate step calls api.tabs.update with url and waits for RUNTIME_READY', function () {
  bg.resetRunState();

  var sentLogs = [];
  var sentSummary = null;
  var navigatedUrl = null;
  var messageListeners = [];

  global.chrome.tabs = {
    update: function (tabId, props) {
      if (props.url) navigatedUrl = props.url;
      return Promise.resolve();
    },
    sendMessage: function () {
      return Promise.resolve({ ok: true });
    }
  };
  global.chrome.runtime.onMessage = {
    addListener: function (fn) { messageListeners.push(fn); },
    removeListener: function (fn) {
      var idx = messageListeners.indexOf(fn);
      if (idx !== -1) messageListeners.splice(idx, 1);
    }
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'LOG') sentLogs.push(msg);
    else if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
  };

  var testObj = {
    name: 'Navigate Test',
    steps: [
      { action: 'navigate', url: 'https://example.com/page2' },
      { action: 'click', target: 'btn' }
    ]
  };
  var spec = {
    tasks: {},
    pageElements: {
      btn: { tag: 'button', where: { id: 'btn' } }
    }
  };

  var runPromise = bg.startRun(10, testObj, spec, [0, 1]);

  // Simulate RUNTIME_READY from the locked tab after a short delay
  return new Promise(function (resolve) {
    setTimeout(function () {
      assert.equal(navigatedUrl, 'https://example.com/page2');
      assert.equal(messageListeners.length, 1);

      // Simulate RUNTIME_READY message from the correct tab
      messageListeners[0]({ type: 'RUNTIME_READY' }, { tab: { id: 10 } });

      runPromise.then(function () {
        // Navigate step logged as ok
        assert.equal(sentLogs[0].action, 'navigate');
        assert.equal(sentLogs[0].ok, true);
        // Second step also executed
        assert.equal(sentLogs[1].action, 'click');
        assert.equal(sentLogs[1].ok, true);
        // Summary
        assert.equal(sentSummary.type, 'RUN_COMPLETE');
        assert.equal(sentSummary.passed, 2);
        // Listener removed after resolve
        assert.equal(messageListeners.length, 0);
        resolve();
      });
    }, 20);
  });
});

test('navigate step times out after 10 seconds if no RUNTIME_READY', function () {
  bg.resetRunState();

  var sentLogs = [];
  var sentSummary = null;
  var messageListeners = [];
  var originalSetTimeout = global.setTimeout;

  // Use fake timers for the timeout test
  var timers = [];
  global.setTimeout = function (fn, ms) {
    var id = timers.length;
    timers.push({ fn: fn, ms: ms });
    return id;
  };
  global.clearTimeout = function (id) {
    if (timers[id]) timers[id] = null;
  };

  global.chrome.tabs = {
    update: function () { return Promise.resolve(); },
    sendMessage: function () { return Promise.resolve({ ok: true }); }
  };
  global.chrome.runtime.onMessage = {
    addListener: function (fn) { messageListeners.push(fn); },
    removeListener: function (fn) {
      var idx = messageListeners.indexOf(fn);
      if (idx !== -1) messageListeners.splice(idx, 1);
    }
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'LOG') sentLogs.push(msg);
    else if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
  };

  var testObj = {
    name: 'Navigate Timeout Test',
    steps: [
      { action: 'navigate', url: 'https://example.com/timeout' }
    ]
  };
  var spec = { tasks: {}, pageElements: {} };

  var runPromise = bg.startRun(10, testObj, spec, [0]);

  // Wait for the navigate handler to set up
  return new Promise(function (resolve) {
    originalSetTimeout(function () {
      // Find the 10-second timeout timer and fire it
      var found = false;
      for (var i = 0; i < timers.length; i++) {
        if (timers[i] && timers[i].ms === 10000) {
          timers[i].fn();
          found = true;
          break;
        }
      }
      assert.ok(found, 'Should have registered a 10s timeout');

      runPromise.then(function () {
        // Navigate step failed with timeout error
        assert.equal(sentLogs.length, 1);
        assert.equal(sentLogs[0].ok, false);
        assert.ok(sentLogs[0].error.indexOf('RUNTIME_READY not received within 10 seconds') !== -1);
        // Run halted
        assert.equal(sentSummary.type, 'RUN_COMPLETE');
        assert.equal(sentSummary.failed, 1);
        // Restore setTimeout
        global.setTimeout = originalSetTimeout;
        resolve();
      });
    }, 20);
  });
});

test('navigate step ignores RUNTIME_READY from wrong tab', function () {
  bg.resetRunState();

  var sentLogs = [];
  var sentSummary = null;
  var messageListeners = [];

  global.chrome.tabs = {
    update: function () { return Promise.resolve(); },
    sendMessage: function () { return Promise.resolve({ ok: true }); }
  };
  global.chrome.runtime.onMessage = {
    addListener: function (fn) { messageListeners.push(fn); },
    removeListener: function (fn) {
      var idx = messageListeners.indexOf(fn);
      if (idx !== -1) messageListeners.splice(idx, 1);
    }
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'LOG') sentLogs.push(msg);
    else if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
  };

  var testObj = {
    name: 'Navigate Wrong Tab Test',
    steps: [
      { action: 'navigate', url: 'https://example.com/page' }
    ]
  };
  var spec = { tasks: {}, pageElements: {} };

  var runPromise = bg.startRun(10, testObj, spec, [0]);

  return new Promise(function (resolve) {
    setTimeout(function () {
      // Send RUNTIME_READY from a different tab (id=999, locked is 10)
      messageListeners[0]({ type: 'RUNTIME_READY' }, { tab: { id: 999 } });

      // Listener should still be active (message was ignored)
      assert.equal(messageListeners.length, 1);

      // Now send from the correct tab
      messageListeners[0]({ type: 'RUNTIME_READY' }, { tab: { id: 10 } });

      runPromise.then(function () {
        assert.equal(sentLogs[0].ok, true);
        assert.equal(sentSummary.type, 'RUN_COMPLETE');
        assert.equal(sentSummary.passed, 1);
        resolve();
      });
    }, 20);
  });
});

// ---------------------------------------------------------------------------
// Wait step handling (Task 15.3)
// ---------------------------------------------------------------------------

test('wait step pauses for specified ms and then advances', function () {
  bg.resetRunState();

  var sentLogs = [];
  var sentSummary = null;

  global.chrome.tabs = {
    update: function () { return Promise.resolve(); },
    sendMessage: function () { return Promise.resolve({ ok: true }); }
  };
  global.chrome.runtime.onMessage = {
    addListener: function () {},
    removeListener: function () {}
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'LOG') sentLogs.push(msg);
    else if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
  };

  var testObj = {
    name: 'Wait Test',
    steps: [
      { action: 'wait', ms: 50 },
      { action: 'click', target: 'btn' }
    ]
  };
  var spec = {
    tasks: {},
    pageElements: {
      btn: { tag: 'button', where: { id: 'btn' } }
    }
  };

  var startTime = Date.now();
  return bg.startRun(10, testObj, spec, [0, 1]).then(function () {
    var elapsed = Date.now() - startTime;
    // Should have waited at least 50ms (with some tolerance)
    assert.ok(elapsed >= 40, 'Should have waited at least ~50ms, got ' + elapsed);
    // Wait step logged as ok
    assert.equal(sentLogs[0].action, 'wait');
    assert.equal(sentLogs[0].ok, true);
    // Click step also executed
    assert.equal(sentLogs[1].action, 'click');
    assert.equal(sentLogs[1].ok, true);
    // Complete
    assert.equal(sentSummary.type, 'RUN_COMPLETE');
    assert.equal(sentSummary.passed, 2);
  });
});

test('wait step respects stopRequested during wait', function () {
  bg.resetRunState();

  var sentSummary = null;

  global.chrome.tabs = {
    update: function () { return Promise.resolve(); },
    sendMessage: function () { return Promise.resolve({ ok: true }); }
  };
  global.chrome.runtime.onMessage = {
    addListener: function () {},
    removeListener: function () {}
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
  };

  var testObj = {
    name: 'Wait Stop Test',
    steps: [
      { action: 'wait', ms: 100 },
      { action: 'click', target: 'btn' }
    ]
  };
  var spec = {
    tasks: {},
    pageElements: {
      btn: { tag: 'button', where: { id: 'btn' } }
    }
  };

  var runPromise = bg.startRun(10, testObj, spec, [0, 1]);

  // Stop during the wait
  return new Promise(function (resolve) {
    setTimeout(function () {
      bg.stopRun();
    }, 30);

    runPromise.then(function () {
      // Run was stopped after the wait completes and checks stopRequested
      assert.equal(sentSummary.type, 'RUN_STOPPED');
      assert.equal(bg.runState.running, false);
      resolve();
    });
  });
});

test('startRun handles mixed navigate and regular steps in sequence', function () {
  bg.resetRunState();

  var sentLogs = [];
  var sentSummary = null;
  var messageListeners = [];

  global.chrome.tabs = {
    update: function () { return Promise.resolve(); },
    sendMessage: function () { return Promise.resolve({ ok: true }); }
  };
  global.chrome.runtime.onMessage = {
    addListener: function (fn) { messageListeners.push(fn); },
    removeListener: function (fn) {
      var idx = messageListeners.indexOf(fn);
      if (idx !== -1) messageListeners.splice(idx, 1);
    }
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'LOG') sentLogs.push(msg);
    else if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
  };

  var testObj = {
    name: 'Mixed Steps Test',
    steps: [
      { action: 'click', target: 'btn' },
      { action: 'navigate', url: 'https://example.com/next' },
      { action: 'click', target: 'btn' }
    ]
  };
  var spec = {
    tasks: {},
    pageElements: {
      btn: { tag: 'button', where: { id: 'btn' } }
    }
  };

  var runPromise = bg.startRun(10, testObj, spec, [0, 1, 2]);

  return new Promise(function (resolve) {
    setTimeout(function () {
      // After first click, navigate should be in progress
      // Send RUNTIME_READY from the locked tab
      if (messageListeners.length > 0) {
        messageListeners[0]({ type: 'RUNTIME_READY' }, { tab: { id: 10 } });
      }

      runPromise.then(function () {
        assert.equal(sentLogs.length, 3);
        assert.equal(sentLogs[0].action, 'click');
        assert.equal(sentLogs[0].ok, true);
        assert.equal(sentLogs[1].action, 'navigate');
        assert.equal(sentLogs[1].ok, true);
        assert.equal(sentLogs[2].action, 'click');
        assert.equal(sentLogs[2].ok, true);
        assert.equal(sentSummary.type, 'RUN_COMPLETE');
        assert.equal(sentSummary.passed, 3);
        resolve();
      });
    }, 200);
  });
});

// ---------------------------------------------------------------------------
// Manual step handling (Task 15.4)
// ---------------------------------------------------------------------------

test('manual step emits MANUAL_PAUSE and waits for continue', function () {
  bg.resetRunState();

  var sentLogs = [];
  var sentMessages = [];
  var sentSummary = null;

  global.chrome.tabs = {
    update: function () { return Promise.resolve(); },
    sendMessage: function (tabId, msg) {
      return Promise.resolve({ ok: true });
    }
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'LOG') sentLogs.push(msg);
    else if (msg.type === 'MANUAL_PAUSE') sentMessages.push(msg);
    else if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
  };

  var testObj = {
    name: 'Manual Step Test',
    steps: [
      { action: 'click', target: 'btn' },
      { action: 'manual', description: 'Please verify the page looks correct' },
      { action: 'click', target: 'btn' }
    ]
  };
  var spec = {
    tasks: {},
    pageElements: {
      btn: { tag: 'button', where: { id: 'btn' } }
    }
  };

  var runPromise = bg.startRun(10, testObj, spec, [0, 1, 2]);

  return new Promise(function (resolve) {
    setTimeout(function () {
      // After first click, manual step should have emitted MANUAL_PAUSE
      assert.equal(sentMessages.length, 1);
      assert.equal(sentMessages[0].type, 'MANUAL_PAUSE');
      assert.equal(sentMessages[0].description, 'Please verify the page looks correct');

      // Run should be paused
      assert.equal(bg.runState.paused, true);

      // Simulate user clicking Continue in the panel
      bg.continueRun();

      runPromise.then(function () {
        // All 3 steps logged
        assert.equal(sentLogs.length, 3);
        assert.equal(sentLogs[0].action, 'click');
        assert.equal(sentLogs[0].ok, true);
        assert.equal(sentLogs[1].action, 'manual');
        assert.equal(sentLogs[1].ok, true);
        assert.equal(sentLogs[2].action, 'click');
        assert.equal(sentLogs[2].ok, true);

        // Summary
        assert.equal(sentSummary.type, 'RUN_COMPLETE');
        assert.equal(sentSummary.passed, 3);
        assert.equal(sentSummary.failed, 0);
        resolve();
      });
    }, 250);
  });
});

test('manual step respects stopRequested when continued', function () {
  bg.resetRunState();

  var sentLogs = [];
  var sentMessages = [];
  var sentSummary = null;

  global.chrome.tabs = {
    update: function () { return Promise.resolve(); },
    sendMessage: function (tabId, msg) {
      return Promise.resolve({ ok: true });
    }
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'LOG') sentLogs.push(msg);
    else if (msg.type === 'MANUAL_PAUSE') sentMessages.push(msg);
    else if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
  };

  var testObj = {
    name: 'Manual Stop Test',
    steps: [
      { action: 'manual', description: 'Do something manually' },
      { action: 'click', target: 'btn' }
    ]
  };
  var spec = {
    tasks: {},
    pageElements: {
      btn: { tag: 'button', where: { id: 'btn' } }
    }
  };

  var runPromise = bg.startRun(10, testObj, spec, [0, 1]);

  return new Promise(function (resolve) {
    setTimeout(function () {
      // Manual step should have emitted MANUAL_PAUSE
      assert.equal(sentMessages.length, 1);
      assert.equal(bg.runState.paused, true);

      // Stop the run while paused on manual step
      bg.stopRun();

      runPromise.then(function () {
        // Run should have stopped
        assert.equal(sentSummary.type, 'RUN_STOPPED');
        assert.equal(bg.runState.running, false);
        resolve();
      });
    }, 50);
  });
});


// ---------------------------------------------------------------------------
// Message Router (Task 15.5)
// ---------------------------------------------------------------------------

test('handleMessage routes PAUSE to pauseRun', function () {
  bg.resetRunState();
  bg.runState.running = true;

  bg.handleMessage({ type: 'PAUSE' }, {}, function () {});

  assert.equal(bg.runState.paused, true);

  // Clean up
  bg.continueRun();
});

test('handleMessage routes CONTINUE to continueRun', function () {
  bg.resetRunState();
  bg.runState.running = true;
  bg.pauseRun();

  assert.equal(bg.runState.paused, true);

  bg.handleMessage({ type: 'CONTINUE' }, {}, function () {});

  assert.equal(bg.runState.paused, false);
});

test('handleMessage routes STOP to stopRun', function () {
  bg.resetRunState();
  bg.runState.running = true;

  bg.handleMessage({ type: 'STOP' }, {}, function () {});

  assert.equal(bg.runState.stopRequested, true);
});

test('handleMessage ignores null or missing type', function () {
  bg.resetRunState();
  // Should not throw
  bg.handleMessage(null, {}, function () {});
  bg.handleMessage({}, {}, function () {});
  bg.handleMessage({ type: 'UNKNOWN' }, {}, function () {});
  assert.equal(bg.runState.running, false);
});

test('handleRunTest queries active tab and starts run with correct spec/test', function () {
  bg.resetRunState();

  var startedWith = null;
  var sentLogs = [];
  var sentSummary = null;

  global.chrome.tabs = {
    query: function () {
      return Promise.resolve([{
        id: 42,
        url: 'https://example.com/dashboard'
      }]);
    },
    update: function () { return Promise.resolve(); },
    sendMessage: function (tabId, msg) {
      return Promise.resolve({ ok: true });
    }
  };
  global.chrome.runtime.sendMessage = function (msg) {
    if (msg.type === 'LOG') sentLogs.push(msg);
    else if (msg.type === 'RUN_COMPLETE' || msg.type === 'RUN_STOPPED') sentSummary = msg;
  };

  var mockSpec = {
    format: 'tomation-spec',
    version: 1,
    pageElements: {
      btn: { tag: 'button', where: { id: 'btn' } }
    },
    tasks: {},
    tests: [
      { name: 'First Test', steps: [{ action: 'click', target: 'btn' }] },
      { name: 'Second Test', steps: [{ action: 'click', target: 'btn' }] }
    ]
  };

  global.getProject = function (hostname) {
    assert.equal(hostname, 'example.com');
    return Promise.resolve({
      host: 'example.com',
      name: 'Example',
      specs: [{ id: 'abc', filename: 'spec.json', spec: mockSpec }]
    });
  };

  bg.handleRunTest({ type: 'RUN_TEST', testIndex: 1, checkedSteps: [0] });

  // Allow promises to resolve (click step has 150ms FAST speed delay)
  return new Promise(function (resolve) {
    setTimeout(function () {
      // The second test (index 1) should have been run
      assert.equal(sentLogs.length, 1);
      assert.equal(sentLogs[0].action, 'click');
      assert.equal(sentLogs[0].ok, true);
      assert.equal(sentSummary.type, 'RUN_COMPLETE');
      resolve();
    }, 250);
  });
});

test('handleRunTest does nothing when no active tabs', function () {
  bg.resetRunState();

  global.chrome.tabs = {
    query: function () { return Promise.resolve([]); }
  };

  // Should not throw or start a run
  bg.handleRunTest({ type: 'RUN_TEST', testIndex: 0, checkedSteps: [0] });

  return new Promise(function (resolve) {
    setTimeout(function () {
      assert.equal(bg.runState.running, false);
      resolve();
    }, 50);
  });
});

test('handleRunTest does nothing when no project exists for hostname', function () {
  bg.resetRunState();

  global.chrome.tabs = {
    query: function () {
      return Promise.resolve([{
        id: 42,
        url: 'https://unknown.com/page'
      }]);
    }
  };

  global.getProject = function () { return Promise.resolve(null); };

  bg.handleRunTest({ type: 'RUN_TEST', testIndex: 0, checkedSteps: [0] });

  return new Promise(function (resolve) {
    setTimeout(function () {
      assert.equal(bg.runState.running, false);
      resolve();
    }, 50);
  });
});

test('handlePanelConnect sends STATE_SYNC on panel port', function () {
  bg.resetRunState();
  bg.runState.running = true;
  bg.runState.paused = true;
  bg.runState.lockedTabId = 77;

  var sentMsg = null;
  var port = {
    name: 'panel',
    postMessage: function (msg) { sentMsg = msg; }
  };

  bg.handlePanelConnect(port);

  assert.equal(sentMsg.type, 'STATE_SYNC');
  assert.equal(sentMsg.running, true);
  assert.equal(sentMsg.paused, true);
  assert.equal(sentMsg.lockedTabId, 77);
});

test('handlePanelConnect ignores non-panel ports', function () {
  bg.resetRunState();

  var sentMsg = null;
  var port = {
    name: 'other',
    postMessage: function (msg) { sentMsg = msg; }
  };

  bg.handlePanelConnect(port);

  assert.equal(sentMsg, null);
});

test('initMessageRouter registers listeners', function () {
  var addedMessageListener = null;
  var addedConnectListener = null;

  global.chrome.runtime.onMessage = {
    addListener: function (fn) { addedMessageListener = fn; },
    removeListener: function () {}
  };
  global.chrome.runtime.onConnect = {
    addListener: function (fn) { addedConnectListener = fn; }
  };

  bg.initMessageRouter();

  assert.equal(addedMessageListener, bg.handleMessage);
  assert.equal(addedConnectListener, bg.handlePanelConnect);
});
