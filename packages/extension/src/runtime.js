// runtime.js — content script / DOM executor
var api = typeof browser !== 'undefined' ? browser : chrome;

// Inject highlight CSS into the page so data-tomation-active elements are visible
(function injectHighlightStyles() {
  var style = document.createElement('style');
  style.textContent = '[data-tomation-active="true"] { outline: 2px solid #5e6ad2 !important; outline-offset: 2px; box-shadow: 0 0 0 4px rgba(94, 106, 210, 0.2) !important; transition: outline 0.15s ease, box-shadow 0.15s ease; }';
  (document.head || document.documentElement).appendChild(style);
})();

var TIMEOUT_5sec = 5000;
/**
 * Check if a single DOM element matches all conditions in the `where` object.
 * All keys are evaluated as AND conditions.
 */
function matchesWhere(el, where, parentNode) {
  var keys = Object.keys(where);
  for (var i = 0; i < keys.length; i++) {
    if (!evaluateWhereKey(el, keys[i], where[keys[i]], parentNode).passed) return false;
  }
  return true;
}

// Sentinel for "actual value could not be observed" (Req 2.7).
var UNAVAILABLE = { __unavailable: true };

/**
 * Evaluate a single where-key against an element, returning both the pass/fail
 * decision (identical to matchesWhere's per-key decision) and the observed
 * actual value for the failure-time breakdown.
 *
 * @param {Element} el - candidate element
 * @param {string} key - the where-matcher key
 * @param {*} value - the expected value from the descriptor
 * @param {Element|null} parentNode - childOf parent if present, null otherwise
 * @returns {{ passed: boolean, actual: * }} actual is the observed value, or the
 *          UNAVAILABLE sentinel when it could not be read (Req 2.7).
 */
function evaluateWhereKey(el, key, value, parentNode) {
  switch (key) {
    case 'id':
      return { passed: el.id === value, actual: el.id };
    case 'textIs':
      // Match uses trim(); actual reports raw untrimmed text (Req 2.5).
      return { passed: el.textContent.trim() === value, actual: el.textContent };
    case 'textContains':
      return { passed: el.textContent.indexOf(value) !== -1, actual: el.textContent };
    case 'classIncludes':
      return { passed: el.className.split(' ').indexOf(value) !== -1, actual: el.className };
    case 'placeholder': {
      var placeholder = el.getAttribute('placeholder');
      return {
        passed: placeholder === value,
        actual: (placeholder === null || placeholder === undefined) ? UNAVAILABLE : placeholder
      };
    }
    case 'name': {
      var name = el.getAttribute('name');
      return {
        passed: name === value,
        actual: (name === null || name === undefined) ? UNAVAILABLE : name
      };
    }
    case 'type': {
      var type = el.getAttribute('type');
      return {
        passed: type === value,
        actual: (type === null || type === undefined) ? UNAVAILABLE : type
      };
    }
    case 'value':
      return {
        passed: el.value !== undefined && el.value === value,
        actual: el.value === undefined ? UNAVAILABLE : el.value
      };
    case 'ariaLabel': {
      var ariaLabel = el.getAttribute('aria-label');
      return {
        passed: ariaLabel === value,
        actual: (ariaLabel === null || ariaLabel === undefined) ? UNAVAILABLE : ariaLabel
      };
    }
    case 'role': {
      var role = el.getAttribute('role');
      return {
        passed: role === value,
        actual: (role === null || role === undefined) ? UNAVAILABLE : role
      };
    }
    case 'title': {
      var title = el.getAttribute('title');
      return {
        passed: title === value,
        actual: (title === null || title === undefined) ? UNAVAILABLE : title
      };
    }
    case 'hrefContains': {
      var href = el.getAttribute('href');
      return {
        passed: href !== null && href.indexOf(value) !== -1,
        actual: (href === null || href === undefined) ? UNAVAILABLE : href
      };
    }
    case 'isDisabled':
      return {
        passed: el.disabled === true,
        actual: (el.disabled === null || el.disabled === undefined) ? UNAVAILABLE : el.disabled
      };
    case 'dataAttr': {
      var dataVal = el.getAttribute('data-' + value.name);
      return {
        passed: dataVal === value.value,
        actual: (dataVal === null || dataVal === undefined) ? UNAVAILABLE : dataVal
      };
    }
    case 'nthChild': {
      var pos = 1;
      var sib = el.previousElementSibling;
      while (sib) { pos++; sib = sib.previousElementSibling; }
      return { passed: pos === value, actual: pos };
    }
    case 'closestLabel':
      // passed delegates to existing matcher; actual sub-record filled by task 3.
      return { passed: matchClosestLabel(el, value, parentNode), actual: null };
    default:
      // Unknown key: matchesWhere treats it as a no-op (does not fail the match).
      return { passed: true, actual: UNAVAILABLE };
  }
}

/**
 * Search a subtree for an element matching the given tag and text content.
 *
 * @param {Element} root - The root element to search within
 * @param {string} tag - The uppercase tag name to match
 * @param {string} text - The expected trimmed textContent
 * @returns {boolean}
 */
function searchSubtreeForLabel(root, tag, text) {
  var candidates = root.getElementsByTagName(tag);
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i].textContent.trim() === text) {
      return true;
    }
  }
  return false;
}

/**
 * Determine if a label element matching the spec exists near the target element.
 *
 * @param {Element} el - target element
 * @param {{ tag: string, text: string }} spec - label specification
 * @param {Element|null} parentNode - childOf parent if present, null otherwise
 * @returns {boolean}
 */
function matchClosestLabel(el, spec, parentNode) {
  var tag = spec.tag.toUpperCase();
  var text = spec.text;

  // Strategy A: childOf-bounded search — search within parent subtree only
  if (parentNode) {
    return searchSubtreeForLabel(parentNode, tag, text);
  }

  // Strategy B: Unbounded search with max 3 ancestor levels

  // B1: Explicit `for` attribute — find a matching-tag element with for=el.id
  if (el.id) {
    var forLabels = document.querySelectorAll(spec.tag + '[for="' + el.id + '"]');
    for (var i = 0; i < forLabels.length; i++) {
      if (forLabels[i].tagName === tag && forLabels[i].textContent.trim() === text) {
        return true;
      }
    }
  }

  // B2: Walk up at most 3 ancestor levels, search descendants
  // Stop at the first level where a matching-tag element is found — if its text
  // doesn't match, the closest label is wrong (don't keep searching higher)
  var ancestor = el.parentElement;
  for (var depth = 0; depth < 3 && ancestor; depth++) {
    var candidates = ancestor.getElementsByTagName(tag);
    if (candidates.length > 0) {
      // Found element(s) with matching tag at this level — check text
      for (var ci = 0; ci < candidates.length; ci++) {
        if (candidates[ci].textContent.trim() === text) {
          return true;
        }
      }
      // Tag found but text didn't match — stop searching further
      return false;
    }
    ancestor = ancestor.parentElement;
  }

  // B3: aria-labelledby resolution
  var labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    var refEl = document.getElementById(labelledBy);
    if (refEl && refEl.tagName === tag && refEl.textContent.trim() === text) {
      return true;
    }
  }

  return false;
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
        if (matchesWhere(candidates[i], where, root === document ? null : root)) {
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
 * Apply a sequence of navigation steps starting from an anchor element.
 * Traverses the DOM synchronously following each step in order.
 *
 * @param {Element} anchor - The resolved anchor DOM element
 * @param {Array<{step: string, index?: number}>} steps - Parsed navigate steps
 * @returns {{ok: boolean, element?: Element, error?: string}}
 */
function applyNavigateSteps(anchor, steps) {
  var current = anchor;
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    var next = null;
    switch (s.step) {
      case 'parent':      next = current.parentElement; break;
      case 'child':       next = current.children[s.index - 1]; break;
      case 'firstChild':  next = current.firstElementChild; break;
      case 'lastChild':   next = current.lastElementChild; break;
      case 'nextSibling': next = current.nextElementSibling; break;
      case 'prevSibling': next = current.previousElementSibling; break;
      case 'sibling':
        var parent = current.parentElement;
        if (!parent) {
          return { ok: false, error: 'Navigation failed at step ' + (i + 1) + ' (sibling[' + s.index + ']): no parent element' };
        }
        next = parent.children[s.index - 1];
        break;
    }
    if (!next) {
      var token = s.step + (s.index !== undefined ? '[' + s.index + ']' : '');
      return { ok: false, error: 'Navigation failed at step ' + (i + 1) + ' (' + token + '): element is null' };
    }
    current = next;
  }
  return { ok: true, element: current };
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
  var navigateSteps = elementDescriptor && elementDescriptor.navigate;

  // Helper to apply navigate steps after anchor is found
  function applyNavigation(element) {
    if (navigateSteps && navigateSteps.length > 0) {
      return applyNavigateSteps(element, navigateSteps);
    }
    return { ok: true, element: element };
  }

  if (!parentDescriptor) {
    return findElement(elementDescriptor, document)
      .then(function (element) {
        return applyNavigation(element);
      })
      .catch(function () {
        return { ok: false, error: 'Element not found: ' + stepMessage.target };
      });
  }

  function getElementXPath(element) {
    if (!element) return '';
    if (element.id) {
        return `//*[@id="${element.id}"]`;
    }
    if (element === document.body) {
        return '/html/body';
    }

    let index = 1;
    let sibling = element.previousElementSibling;
    
    while (sibling) {
        if (sibling.nodeName === element.nodeName) {
            index++;
        }
        sibling = sibling.previousElementSibling;
    }

    const tagName = element.nodeName.toLowerCase();
    const parentPath = getElementXPath(element.parentElement);
    return `${parentPath}/${tagName}[${index}]`;
  }

  return findElement(parentDescriptor, document)
    .then(function (parentElement) {
      return findElement(elementDescriptor, parentElement)
        .then(function (element) {
          return applyNavigation(element);
        })
        .catch(function (error) {
          return { ok: false, error: 'Element with parent ' + getElementXPath(parentElement) + ' not found: ' + stepMessage.target + error.message };
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

    case 'upload':
      return handleUpload(element, step);

    case 'pressKey':
      return handlePressKey(element, step.key, step.options);

    case 'saveText':
      return Promise.resolve({ ok: true, savedValue: element.textContent.trim() });

    case 'saveAttribute':
      var attrVal = element.getAttribute(step.attributeName);
      if (attrVal === null) {
        return Promise.resolve({ ok: false, error: 'Attribute "' + step.attributeName + '" not found on element' });
      }
      return Promise.resolve({ ok: true, savedValue: attrVal });

    case 'saveValue':
      return Promise.resolve({ ok: true, savedValue: element.value || '' });

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
// Upload handler
// ---------------------------------------------------------------------------

/**
 * Handle upload action — set a file on an input[type="file"] element.
 * If fileDataUrl is provided (fetched by background from testFiles URL),
 * creates a real File with actual content. Otherwise creates an empty stub.
 */
function handleUpload(element, message) {
  try {
    if (element.tagName !== 'INPUT' || element.type !== 'file') {
      return Promise.resolve({ ok: false, error: 'Upload target must be an input[type="file"] element' });
    }
    var fileName = (message.value || '').split('/').pop() || 'file';
    var mimeType = message.mimeType || 'application/octet-stream';

    if (message.fileDataUrl) {
      // Convert data URL to blob, then to File
      return fetch(message.fileDataUrl).then(function (res) {
        return res.blob();
      }).then(function (blob) {
        var file = new File([blob], fileName, { type: mimeType });
        var dt = new DataTransfer();
        dt.items.add(file);
        element.files = dt.files;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      }).catch(function (err) {
        return { ok: false, error: 'Upload failed: ' + err.message };
      });
    }

    // Fallback: create empty stub file
    var file = new File([''], fileName, { type: mimeType });
    var dt = new DataTransfer();
    dt.items.add(file);
    element.files = dt.files;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return Promise.resolve({ ok: true });
  } catch (e) {
    return Promise.resolve({ ok: false, error: 'Upload failed: ' + e.message });
  }
}

// ---------------------------------------------------------------------------
// PressKey handler
// ---------------------------------------------------------------------------

/**
 * Handle pressKey action — dispatch keyboard events on the target element.
 * @param {Element} element - DOM element to receive the key event
 * @param {string} key - Key value (e.g., 'Enter', 'Tab', 'ArrowUp', 'a')
 * @param {object} options - Modifier keys: { alt, ctrl, meta, shift }
 */
function handlePressKey(element, key, options) {
  try {
    var opts = options || {};
    var eventInit = {
      key: key,
      code: deriveKeyCode(key),
      bubbles: true,
      cancelable: true,
      altKey: !!opts.alt,
      ctrlKey: !!opts.ctrl,
      metaKey: !!opts.meta,
      shiftKey: !!opts.shift,
    };
    element.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    element.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    // For printable characters, also dispatch keypress
    if (key.length === 1) {
      element.dispatchEvent(new KeyboardEvent('keypress', eventInit));
    }
    return Promise.resolve({ ok: true });
  } catch (e) {
    return Promise.resolve({ ok: false, error: 'PressKey failed: ' + e.message });
  }
}

/**
 * Derive a KeyboardEvent.code value from a key name.
 */
function deriveKeyCode(key) {
  var codeMap = {
    'Enter': 'Enter',
    'Tab': 'Tab',
    'Escape': 'Escape',
    ' ': 'Space',
    'ArrowUp': 'ArrowUp',
    'ArrowDown': 'ArrowDown',
    'ArrowLeft': 'ArrowLeft',
    'ArrowRight': 'ArrowRight',
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PageUp',
    'PageDown': 'PageDown',
  };
  if (codeMap[key]) return codeMap[key];
  // Single character — derive from letter
  if (key.length === 1 && key >= 'a' && key <= 'z') return 'Key' + key.toUpperCase();
  if (key.length === 1 && key >= 'A' && key <= 'Z') return 'Key' + key.toUpperCase();
  if (key.length === 1 && key >= '0' && key <= '9') return 'Digit' + key;
  return key;
}

// ---------------------------------------------------------------------------
// Message listener: receives EXECUTE_STEP from background, runs DOM actions
// ---------------------------------------------------------------------------

var ACTIONS_NEEDING_ELEMENT = ['click', 'type', 'typePassword', 'select', 'assertExists', 'assertHasText', 'waitFor', 'upload', 'saveText', 'saveAttribute', 'saveValue'];

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

  // pressKey: can work with or without a target element
  if (action === 'pressKey') {
    if (message.target) {
      // Target specified — find element, highlight, press key on it
      findElementWithParent(message).then(function (findResult) {
        if (!findResult.ok) {
          sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: false, error: findResult.error });
          return;
        }
        var element = findResult.element;
        highlightElement(element);
        return new Promise(function (resolve) { setTimeout(resolve, 400); }).then(function () {
          return handlePressKey(element, message.key, message.options);
        }).then(function (result) {
          setTimeout(function () { unhighlightElement(element); }, 300);
          sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: result.ok, error: result.error });
        });
      }).catch(function (err) {
        sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: false, error: err.message || String(err) });
      });
    } else {
      // No target — press key on the active element or document body
      var targetEl = document.activeElement || document.body;
      handlePressKey(targetEl, message.key, message.options).then(function (result) {
        sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: result.ok, error: result.error });
      });
    }
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
      // Brief delay so user can see the highlighted element before action executes
      return new Promise(function (resolve) {
        setTimeout(resolve, 400);
      }).then(function () {
        return executeAction(message, element);
      }).then(function (result) {
        // Keep highlight briefly after action so user sees the result
        setTimeout(function () { unhighlightElement(element); }, 300);
        sendResponse({ type: 'STEP_RESULT', stepIndex: stepIndex, ok: result.ok, error: result.error, savedValue: result.savedValue });
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
