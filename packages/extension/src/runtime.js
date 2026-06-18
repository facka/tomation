// runtime.js — content script / DOM executor
// Implementation: Task 12
var api = typeof browser !== 'undefined' ? browser : chrome;

var TIMEOUT_5sec = 5000;
/**
 * Check if a single DOM element matches all conditions in the `where` object.
 * All keys are evaluated as AND conditions.
 */
function matchesWhere(el, where) {
  var keys = Object.keys(where);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = where[key];
    switch (key) {
      case 'id':
        if (el.id !== value) return false;
        break;
      case 'textIs':
        if (el.textContent.trim() !== value) return false;
        break;
      case 'textContains':
        if (el.textContent.indexOf(value) === -1) return false;
        break;
      case 'classIncludes':
        if (el.className.split(' ').indexOf(value) === -1) return false;
        break;
      case 'placeholder':
        if (el.getAttribute('placeholder') !== value) return false;
        break;
      case 'name':
        if (el.getAttribute('name') !== value) return false;
        break;
      case 'type':
        if (el.getAttribute('type') !== value) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

/**
 * Find a DOM element matching the given descriptor.
 * Polls using requestAnimationFrame for up to 5 seconds.
 *
 * When the descriptor contains an `xpath` field, uses document.evaluate()
 * with XPathResult.FIRST_ORDERED_NODE_TYPE to locate the element, bypassing
 * the normal tag+where polling logic.
 *
 * @param {object} descriptor - Element descriptor with `tag` and `where` properties, or `xpath` for XPath lookup
 * @param {Element|Document} [parentNode] - Optional parent node to scope the search
 * @returns {Promise<Element>} Resolves with the found element or rejects after timeout
 */
function findElement(descriptor, parentNode) {
  var root = parentNode || document;

  // XPath-based element lookup — bypass normal tag+where logic
  if (descriptor.xpath) {
    return new Promise(function (resolve, reject) {
      var startTime = Date.now();

      function poll() {
        var result = document.evaluate(
          descriptor.xpath,
          root,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        var node = result.singleNodeValue;
        if (node) {
          resolve(node);
          return;
        }
        if (Date.now() - startTime >= TIMEOUT_5sec) {
          reject(new Error('Element not found: XPath ' + descriptor.xpath));
          return;
        }
        requestAnimationFrame(poll);
      }

      poll();
    });
  }

  // Normal tag+where polling logic
  var tag = descriptor.tag;
  var where = descriptor.where;

  return new Promise(function (resolve, reject) {
    var startTime = Date.now();

    function poll() {
      var candidates = root.querySelectorAll(tag);
      for (var i = 0; i < candidates.length; i++) {
        if (matchesWhere(candidates[i], where)) {
          resolve(candidates[i]);
          return;
        }
      }
      if (Date.now() - startTime >= TIMEOUT_5sec) {
        reject(new Error('Element not found: ' + tag + ' with conditions ' + JSON.stringify(where)));
        return;
      }
      requestAnimationFrame(poll);
    }

    poll();
  });
}

/**
 * Highlight an element by adding the data-tomation-active attribute.
 * Called before executing each step's action.
 *
 * @param {Element} el - The DOM element to highlight
 */
function highlightElement(el) {
  el.setAttribute('data-tomation-active', 'true');
}

/**
 * Remove highlighting from an element by removing the data-tomation-active attribute.
 * Called after each step completes (regardless of outcome).
 *
 * @param {Element} el - The DOM element to unhighlight
 */
function unhighlightElement(el) {
  el.removeAttribute('data-tomation-active');
}

/**
 * Find an element, optionally scoped to a parent element.
 * If stepMessage.parentDescriptor is present, first locates the parent,
 * then searches for the child within the parent's subtree.
 *
 * @param {object} stepMessage - The EXECUTE_STEP message containing elementDescriptor and optional parentDescriptor
 * @returns {Promise<{ok: boolean, element?: Element, error?: string}>}
 */
function findElementWithParent(stepMessage) {
  var elementDescriptor = stepMessage.elementDescriptor;
  var parentDescriptor = stepMessage.parentDescriptor;

  if (!parentDescriptor) {
    return findElement(elementDescriptor, document)
      .then(function (element) {
        return { ok: true, element: element };
      })
      .catch(function () {
        return { ok: false, error: 'Element not found: ' + stepMessage.target };
      });
  }

  return findElement(parentDescriptor, document)
    .then(function (parentElement) {
      return findElement(elementDescriptor, parentElement)
        .then(function (element) {
          return { ok: true, element: element };
        })
        .catch(function () {
          return { ok: false, error: 'Element not found: ' + stepMessage.target };
        });
    })
    .catch(function () {
      var parentId = parentDescriptor.where && parentDescriptor.where.id
        ? parentDescriptor.where.id
        : 'unknown';
      return { ok: false, error: 'Parent element not found: ' + parentId };
    });
}

/**
 * Execute an action for a given step on the resolved element.
 * Dispatches to the correct handler based on step.action.
 *
 * @param {object} step - The step object with action, value, elementDescriptor, etc.
 * @param {Element|null} element - The resolved DOM element (may be null for some actions)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function executeAction(step, element) {
  var action = step.action;

  switch (action) {
    case 'click':
      return handleClick(element);

    case 'type':
      return handleType(element, step.value);

    case 'typePassword':
      return handleType(element, step.value);

    case 'select':
      return handleSelect(element, step.value);

    case 'assertExists':
      return handleAssertExists();

    case 'assertNotExists':
      return handleAssertNotExists(element);

    case 'assertHasText':
      return handleAssertHasText(element, step.value);

    case 'waitFor':
      return handleWaitFor(step);

    case 'navigate':
    case 'wait':
    case 'task':
    case 'manual':
      // These actions are handled by the background script, not the runtime
      return Promise.resolve({ ok: true });

    default:
      return Promise.resolve({ ok: false, error: 'Unknown action: ' + action });
  }
}

/**
 * Handle click action — dispatch a MouseEvent on the element.
 */
function handleClick(element) {
  try {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return Promise.resolve({ ok: true });
  } catch (e) {
    return Promise.resolve({ ok: false, error: 'Click failed: ' + e.message });
  }
}

/**
 * Handle type action — set element value and dispatch input + change events.
 */
function handleType(element, value) {
  try {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return Promise.resolve({ ok: true });
  } catch (e) {
    return Promise.resolve({ ok: false, error: 'Type failed: ' + e.message });
  }
}

/**
 * Handle select action — set select element value and dispatch change event.
 */
function handleSelect(element, value) {
  try {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return Promise.resolve({ ok: true });
  } catch (e) {
    return Promise.resolve({ ok: false, error: 'Select failed: ' + e.message });
  }
}

/**
 * Handle assertExists — element was already found by the finder, so always ok.
 */
function handleAssertExists() {
  return Promise.resolve({ ok: true });
}

/**
 * Handle assertNotExists — if element was found, the assertion fails.
 */
function handleAssertNotExists(element) {
  if (element) {
    return Promise.resolve({ ok: false, error: 'Element exists but should not' });
  }
  return Promise.resolve({ ok: true });
}

/**
 * Handle assertHasText — check if element's textContent contains the value.
 */
function handleAssertHasText(element, value) {
  var text = element.textContent || '';
  if (text.indexOf(value) !== -1) {
    return Promise.resolve({ ok: true });
  }
  return Promise.resolve({ ok: false, error: 'Element text does not contain: ' + value });
}

/**
 * Handle waitFor — poll until element appears (gone=false) or disappears (gone=true).
 * Polls every 100ms with a 5-second timeout.
 */
function handleWaitFor(step) {
  var gone = step.gone;
  var descriptor = step.elementDescriptor;

  return new Promise(function (resolve) {
    var startTime = Date.now();

    function poll() {
      var candidates = document.querySelectorAll(descriptor.tag);
      var found = false;
      for (var i = 0; i < candidates.length; i++) {
        if (matchesWhere(candidates[i], descriptor.where)) {
          found = true;
          break;
        }
      }

      if (!gone && found) {
        // Waiting for element to appear, and it appeared
        resolve({ ok: true });
        return;
      }

      if (gone && !found) {
        // Waiting for element to disappear, and it's gone
        resolve({ ok: true });
        return;
      }

      if (Date.now() - startTime >= TIMEOUT_5sec) {
        if (!gone) {
          resolve({ ok: false, error: 'Timed out waiting for element to appear' });
        } else {
          resolve({ ok: false, error: 'Timed out waiting for element to disappear' });
        }
        return;
      }

      requestAnimationFrame(poll);
    }

    poll();
  });
}

// ---------------------------------------------------------------------------
// Message listener: receives EXECUTE_STEP from background, runs DOM actions
// ---------------------------------------------------------------------------

var ACTIONS_NEEDING_ELEMENT = ['click', 'type', 'typePassword', 'select', 'assertExists', 'assertHasText', 'waitFor'];

api.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type !== 'EXECUTE_STEP') {
    return;
  }

  var action = message.action;
  var stepIndex = message.stepIndex;

  // Actions that don't need a DOM element — just respond ok
  if (action === 'navigate' || action === 'wait' || action === 'task' || action === 'manual') {
    sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: true });
    return;
  }

  // assertNotExists: attempt to find element, pass if NOT found
  if (action === 'assertNotExists') {
    findElementWithParent(message).then(function (findResult) {
      var element = findResult.ok ? findResult.element : null;
      return executeAction(message, element);
    }).then(function (result) {
      sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: result.ok, error: result.error });
    }).catch(function (err) {
      sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: false, error: err.message || String(err) });
    });
    return true;
  }

  // Actions that require an element
  if (ACTIONS_NEEDING_ELEMENT.indexOf(action) !== -1) {
    findElementWithParent(message).then(function (findResult) {
      if (!findResult.ok) {
        sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: false, error: findResult.error });
        return;
      }
      var element = findResult.element;
      highlightElement(element);
      return executeAction(message, element).then(function (result) {
        unhighlightElement(element);
        sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: result.ok, error: result.error });
      }).catch(function (err) {
        unhighlightElement(element);
        sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: false, error: err.message || String(err) });
      });
    }).catch(function (err) {
      sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: false, error: err.message || String(err) });
    });
    return true;
  }

  // Unknown action — let executeAction handle it
  executeAction(message, null).then(function (result) {
    sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: result.ok, error: result.error });
  }).catch(function (err) {
    sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: false, error: err.message || String(err) });
  });
  return true;
});

// ---------------------------------------------------------------------------
// On script load: notify background that the runtime is ready
// ---------------------------------------------------------------------------

api.runtime.sendMessage({ type: 'RUNTIME_READY' });
