// runtime.js — content script / DOM executor
// Implementation: Task 12
var api = typeof browser !== 'undefined' ? browser : chrome;

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
 * @param {object} descriptor - Element descriptor with `tag` and `where` properties
 * @param {Element|Document} [parentNode] - Optional parent node to scope the search
 * @returns {Promise<Element>} Resolves with the found element or rejects after timeout
 */
function findElement(descriptor, parentNode) {
  var root = parentNode || document;
  var tag = descriptor.tag;
  var where = descriptor.where;

  return new Promise(function (resolve, reject) {
    var startTime = Date.now();
    var TIMEOUT = 5000;

    function poll() {
      var candidates = root.querySelectorAll(tag);
      for (var i = 0; i < candidates.length; i++) {
        if (matchesWhere(candidates[i], where)) {
          resolve(candidates[i]);
          return;
        }
      }
      if (Date.now() - startTime >= TIMEOUT) {
        reject(new Error('Element not found'));
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
