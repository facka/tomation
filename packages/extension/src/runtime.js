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
 * Coerce a value to a string and truncate it to a maximum of 256 characters
 * (Req 2.4). Returns the (possibly truncated) string.
 *
 * @param {*} v - the value to coerce and truncate
 * @returns {string} the string coerced from v, sliced to at most 256 chars
 */
function truncate256(v) {
  var s = String(v);
  return s.length > 256 ? s.slice(0, 256) : s;
}

/**
 * Failure-time single pass over a candidate snapshot. Runs ONCE after the poll
 * window elapses (Req 8.2). Evaluates every `where` key against every candidate
 * synchronously (no await/yield) and designates at most one Near_Miss_Candidate
 * — the candidate satisfying the greatest number of Where_Matchers, ties keep
 * the first encountered (Req 2.3, 8.5).
 *
 * @param {NodeList|Array<Element>} candidates - snapshot from root.querySelectorAll(tag)
 * @param {object} where - the descriptor's where conditions
 * @param {Element|null} parentNode - childOf parent if present, null otherwise
 * @returns {{ nearMiss: object|null, candidateCount: number }}
 */
function buildWhereBreakdown(candidates, where, parentNode) {
  var candidateCount = candidates.length;

  // Zero candidates: empty breakdown, no Near_Miss (Req 2.2, 8.3).
  if (candidateCount === 0) {
    return { nearMiss: null, candidateCount: 0 };
  }

  var keys = Object.keys(where);
  var bestEl = null;
  var bestResults = null;
  var bestPassCount = -1;

  for (var c = 0; c < candidateCount; c++) {
    var el = candidates[c];
    var results = [];
    var passCount = 0;
    for (var k = 0; k < keys.length; k++) {
      var result = evaluateWhereKey(el, keys[k], where[keys[k]], parentNode);
      results.push(result);
      if (result.passed) passCount++;
    }
    // Greatest pass count wins; ties keep the FIRST encountered (Req 2.3, 8.5).
    if (passCount > bestPassCount) {
      bestPassCount = passCount;
      bestEl = el;
      bestResults = results;
    }
  }

  // Build the whereBreakdown for the Near_Miss_Candidate (Req 2.4, 2.6, 2.7).
  var whereBreakdown = [];
  var passed = [];
  var firstFailed = null;
  var fullMatch = true;

  for (var j = 0; j < keys.length; j++) {
    var key = keys[j];
    var r = bestResults[j];
    var entry = {
      key: key,
      expected: truncate256(where[key]),
      passed: r.passed
    };
    if (r.actual === UNAVAILABLE) {
      // Keep the matcher entry; record that the actual value was unavailable (Req 2.7).
      entry.actual = null;
      entry.actualUnavailable = true;
    } else {
      // Truncate observed value; text* actuals are already raw/untrimmed (Req 2.5).
      entry.actual = truncate256(r.actual);
    }
    whereBreakdown.push(entry);

    if (r.passed) {
      passed.push(key);
    } else {
      fullMatch = false;
      if (firstFailed === null) firstFailed = key;
    }
  }

  var nearMiss = {
    element: bestEl,
    whereBreakdown: whereBreakdown,
    passed: passed,
    firstFailed: firstFailed,
    // fullMatch true => matchesWhere would return true; consumers must not assume
    // a failing entry exists (Req 3.3).
    fullMatch: fullMatch,
    closestLabel: null
  };

  // Instrument the closestLabel strategies ONLY when the Near_Miss_Candidate has
  // a FAILING closestLabel matcher (Req 5.1). This runs only here, at failure
  // time, mirroring matchClosestLabel without changing matching semantics.
  if (where.closestLabel !== undefined) {
    var clIdx = keys.indexOf('closestLabel');
    if (clIdx !== -1 && !bestResults[clIdx].passed) {
      nearMiss.closestLabel = traceClosestLabel(bestEl, where.closestLabel, parentNode);
    }
  }

  return { nearMiss: nearMiss, candidateCount: candidateCount };
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
 * Failure-time instrumented variant of matchClosestLabel (Req 5.1-5.5). Runs
 * ONLY during the failure pass when the Near_Miss_Candidate has a failing
 * `closestLabel` matcher. It mirrors the strategy structure of
 * matchClosestLabel EXACTLY (no semantic change) but, instead of early-returning
 * a boolean, records the outcome of each strategy it attempts.
 *
 * Return shape:
 * {
 *   labelTag: string,                 // the expected label tag (Req 5.2)
 *   labelText: string|null,           // expected label text, truncated 256; null when absent (Req 5.3)
 *   labelTextAbsent: boolean,         // present+true when the expected label text is absent (Req 5.3)
 *   bounded: boolean,                 // true when Strategy A ran (parent-scoped, Req 5.4)
 *   strategies: [                     // in attempt order
 *     { name: 'boundedSubtree'|'forAttr'|'ancestorWalk'|'ariaLabelledby',
 *       outcome: 'matched'|'not-matched' }
 *   ]
 * }
 *
 * @param {Element} el - target element
 * @param {{ tag: string, text: string }} spec - label specification
 * @param {Element|null} parentNode - childOf parent if present, null otherwise
 * @returns {object} closestLabel sub-record
 */
function traceClosestLabel(el, spec, parentNode) {
  var tag = spec.tag.toUpperCase();
  var text = spec.text;

  var record = {
    labelTag: spec.tag,
    bounded: false,
    strategies: []
  };

  // Record expected label text, truncated to 256 chars; flag absence (Req 5.2, 5.3).
  if (text === undefined || text === null) {
    record.labelText = null;
    record.labelTextAbsent = true;
  } else {
    record.labelText = truncate256(text);
  }

  // Strategy A: childOf-bounded search — search within parent subtree only (Req 5.4).
  if (parentNode) {
    record.bounded = true;
    record.strategies.push({
      name: 'boundedSubtree',
      outcome: searchSubtreeForLabel(parentNode, tag, text) ? 'matched' : 'not-matched'
    });
    return record;
  }

  // Strategy B: Unbounded search with max 3 ancestor levels (Req 5.5).

  // B1: Explicit `for` attribute — find a matching-tag element with for=el.id.
  var forMatched = false;
  if (el.id) {
    var forLabels = document.querySelectorAll(spec.tag + '[for="' + el.id + '"]');
    for (var i = 0; i < forLabels.length; i++) {
      if (forLabels[i].tagName === tag && forLabels[i].textContent.trim() === text) {
        forMatched = true;
        break;
      }
    }
  }
  record.strategies.push({ name: 'forAttr', outcome: forMatched ? 'matched' : 'not-matched' });

  // B2: Walk up at most 3 ancestor levels, search descendants.
  // Mirrors matchClosestLabel: stop at the first level where a matching-tag
  // element is found — if its text doesn't match, the closest label is wrong.
  var ancestorMatched = false;
  var ancestor = el.parentElement;
  for (var depth = 0; depth < 3 && ancestor; depth++) {
    var candidates = ancestor.getElementsByTagName(tag);
    if (candidates.length > 0) {
      for (var ci = 0; ci < candidates.length; ci++) {
        if (candidates[ci].textContent.trim() === text) {
          ancestorMatched = true;
          break;
        }
      }
      // Tag found at this level — stop searching further regardless of text match.
      break;
    }
    ancestor = ancestor.parentElement;
  }
  record.strategies.push({ name: 'ancestorWalk', outcome: ancestorMatched ? 'matched' : 'not-matched' });

  // B3: aria-labelledby resolution.
  var ariaMatched = false;
  var labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    var refEl = document.getElementById(labelledBy);
    if (refEl && refEl.tagName === tag && refEl.textContent.trim() === text) {
      ariaMatched = true;
    }
  }
  record.strategies.push({ name: 'ariaLabelledby', outcome: ariaMatched ? 'matched' : 'not-matched' });

  return record;
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
          var elapsedMs = Date.now() - startTime;
          var trace = {
            strategy: 'xpath',
            expression: descriptor.xpath,
            elapsedMs: Math.max(0, Math.min(5000, elapsedMs)),
            configuredWaitMs: TIMEOUT_5sec
          };
          try {
            var snap = document.evaluate(
              descriptor.xpath,
              root,
              null,
              XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
              null
            );
            var len = snap.snapshotLength;
            trace.matchedNodeCount = len;
            trace.outcome = len === 0 ? 'none' : (len === 1 ? 'one' : 'many');
          } catch (e) {
            trace.outcome = 'invalid';
            trace.invalid = true;
          }
          var err = new Error('Element not found: XPath ' + descriptor.xpath);
          err.findTrace = trace;
          reject(err);
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
    var maxSeenCandidates = 0;

    function poll() {
      var candidates = root.querySelectorAll(tag);
      maxSeenCandidates = Math.max(maxSeenCandidates, candidates.length);
      for (var i = 0; i < candidates.length; i++) {
        if (matchesWhere(candidates[i], where, root === document ? null : root)) {
          resolve(candidates[i]);
          return;
        }
      }
      if (Date.now() - startTime >= TIMEOUT_5sec) {
        // One final synchronous breakdown pass over the current snapshot (Req 8.2).
        // Reuse the `candidates` computed at the top of this poll() invocation —
        // do NOT issue an extra querySelectorAll.
        var bd = buildWhereBreakdown(candidates, where, root === document ? null : root);
        var elapsedMs = Date.now() - startTime;

        // Classify absence — exactly one value (Req 3.6).
        var absence;
        if (bd.nearMiss && bd.nearMiss.fullMatch) {
          absence = 'appeared-after-timeout'; // Req 3.3
        } else if (maxSeenCandidates > 0 || bd.candidateCount > 0) {
          absence = 'present-unmatched'; // Req 3.2
        } else {
          absence = 'absent-full-window'; // Req 3.1
        }

        var trace = {
          strategy: 'tag-where',
          tag: tag,
          candidateCount: bd.candidateCount,
          whereBreakdown: bd.nearMiss ? bd.nearMiss.whereBreakdown : [],
          passedMatchers: bd.nearMiss ? bd.nearMiss.passed : [],
          failedMatcher: bd.nearMiss ? bd.nearMiss.firstFailed : null,
          closestLabel: bd.nearMiss ? bd.nearMiss.closestLabel : null,
          absence: absence,
          finalFrameCandidateCount: bd.candidateCount,
          elapsedMs: Math.max(0, Math.min(5000, elapsedMs))
        };

        // Still reject — no retroactive success. Preserve the human-readable
        // error string exactly, carry the trace on err.findTrace (Req 3.4, 8.4).
        var err = new Error('Element not found: ' + tag + ' with conditions ' + JSON.stringify(where));
        err.findTrace = trace;
        reject(err);
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
 * @returns {{ok: boolean, element?: Element, error?: string, failedHopIndex?: number, failedHopType?: string}}
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
          // Human message stays 1-based; machine fields use the zero-based loop index i.
          return { ok: false, error: 'Navigation failed at step ' + (i + 1) + ' (sibling[' + s.index + ']): no parent element', failedHopIndex: i, failedHopType: s.step };
        }
        next = parent.children[s.index - 1];
        break;
    }
    if (!next) {
      var token = s.step + (s.index !== undefined ? '[' + s.index + ']' : '');
      // Human message stays 1-based; machine fields use the zero-based loop index i.
      return { ok: false, error: 'Navigation failed at step ' + (i + 1) + ' (' + token + '): element is null', failedHopIndex: i, failedHopType: s.step };
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
  var action = stepMessage.action;

  // Synthesize a trace with an empty ordered step sequence (Req 1.7) for the
  // cases where no findElement trace was produced before failing (e.g. a
  // navigate-hop failure after the anchor resolved).
  function emptyTrace() {
    return { steps: [] };
  }

  // Helper to apply navigate steps after anchor is found.
  // Reaching this point means findElement resolved the anchor to exactly one
  // element, so anchorResolved is true whenever navigate hops are attempted.
  // (If the anchor fails to resolve, findElement rejects and this helper is
  // never called, so no hops are attempted — the anchorResolved:false case.)
  function applyNavigation(element) {
    if (navigateSteps && navigateSteps.length > 0) {
      var navResult = applyNavigateSteps(element, navigateSteps);
      navResult.anchorResolved = true;
      return navResult;
    }
    return { ok: true, element: element };
  }

  if (!parentDescriptor) {
    return findElement(elementDescriptor, document)
      .then(function (element) {
        return applyNavigation(element);
      })
      .then(function (result) {
        // Anchor resolved but a navigate hop failed: build the cross-cutting
        // trace here (findElement produced no trace on the success path).
        if (result && result.ok === false) {
          var navTrace = emptyTrace();
          navTrace.scope = 'whole-document';               // Req 1.3
          navTrace.action = action;                        // Req 11.3
          navTrace.error = 'Element not found: ' + stepMessage.target; // Req 1.6
          navTrace.navigate = {
            anchorResolved: result.anchorResolved === true, // Req 6.3
            failedHopIndex: result.failedHopIndex,          // zero-based (Req 6.1, 6.2)
            failedHopType: result.failedHopType,            // Req 6.2
            hopCount: navigateSteps ? navigateSteps.length : 0
          };
          return { ok: false, error: navTrace.error, findTrace: navTrace };
        }
        return result;
      })
      .catch(function (err) {
        // findElement rejected (anchor / tag+where / xpath resolution failed).
        var trace = (err && err.findTrace) || emptyTrace(); // Req 1.1, 1.2, 1.7
        trace.scope = 'whole-document';                     // Req 1.3
        trace.action = action;                              // Req 11.3
        trace.error = 'Element not found: ' + stepMessage.target; // Req 1.6
        // When navigate hops were declared but the anchor never resolved, record
        // that no hops were attempted (Req 6.4).
        if (navigateSteps && navigateSteps.length > 0 && !trace.navigate) {
          trace.navigate = {
            anchorResolved: false,
            hopCount: navigateSteps.length
          };
        }
        return { ok: false, error: trace.error, findTrace: trace };
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

  // Identifier used for the parent descriptor when the parent fails to resolve
  // (Req 4.2). Mirrors the id used in the preserved human error string below.
  var parentDescriptorId = parentDescriptor.where && parentDescriptor.where.id
    ? parentDescriptor.where.id
    : 'unknown';

  return findElement(parentDescriptor, document)
    .then(function (parentElement) {
      return findElement(elementDescriptor, parentElement)
        .then(function (element) {
          return applyNavigation(element);
        })
        .catch(function (error) {
          // Parent resolved, but the child was not found within its subtree.
          var preservedError = 'Element with parent ' + getElementXPath(parentElement) + ' not found: ' + stepMessage.target + error.message;
          var trace = (error && error.findTrace) || emptyTrace(); // Req 1.7
          trace.scope = 'parent-scoped';                            // Req 1.3, 4.3
          trace.action = action;                                    // Req 11.3
          trace.error = preservedError;                             // Req 1.6, 4.3

          // Failure-only count of matching parent elements (Req 4.5). Not run
          // during matching — only here, once, on child failure.
          var matchCount = 0;
          if (parentDescriptor.tag) {
            var parentCandidates = document.querySelectorAll(parentDescriptor.tag);
            for (var i = 0; i < parentCandidates.length; i++) {
              if (matchesWhere(parentCandidates[i], parentDescriptor.where || {}, null)) {
                matchCount++;
              }
            }
          }

          trace.parent = {
            resolved: true,                            // Req 4.1
            identifier: getElementXPath(parentElement), // Req 4.4
            matchCount: matchCount,                    // Req 4.5
            scopedToParent: true                       // Req 4.3
          };
          return { ok: false, error: preservedError, findTrace: trace };
        });
    })
    .catch(function () {
      // Parent element failed to resolve — no child pass occurred.
      var preservedError = 'Parent element not found: ' + parentDescriptorId;
      var trace = emptyTrace();               // Req 1.7 (no child pass, empty steps)
      trace.scope = 'whole-document';         // Req 1.3 (parent search is document-wide)
      trace.action = action;                  // Req 11.3
      trace.error = preservedError;           // Req 1.6, 4.2
      trace.parent = {
        resolved: false,                      // Req 4.1
        descriptorId: parentDescriptorId      // Req 4.2
      };
      return { ok: false, error: preservedError, findTrace: trace };
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
