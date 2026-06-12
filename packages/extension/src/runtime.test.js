'use strict';

/**
 * Tests for runtime.js — element finder logic.
 *
 * Requirements: 2.1, 2.2, 2.2a, 2.3, 2.4
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

// ---------------------------------------------------------------------------
// Setup: load runtime.js in a jsdom environment with necessary globals
// ---------------------------------------------------------------------------

var dom;
var window;

function setupDOM(html) {
  dom = new JSDOM(html || '<html><body></body></html>', {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
  });
  window = dom.window;

  // Provide the browser/chrome global the runtime expects
  window.eval('var browser = { runtime: { onMessage: { addListener: function(){} }, sendMessage: function(){} } };');

  // Load runtime.js source into the jsdom window
  var fs = require('fs');
  var path = require('path');
  var runtimeSrc = fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8');
  window.eval(runtimeSrc);
}

// ---------------------------------------------------------------------------
// matchesWhere tests
// ---------------------------------------------------------------------------

test('matchesWhere: matches element by id', function () {
  setupDOM('<html><body><div id="test-div"></div></body></html>');
  var el = window.document.getElementById('test-div');
  var result = window.eval('matchesWhere')(el, { id: 'test-div' });
  assert.equal(result, true);
});

test('matchesWhere: rejects element with wrong id', function () {
  setupDOM('<html><body><div id="test-div"></div></body></html>');
  var el = window.document.getElementById('test-div');
  var result = window.eval('matchesWhere')(el, { id: 'other' });
  assert.equal(result, false);
});

test('matchesWhere: matches textIs (trimmed)', function () {
  setupDOM('<html><body><span id="s">  Hello World  </span></body></html>');
  var el = window.document.getElementById('s');
  var result = window.eval('matchesWhere')(el, { textIs: 'Hello World' });
  assert.equal(result, true);
});

test('matchesWhere: rejects textIs mismatch', function () {
  setupDOM('<html><body><span id="s">Hello</span></body></html>');
  var el = window.document.getElementById('s');
  var result = window.eval('matchesWhere')(el, { textIs: 'World' });
  assert.equal(result, false);
});

test('matchesWhere: matches textContains', function () {
  setupDOM('<html><body><p id="p">The quick brown fox</p></body></html>');
  var el = window.document.getElementById('p');
  var result = window.eval('matchesWhere')(el, { textContains: 'quick brown' });
  assert.equal(result, true);
});

test('matchesWhere: rejects textContains when substring not present', function () {
  setupDOM('<html><body><p id="p">Hello</p></body></html>');
  var el = window.document.getElementById('p');
  var result = window.eval('matchesWhere')(el, { textContains: 'xyz' });
  assert.equal(result, false);
});

test('matchesWhere: matches classIncludes', function () {
  setupDOM('<html><body><div id="d" class="foo bar baz"></div></body></html>');
  var el = window.document.getElementById('d');
  var result = window.eval('matchesWhere')(el, { classIncludes: 'bar' });
  assert.equal(result, true);
});

test('matchesWhere: rejects classIncludes when class not present', function () {
  setupDOM('<html><body><div id="d" class="foo baz"></div></body></html>');
  var el = window.document.getElementById('d');
  var result = window.eval('matchesWhere')(el, { classIncludes: 'bar' });
  assert.equal(result, false);
});

test('matchesWhere: matches placeholder attribute', function () {
  setupDOM('<html><body><input id="i" placeholder="Enter email" /></body></html>');
  var el = window.document.getElementById('i');
  var result = window.eval('matchesWhere')(el, { placeholder: 'Enter email' });
  assert.equal(result, true);
});

test('matchesWhere: matches name attribute', function () {
  setupDOM('<html><body><input id="i" name="username" /></body></html>');
  var el = window.document.getElementById('i');
  var result = window.eval('matchesWhere')(el, { name: 'username' });
  assert.equal(result, true);
});

test('matchesWhere: matches type attribute', function () {
  setupDOM('<html><body><input id="i" type="password" /></body></html>');
  var el = window.document.getElementById('i');
  var result = window.eval('matchesWhere')(el, { type: 'password' });
  assert.equal(result, true);
});

test('matchesWhere: AND logic — all conditions must be true', function () {
  setupDOM('<html><body><input id="i" type="text" name="email" placeholder="Email" /></body></html>');
  var el = window.document.getElementById('i');
  var matchFn = window.eval('matchesWhere');

  // All match
  assert.equal(matchFn(el, { type: 'text', name: 'email', placeholder: 'Email' }), true);
  // One fails
  assert.equal(matchFn(el, { type: 'text', name: 'wrong' }), false);
});

// ---------------------------------------------------------------------------
// findElement tests
// ---------------------------------------------------------------------------

test('findElement: resolves immediately when element exists', async function () {
  setupDOM('<html><body><button id="btn">Submit</button></body></html>');
  var findElement = window.eval('findElement');
  var descriptor = { tag: 'button', where: { id: 'btn' } };

  var el = await findElement(descriptor);
  assert.equal(el.id, 'btn');
  assert.equal(el.textContent, 'Submit');
});

test('findElement: resolves with element matching multiple where keys', async function () {
  setupDOM('<html><body><input id="email" type="email" name="user-email" placeholder="Email" /></body></html>');
  var findElement = window.eval('findElement');
  var descriptor = { tag: 'input', where: { type: 'email', name: 'user-email' } };

  var el = await findElement(descriptor);
  assert.equal(el.id, 'email');
});

test('findElement: resolves with correct element among multiple candidates', async function () {
  setupDOM('<html><body><input type="text" name="a" /><input type="text" name="b" /><input type="text" name="c" /></body></html>');
  var findElement = window.eval('findElement');
  var descriptor = { tag: 'input', where: { name: 'b' } };

  var el = await findElement(descriptor);
  assert.equal(el.getAttribute('name'), 'b');
});

test('findElement: scopes search to parentNode', async function () {
  setupDOM('<html><body><div id="container"><span class="item">Inside</span></div><span class="item">Outside</span></body></html>');
  var findElement = window.eval('findElement');
  var parent = window.document.getElementById('container');
  var descriptor = { tag: 'span', where: { classIncludes: 'item' } };

  var el = await findElement(descriptor, parent);
  assert.equal(el.textContent, 'Inside');
});

test('findElement: rejects after timeout if element not found', async function () {
  setupDOM('<html><body></body></html>');

  // Override Date.now to simulate timeout quickly
  var callCount = 0;
  var originalDateNow = window.Date.now;
  window.Date.now = function () {
    callCount++;
    // First call is start time (returns 0), subsequent calls exceed timeout
    if (callCount <= 1) return 0;
    return 6000; // Exceed 5000ms timeout
  };

  var findElement = window.eval('findElement');
  var descriptor = { tag: 'button', where: { id: 'nonexistent' } };

  await assert.rejects(
    findElement(descriptor),
    function (err) {
      return err.message === 'Element not found';
    }
  );

  window.Date.now = originalDateNow;
});

// ---------------------------------------------------------------------------
// findElementWithParent tests
// ---------------------------------------------------------------------------

test('findElementWithParent: finds element without parent descriptor', async function () {
  setupDOM('<html><body><a id="link" href="#">Click me</a></body></html>');
  var findElementWithParent = window.eval('findElementWithParent');
  var stepMessage = {
    target: 'myLink',
    elementDescriptor: { tag: 'a', where: { id: 'link' } }
  };

  var result = await findElementWithParent(stepMessage);
  assert.equal(result.ok, true);
  assert.equal(result.element.id, 'link');
});

test('findElementWithParent: finds child scoped to parent', async function () {
  setupDOM('<html><body><div id="parent"><button id="child">Go</button></div><button id="other">Nope</button></body></html>');
  var findElementWithParent = window.eval('findElementWithParent');
  var stepMessage = {
    target: 'goButton',
    elementDescriptor: { tag: 'button', where: { id: 'child' } },
    parentDescriptor: { tag: 'div', where: { id: 'parent' } }
  };

  var result = await findElementWithParent(stepMessage);
  assert.equal(result.ok, true);
  assert.equal(result.element.id, 'child');
});

test('findElementWithParent: returns error when element not found', async function () {
  setupDOM('<html><body></body></html>');

  // Override Date.now to simulate timeout quickly
  var callCount = 0;
  window.Date.now = function () {
    callCount++;
    if (callCount <= 1) return 0;
    return 6000;
  };

  var findElementWithParent = window.eval('findElementWithParent');
  var stepMessage = {
    target: 'missingBtn',
    elementDescriptor: { tag: 'button', where: { id: 'nope' } }
  };

  var result = await findElementWithParent(stepMessage);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Element not found: missingBtn');
});

test('findElementWithParent: returns parent not found error when parent times out', async function () {
  setupDOM('<html><body><button id="child">Go</button></body></html>');

  // Override Date.now to simulate timeout for parent search
  var callCount = 0;
  window.Date.now = function () {
    callCount++;
    if (callCount <= 1) return 0;
    return 6000;
  };

  var findElementWithParent = window.eval('findElementWithParent');
  var stepMessage = {
    target: 'goButton',
    elementDescriptor: { tag: 'button', where: { id: 'child' } },
    parentDescriptor: { tag: 'div', where: { id: 'missing-parent' } }
  };

  var result = await findElementWithParent(stepMessage);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Parent element not found: missing-parent');
});

test('findElementWithParent: child not in parent subtree returns element not found', async function () {
  setupDOM('<html><body><div id="parent"></div><button id="outside">Out</button></body></html>');
  var findElementWithParent = window.eval('findElementWithParent');

  // Override Date.now for the child search timeout (parent will be found immediately)
  var callCount = 0;
  var originalDateNow = window.Date.now;
  window.Date.now = function () {
    callCount++;
    // Allow parent to be found (first few calls), then timeout child search
    if (callCount <= 2) return 0;
    return 6000;
  };

  var stepMessage = {
    target: 'outsideBtn',
    elementDescriptor: { tag: 'button', where: { id: 'outside' } },
    parentDescriptor: { tag: 'div', where: { id: 'parent' } }
  };

  var result = await findElementWithParent(stepMessage);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Element not found: outsideBtn');

  window.Date.now = originalDateNow;
});


// ---------------------------------------------------------------------------
// highlightElement / unhighlightElement tests
// Requirements: 2.5, 2.6
// ---------------------------------------------------------------------------

test('highlightElement: adds data-tomation-active attribute to element', function () {
  setupDOM('<html><body><button id="btn">Click</button></body></html>');
  var el = window.document.getElementById('btn');
  var highlightElement = window.eval('highlightElement');

  highlightElement(el);
  assert.equal(el.getAttribute('data-tomation-active'), 'true');
});

test('highlightElement: can be called on an already-highlighted element', function () {
  setupDOM('<html><body><button id="btn">Click</button></body></html>');
  var el = window.document.getElementById('btn');
  var highlightElement = window.eval('highlightElement');

  highlightElement(el);
  highlightElement(el);
  assert.equal(el.getAttribute('data-tomation-active'), 'true');
});

test('unhighlightElement: removes data-tomation-active attribute from element', function () {
  setupDOM('<html><body><button id="btn">Click</button></body></html>');
  var el = window.document.getElementById('btn');
  var highlightElement = window.eval('highlightElement');
  var unhighlightElement = window.eval('unhighlightElement');

  highlightElement(el);
  assert.equal(el.getAttribute('data-tomation-active'), 'true');

  unhighlightElement(el);
  assert.equal(el.hasAttribute('data-tomation-active'), false);
});

test('unhighlightElement: is safe to call on element without the attribute', function () {
  setupDOM('<html><body><button id="btn">Click</button></body></html>');
  var el = window.document.getElementById('btn');
  var unhighlightElement = window.eval('unhighlightElement');

  // Should not throw
  unhighlightElement(el);
  assert.equal(el.hasAttribute('data-tomation-active'), false);
});


// ---------------------------------------------------------------------------
// executeAction tests
// Requirements: 3.1–3.7, 3.11, 3.12
// ---------------------------------------------------------------------------

test('executeAction click: dispatches click event on element', async function () {
  setupDOM('<html><body><button id="btn">Click Me</button></body></html>');
  var el = window.document.getElementById('btn');
  var clicked = false;
  el.addEventListener('click', function () { clicked = true; });

  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'click' }, el);
  assert.equal(result.ok, true);
  assert.equal(clicked, true);
});

test('executeAction type: sets value and dispatches input+change events', async function () {
  setupDOM('<html><body><input id="inp" type="text" /></body></html>');
  var el = window.document.getElementById('inp');
  var events = [];
  el.addEventListener('input', function () { events.push('input'); });
  el.addEventListener('change', function () { events.push('change'); });

  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'type', value: 'hello' }, el);
  assert.equal(result.ok, true);
  assert.equal(el.value, 'hello');
  assert.deepEqual(events, ['input', 'change']);
});

test('executeAction typePassword: behaves same as type', async function () {
  setupDOM('<html><body><input id="inp" type="password" /></body></html>');
  var el = window.document.getElementById('inp');
  var events = [];
  el.addEventListener('input', function () { events.push('input'); });
  el.addEventListener('change', function () { events.push('change'); });

  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'typePassword', value: 'secret123' }, el);
  assert.equal(result.ok, true);
  assert.equal(el.value, 'secret123');
  assert.deepEqual(events, ['input', 'change']);
});

test('executeAction select: sets value and dispatches change event', async function () {
  setupDOM('<html><body><select id="sel"><option value="a">A</option><option value="b">B</option></select></body></html>');
  var el = window.document.getElementById('sel');
  var changed = false;
  el.addEventListener('change', function () { changed = true; });

  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'select', value: 'b' }, el);
  assert.equal(result.ok, true);
  assert.equal(el.value, 'b');
  assert.equal(changed, true);
});

test('executeAction assertExists: always returns ok true', async function () {
  setupDOM('<html><body><div id="d">exists</div></body></html>');
  var el = window.document.getElementById('d');

  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'assertExists' }, el);
  assert.equal(result.ok, true);
});

test('executeAction assertNotExists: returns ok false when element is found', async function () {
  setupDOM('<html><body><div id="d">should not exist</div></body></html>');
  var el = window.document.getElementById('d');

  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'assertNotExists' }, el);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Element exists but should not');
});

test('executeAction assertNotExists: returns ok true when element is null', async function () {
  setupDOM('<html><body></body></html>');

  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'assertNotExists' }, null);
  assert.equal(result.ok, true);
});

test('executeAction assertHasText: returns ok when text contains value', async function () {
  setupDOM('<html><body><p id="p">Hello World, welcome!</p></body></html>');
  var el = window.document.getElementById('p');

  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'assertHasText', value: 'World' }, el);
  assert.equal(result.ok, true);
});

test('executeAction assertHasText: returns ok false when text does not contain value', async function () {
  setupDOM('<html><body><p id="p">Hello World</p></body></html>');
  var el = window.document.getElementById('p');

  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'assertHasText', value: 'Goodbye' }, el);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Element text does not contain: Goodbye');
});

test('executeAction waitFor gone=false: resolves ok when element exists', async function () {
  setupDOM('<html><body><div id="target">Here</div></body></html>');

  var executeAction = window.eval('executeAction');
  var step = {
    action: 'waitFor',
    gone: false,
    elementDescriptor: { tag: 'div', where: { id: 'target' } }
  };
  var result = await executeAction(step, null);
  assert.equal(result.ok, true);
});

test('executeAction waitFor gone=true: resolves ok when element is absent', async function () {
  setupDOM('<html><body></body></html>');

  var executeAction = window.eval('executeAction');
  var step = {
    action: 'waitFor',
    gone: true,
    elementDescriptor: { tag: 'div', where: { id: 'absent' } }
  };
  var result = await executeAction(step, null);
  assert.equal(result.ok, true);
});

test('executeAction waitFor gone=false: times out when element never appears', async function () {
  setupDOM('<html><body></body></html>');

  // Override Date.now to simulate timeout
  var callCount = 0;
  window.Date.now = function () {
    callCount++;
    if (callCount <= 1) return 0;
    return 6000;
  };

  var executeAction = window.eval('executeAction');
  var step = {
    action: 'waitFor',
    gone: false,
    elementDescriptor: { tag: 'div', where: { id: 'nope' } }
  };
  var result = await executeAction(step, null);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Timed out waiting for element to appear');
});

test('executeAction waitFor gone=true: times out when element remains', async function () {
  setupDOM('<html><body><span id="stuck">Still here</span></body></html>');

  // Override Date.now to simulate timeout
  var callCount = 0;
  window.Date.now = function () {
    callCount++;
    if (callCount <= 1) return 0;
    return 6000;
  };

  var executeAction = window.eval('executeAction');
  var step = {
    action: 'waitFor',
    gone: true,
    elementDescriptor: { tag: 'span', where: { id: 'stuck' } }
  };
  var result = await executeAction(step, null);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Timed out waiting for element to disappear');
});

test('executeAction navigate: returns ok (handled by background)', async function () {
  setupDOM('<html><body></body></html>');
  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'navigate', url: 'http://example.com' }, null);
  assert.equal(result.ok, true);
});

test('executeAction wait: returns ok (handled by background)', async function () {
  setupDOM('<html><body></body></html>');
  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'wait', ms: 1000 }, null);
  assert.equal(result.ok, true);
});

test('executeAction task: returns ok (handled by background)', async function () {
  setupDOM('<html><body></body></html>');
  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'task', name: 'someTask' }, null);
  assert.equal(result.ok, true);
});

test('executeAction manual: returns ok (handled by background)', async function () {
  setupDOM('<html><body></body></html>');
  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'manual', description: 'Check something' }, null);
  assert.equal(result.ok, true);
});

test('executeAction unknown action: returns ok false with error', async function () {
  setupDOM('<html><body></body></html>');
  var executeAction = window.eval('executeAction');
  var result = await executeAction({ action: 'unknownAction' }, null);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Unknown action: unknownAction');
});


// ---------------------------------------------------------------------------
// Message listener tests (Task 12.4)
// Requirements: 5.2, 5.6
// ---------------------------------------------------------------------------

var sentMessages;
var registeredListener;

function setupDOMWithMessaging(html) {
  dom = new JSDOM(html || '<html><body></body></html>', {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
  });
  window = dom.window;

  sentMessages = [];
  registeredListener = null;

  // Provide the browser global with message tracking
  window.eval(
    'var browser = { runtime: { onMessage: { addListener: function(fn) { window.__registeredListener = fn; } }, sendMessage: function(msg) { window.__sentMessages = window.__sentMessages || []; window.__sentMessages.push(msg); } } };'
  );

  // Load runtime.js source
  var fs = require('fs');
  var path = require('path');
  var runtimeSrc = fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8');
  window.eval(runtimeSrc);

  registeredListener = window.__registeredListener;
  sentMessages = window.__sentMessages || [];
}

test('message listener: sends RUNTIME_READY on script load', function () {
  setupDOMWithMessaging('<html><body></body></html>');
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, 'RUNTIME_READY');
});

test('message listener: registers a listener on api.runtime.onMessage', function () {
  setupDOMWithMessaging('<html><body></body></html>');
  assert.ok(registeredListener, 'Listener should be registered');
  assert.equal(typeof registeredListener, 'function');
});

test('message listener: ignores non-EXECUTE_STEP messages', function () {
  setupDOMWithMessaging('<html><body></body></html>');
  var responseSent = false;
  var result = registeredListener(
    { type: 'SOME_OTHER_MESSAGE' },
    {},
    function () { responseSent = true; }
  );
  assert.equal(responseSent, false);
  assert.notEqual(result, true); // should not return true (no async)
});

test('message listener: navigate action responds synchronously with ok', function () {
  setupDOMWithMessaging('<html><body></body></html>');
  var response = null;
  registeredListener(
    { type: 'EXECUTE_STEP', action: 'navigate', stepIndex: 0, url: 'http://example.com' },
    {},
    function (r) { response = r; }
  );
  assert.equal(response.type, 'STEP_RESULT');
  assert.equal(response.stepIndex, 0);
  assert.equal(response.ok, true);
});

test('message listener: wait action responds synchronously with ok', function () {
  setupDOMWithMessaging('<html><body></body></html>');
  var response = null;
  registeredListener(
    { type: 'EXECUTE_STEP', action: 'wait', stepIndex: 1, ms: 500 },
    {},
    function (r) { response = r; }
  );
  assert.equal(response.type, 'STEP_RESULT');
  assert.equal(response.stepIndex, 1);
  assert.equal(response.ok, true);
});

test('message listener: task action responds synchronously with ok', function () {
  setupDOMWithMessaging('<html><body></body></html>');
  var response = null;
  registeredListener(
    { type: 'EXECUTE_STEP', action: 'task', stepIndex: 2 },
    {},
    function (r) { response = r; }
  );
  assert.equal(response.type, 'STEP_RESULT');
  assert.equal(response.stepIndex, 2);
  assert.equal(response.ok, true);
});

test('message listener: manual action responds synchronously with ok', function () {
  setupDOMWithMessaging('<html><body></body></html>');
  var response = null;
  registeredListener(
    { type: 'EXECUTE_STEP', action: 'manual', stepIndex: 3 },
    {},
    function (r) { response = r; }
  );
  assert.equal(response.type, 'STEP_RESULT');
  assert.equal(response.stepIndex, 3);
  assert.equal(response.ok, true);
});

test('message listener: click action finds element, highlights, executes, unhighlights', async function () {
  setupDOMWithMessaging('<html><body><button id="btn">Go</button></body></html>');
  var response = null;
  var returnValue = registeredListener(
    {
      type: 'EXECUTE_STEP',
      action: 'click',
      stepIndex: 4,
      target: 'goBtn',
      elementDescriptor: { tag: 'button', where: { id: 'btn' } }
    },
    {},
    function (r) { response = r; }
  );

  // Should return true for async
  assert.equal(returnValue, true);

  // Wait for promises to resolve
  await new Promise(function (resolve) { setTimeout(resolve, 50); });

  assert.equal(response.type, 'STEP_RESULT');
  assert.equal(response.stepIndex, 4);
  assert.equal(response.ok, true);

  // Element should be unhighlighted after execution
  var el = window.document.getElementById('btn');
  assert.equal(el.hasAttribute('data-tomation-active'), false);
});

test('message listener: type action sets value on found element', async function () {
  setupDOMWithMessaging('<html><body><input id="inp" type="text" /></body></html>');
  var response = null;
  registeredListener(
    {
      type: 'EXECUTE_STEP',
      action: 'type',
      stepIndex: 5,
      target: 'emailInput',
      value: 'test@example.com',
      elementDescriptor: { tag: 'input', where: { id: 'inp' } }
    },
    {},
    function (r) { response = r; }
  );

  await new Promise(function (resolve) { setTimeout(resolve, 50); });

  assert.equal(response.ok, true);
  assert.equal(response.stepIndex, 5);
  var el = window.document.getElementById('inp');
  assert.equal(el.value, 'test@example.com');
});

test('message listener: returns error when element not found', async function () {
  setupDOMWithMessaging('<html><body></body></html>');

  // Override Date.now to trigger timeout fast
  var callCount = 0;
  window.Date.now = function () {
    callCount++;
    if (callCount <= 1) return 0;
    return 6000;
  };

  var response = null;
  registeredListener(
    {
      type: 'EXECUTE_STEP',
      action: 'click',
      stepIndex: 6,
      target: 'missingBtn',
      elementDescriptor: { tag: 'button', where: { id: 'nope' } }
    },
    {},
    function (r) { response = r; }
  );

  await new Promise(function (resolve) { setTimeout(resolve, 100); });

  assert.equal(response.ok, false);
  assert.equal(response.stepIndex, 6);
  assert.equal(response.error, 'Element not found: missingBtn');
});

test('message listener: assertNotExists passes when element is NOT found', async function () {
  setupDOMWithMessaging('<html><body></body></html>');

  // Override Date.now to trigger timeout fast (element won't be found)
  var callCount = 0;
  window.Date.now = function () {
    callCount++;
    if (callCount <= 1) return 0;
    return 6000;
  };

  var response = null;
  registeredListener(
    {
      type: 'EXECUTE_STEP',
      action: 'assertNotExists',
      stepIndex: 7,
      target: 'ghost',
      elementDescriptor: { tag: 'div', where: { id: 'ghost' } }
    },
    {},
    function (r) { response = r; }
  );

  await new Promise(function (resolve) { setTimeout(resolve, 100); });

  assert.equal(response.ok, true);
  assert.equal(response.stepIndex, 7);
});

test('message listener: assertNotExists fails when element IS found', async function () {
  setupDOMWithMessaging('<html><body><div id="exists">here</div></body></html>');
  var response = null;
  registeredListener(
    {
      type: 'EXECUTE_STEP',
      action: 'assertNotExists',
      stepIndex: 8,
      target: 'existsDiv',
      elementDescriptor: { tag: 'div', where: { id: 'exists' } }
    },
    {},
    function (r) { response = r; }
  );

  await new Promise(function (resolve) { setTimeout(resolve, 50); });

  assert.equal(response.ok, false);
  assert.equal(response.stepIndex, 8);
  assert.equal(response.error, 'Element exists but should not');
});

test('message listener: unknown action returns error via sendResponse', async function () {
  setupDOMWithMessaging('<html><body></body></html>');
  var response = null;
  var returnValue = registeredListener(
    {
      type: 'EXECUTE_STEP',
      action: 'fancyAction',
      stepIndex: 9
    },
    {},
    function (r) { response = r; }
  );

  assert.equal(returnValue, true);

  await new Promise(function (resolve) { setTimeout(resolve, 50); });

  assert.equal(response.ok, false);
  assert.equal(response.error, 'Unknown action: fancyAction');
});
