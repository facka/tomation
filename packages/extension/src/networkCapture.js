// networkCapture.js — pure capture helpers for network usage tracking
// Implementation: Task 1 (subtasks 1.1, 1.2)
//
// This module holds the pure, testable core of the network capture feature:
//   - shouldCapture: resource-type filter (XHR/Fetch only)
//   - capBody: 1 MB byte-length cap with truncation flag (UTF-8 aware)
//   - capUrl: 8,192-character URL cap
//   - parseQueryParams: URL query string → { key: [values] }
//   - buildCapturedRequest: assemble a CapturedRequest from CDP requestWillBeSent
//
// Exported via module.exports following the background test-hook convention.

// Cap constants (Requirements 1.3, 1.4).
var MAX_URL_CHARS = 8192;          // Req 1.3 — URL capped to leading 8,192 chars
var MAX_BODY_BYTES = 1048576;      // Req 1.4 — 1 MB (1,048,576 bytes) body cap

/**
 * Decide whether a CDP resource type should be captured.
 * Only XHR and Fetch requests are in scope; static assets (Image, Script,
 * Stylesheet, Font, Media) and any other resource type are excluded.
 *
 * @param {string} resourceType - CDP resource type (e.g. 'XHR', 'Fetch', 'Image')
 * @returns {boolean} true only for 'XHR' or 'Fetch'
 */
function shouldCapture(resourceType) {
  return resourceType === 'XHR' || resourceType === 'Fetch';
}

/**
 * Compute the UTF-8 byte length of a string.
 * @param {string} str
 * @returns {number}
 */
function byteLength(str) {
  if (str == null) return 0;
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  // Fallback for environments without TextEncoder (compute UTF-8 length manually).
  var s = String(str);
  var bytes = 0;
  for (var i = 0; i < s.length; i++) {
    var code = s.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate — pairs with the following low surrogate for a 4-byte char.
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Cap a body to the first 1,048,576 bytes (1 MB) of its UTF-8 encoding.
 * The cap is by BYTE length (Req 1.4), so multi-byte UTF-8 characters are
 * handled correctly and never split across the boundary.
 *
 * @param {string} body - raw body string (may be undefined/null → treated as '')
 * @returns {{ value: string, truncated: boolean }}
 *   value: the (possibly truncated) body; truncated: true iff byte length > 1 MB
 */
function capBody(body) {
  var str = body == null ? '' : String(body);
  if (byteLength(str) <= MAX_BODY_BYTES) {
    return { value: str, truncated: false };
  }

  if (typeof TextEncoder !== 'undefined' && typeof TextDecoder !== 'undefined') {
    var encoded = new TextEncoder().encode(str);
    var slice = encoded.slice(0, MAX_BODY_BYTES);
    // Decode without fatal so a trailing partial multi-byte sequence is dropped
    // rather than producing a replacement character — the value stays valid UTF-8.
    var value = new TextDecoder('utf-8').decode(slice);
    return { value: value, truncated: true };
  }

  // Fallback: walk characters, accumulating until the next char would exceed the cap.
  var out = '';
  var used = 0;
  for (var i = 0; i < str.length; i++) {
    var ch = str[i];
    var chBytes = byteLength(ch);
    if (used + chBytes > MAX_BODY_BYTES) break;
    out += ch;
    used += chBytes;
  }
  return { value: out, truncated: true };
}

/**
 * Cap a URL to the leading 8,192 characters (Req 1.3).
 * @param {string} url
 * @returns {string}
 */
function capUrl(url) {
  var str = url == null ? '' : String(url);
  return str.length > MAX_URL_CHARS ? str.slice(0, MAX_URL_CHARS) : str;
}

/**
 * Parse the query string from a URL into a map of key → array of values.
 * Repeat keys accumulate into the array (Req 1.3).
 *
 * @param {string} url - full request URL
 * @returns {Object<string, string[]>}
 */
function parseQueryParams(url) {
  var params = {};
  var str = url == null ? '' : String(url);
  var qIndex = str.indexOf('?');
  if (qIndex === -1) return params;

  var query = str.slice(qIndex + 1);
  // Strip a trailing hash fragment if present.
  var hashIndex = query.indexOf('#');
  if (hashIndex !== -1) query = query.slice(0, hashIndex);
  if (query === '') return params;

  var pairs = query.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    if (pair === '') continue;
    var eq = pair.indexOf('=');
    var rawKey = eq === -1 ? pair : pair.slice(0, eq);
    var rawVal = eq === -1 ? '' : pair.slice(eq + 1);
    var key = decodeComponent(rawKey);
    var val = decodeComponent(rawVal);
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      params[key].push(val);
    } else {
      params[key] = [val];
    }
  }
  return params;
}

/**
 * Decode a URI component, converting '+' to space and tolerating malformed input.
 * @param {string} s
 * @returns {string}
 */
function decodeComponent(s) {
  var withSpaces = String(s).replace(/\+/g, ' ');
  try {
    return decodeURIComponent(withSpaces);
  } catch (e) {
    return withSpaces;
  }
}

/**
 * Build a CapturedRequest from CDP requestWillBeSent params + locked attribution.
 *
 * The response-side fields (status, responseBody, responseBodyTruncated,
 * bodyUnavailable) are initialized to their pending defaults here and filled in
 * at completion by the capture service.
 *
 * @param {object} cdpParams - CDP requestWillBeSent params:
 *   { requestId, request: { url, method, postData }, ... }
 * @param {object} attribution - locked attribution { stepIndex, taskPath }
 * @param {number} seq - monotonic initiation sequence → initiatedAt
 * @returns {object} CapturedRequest
 */
function buildCapturedRequest(cdpParams, attribution, seq) {
  var params = cdpParams || {};
  var request = params.request || {};
  var attr = attribution || {};

  var rawUrl = request.url == null ? '' : String(request.url);
  var capped = capBody(request.postData == null ? '' : String(request.postData));

  return {
    requestId: params.requestId == null ? '' : String(params.requestId),
    url: capUrl(rawUrl),
    method: request.method == null ? '' : String(request.method), // verbatim (Req 1.3)
    queryParams: parseQueryParams(rawUrl),
    requestBody: capped.value,
    requestBodyTruncated: capped.truncated,
    status: null,                    // filled at completion (Req 1.3, 5.8)
    responseBody: '',                // filled at completion
    responseBodyTruncated: false,    // filled at completion
    bodyUnavailable: false,          // filled at completion (Req 1.5)
    stepIndex: attr.stepIndex == null ? null : attr.stepIndex,          // locked (Req 4.1)
    taskPath: attr.taskPath == null ? null : attr.taskPath,             // locked (Req 4.2)
    initiatedAt: seq                 // ordering key (Req 5.7)
  };
}

/**
 * Resolve the step attribution for a network request at the moment it is
 * initiated, from a snapshot of the run state (Req 4.1-4.5).
 *
 * The result is LOCKED into the in-flight record at initiation and copied
 * verbatim onto the completed CapturedRequest; response handlers never
 * recompute it (Req 4.1).
 *
 * Resolution order:
 *   1. If a step is currently executing → attribute to that step, using its
 *      `_taskPath` when the step belongs to a task. A non-task step has
 *      `_taskPath === []`, which yields `taskPath: null` so it groups under
 *      the step directly (Req 4.1, 4.2, 4.5).
 *   2. Else if at least one step has already executed → attribute to the most
 *      recently executed step (Req 4.3).
 *   3. Else (before the first step) → unattributed (Req 4.4).
 *
 * @param {object} snapshot - { stepIndex, stepsLength, executing, steps, lastExecutedIndex }
 * @returns {{ stepIndex: (number|null), taskPath: (Array|null) }}
 */
function resolveAttribution(snapshot) {
  var snap = snapshot || {};
  var steps = snap.steps || [];

  if (snap.executing) {
    var step = steps[snap.stepIndex];
    return {
      stepIndex: snap.stepIndex,
      taskPath: (step && step._taskPath && step._taskPath.length) ? step._taskPath : null // Req 4.1, 4.2, 4.5
    };
  }

  if (snap.lastExecutedIndex >= 0) {
    var last = steps[snap.lastExecutedIndex];
    return {
      stepIndex: snap.lastExecutedIndex,
      taskPath: (last && last._taskPath && last._taskPath.length) ? last._taskPath : null // Req 4.3
    };
  }

  return { stepIndex: null, taskPath: null }; // before first step → unattributed (Req 4.4)
}

// Export for use by background.js and for testing (background test-hook convention).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAX_URL_CHARS: MAX_URL_CHARS,
    MAX_BODY_BYTES: MAX_BODY_BYTES,
    shouldCapture: shouldCapture,
    byteLength: byteLength,
    capBody: capBody,
    capUrl: capUrl,
    parseQueryParams: parseQueryParams,
    buildCapturedRequest: buildCapturedRequest,
    resolveAttribution: resolveAttribution
  };
}
