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

// ---------------------------------------------------------------------------
// Request_Matcher pure functions + assertion evaluation (Task 8)
//
// These are pure, testable functions over a compiled `assertRequest` step's
// `matcher`/`expectation` and the array of captured requests. They live here
// (rather than background.js) so the matching/evaluation logic can be unit- and
// property-tested in isolation; background.js consumes them via module.exports.
// ---------------------------------------------------------------------------

/**
 * Convert a glob pattern to a RegExp source string.
 * `*` matches any run of characters (including none); `?` matches a single
 * character. All other regex metacharacters are escaped so they match
 * literally. The pattern is unanchored (a match anywhere counts) unless the
 * caller anchors it, consistent with regex handling (Req 6.3).
 *
 * @param {string} glob
 * @returns {string} RegExp source
 */
function globToRegExpSource(glob) {
  var str = glob == null ? '' : String(glob);
  var out = '';
  for (var i = 0; i < str.length; i++) {
    var ch = str[i];
    if (ch === '*') {
      out += '.*';
    } else if (ch === '?') {
      out += '.';
    } else if ('\\^$.|+()[]{}'.indexOf(ch) !== -1) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Match a URL against a URL criterion (Req 6.2, 6.3).
 *   exact → strict character-for-character equality (case-sensitive).
 *   regex → new RegExp(source, flags).test(url) — unanchored unless the pattern anchors.
 *   glob  → compiled to an (unanchored) RegExp and tested against the URL.
 * An invalid regex/glob source never matches.
 *
 * @param {object} criterion - UrlCriterion { kind, value?, source?, flags?, pattern? }
 * @param {string} url
 * @returns {boolean}
 */
function urlMatches(criterion, url) {
  if (!criterion) return true;
  var target = url == null ? '' : String(url);
  if (criterion.kind === 'exact') {
    return target === (criterion.value == null ? '' : String(criterion.value));
  }
  if (criterion.kind === 'regex') {
    try {
      var re = new RegExp(criterion.source == null ? '' : String(criterion.source),
        criterion.flags == null ? '' : String(criterion.flags));
      return re.test(target);
    } catch (e) {
      return false;
    }
  }
  if (criterion.kind === 'glob') {
    try {
      var globRe = new RegExp(globToRegExpSource(criterion.pattern));
      return globRe.test(target);
    } catch (e2) {
      return false;
    }
  }
  return false;
}

/**
 * Match an HTTP method case-insensitively (Req 6.4). Compares uppercased tokens.
 *
 * @param {string} criterionMethod - the supplied method criterion (validated separately)
 * @param {string} reqMethod - the captured request method
 * @returns {boolean}
 */
function methodMatches(criterionMethod, reqMethod) {
  if (criterionMethod == null) return true;
  var a = String(criterionMethod).toUpperCase();
  var b = (reqMethod == null ? '' : String(reqMethod)).toUpperCase();
  return a === b;
}

/**
 * Subset match of query parameters (Req 6.6). For every supplied key/value the
 * captured query map must contain that key with an equal value (case-sensitive).
 * The captured map is `{ key: [values] }`; a supplied value matches when it
 * equals any one of the captured values for that key. Extra captured params are
 * ignored.
 *
 * @param {Object<string,string>} supplied - matcher.queryParams (key → value)
 * @param {Object<string,string[]>} captured - req.queryParams (key → [values])
 * @returns {boolean}
 */
function querySubsetMatches(supplied, captured) {
  if (!supplied) return true;
  var cap = captured || {};
  for (var key in supplied) {
    if (!Object.prototype.hasOwnProperty.call(supplied, key)) continue;
    if (!Object.prototype.hasOwnProperty.call(cap, key)) return false;
    var wanted = String(supplied[key]);
    var values = cap[key];
    var found = false;
    if (Array.isArray(values)) {
      for (var i = 0; i < values.length; i++) {
        if (String(values[i]) === wanted) { found = true; break; }
      }
    } else {
      found = String(values) === wanted;
    }
    if (!found) return false;
  }
  return true;
}

/**
 * Structural subset check: every key/value in `subset` is present in `superset`
 * with a deeply-equal value. Arrays are compared by exact element-wise equality.
 *
 * @param {*} subset
 * @param {*} superset
 * @returns {boolean}
 */
function isStructuralSubset(subset, superset) {
  if (subset === superset) return true;
  if (subset == null || superset == null) return subset === superset;
  if (typeof subset !== 'object' || typeof superset !== 'object') {
    return subset === superset;
  }
  if (Array.isArray(subset) || Array.isArray(superset)) {
    if (!Array.isArray(subset) || !Array.isArray(superset)) return false;
    if (subset.length !== superset.length) return false;
    for (var i = 0; i < subset.length; i++) {
      if (!isStructuralSubset(subset[i], superset[i])) return false;
    }
    return true;
  }
  for (var key in subset) {
    if (!Object.prototype.hasOwnProperty.call(subset, key)) continue;
    if (!Object.prototype.hasOwnProperty.call(superset, key)) return false;
    if (!isStructuralSubset(subset[key], superset[key])) return false;
  }
  return true;
}

/**
 * Parse an application/x-www-form-urlencoded body into a plain object of
 * key → value. Repeat keys keep the last value (subset comparison treats form
 * values as scalars). Returns null on inputs that are not strings.
 *
 * @param {string} body
 * @returns {Object<string,string>|null}
 */
function parseFormBody(body) {
  if (typeof body !== 'string') return null;
  var out = {};
  if (body === '') return out;
  var pairs = body.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    if (pair === '') continue;
    var eq = pair.indexOf('=');
    var rawKey = eq === -1 ? pair : pair.slice(0, eq);
    var rawVal = eq === -1 ? '' : pair.slice(eq + 1);
    out[decodeComponent(rawKey)] = decodeComponent(rawVal);
  }
  return out;
}

/**
 * Match a request body against a body criterion (Req 6.7, 6.8).
 *   json → JSON.parse(body); supplied object must be a structural subset. Parse failure → no match.
 *   form → parse x-www-form-urlencoded; supplied pairs must be a subset. Parse failure → no match.
 *   raw  → exact character-for-character equality.
 *
 * @param {object} criterion - BodyCriterion { kind, value }
 * @param {string} reqBody - captured request body
 * @returns {boolean}
 */
function bodyMatches(criterion, reqBody) {
  if (!criterion) return true;
  var body = reqBody == null ? '' : String(reqBody);

  if (criterion.kind === 'raw') {
    return body === (criterion.value == null ? '' : String(criterion.value)); // Req 6.7
  }
  if (criterion.kind === 'json') {
    var parsed;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      return false; // parse failure → no match (Req 6.8)
    }
    return isStructuralSubset(criterion.value, parsed);
  }
  if (criterion.kind === 'form') {
    var form = parseFormBody(body);
    if (form == null) return false; // parse failure → no match (Req 6.8)
    return isStructuralSubset(criterion.value, form);
  }
  return false;
}

/**
 * Match a response status against a status criterion (Req 6.9, 6.10).
 *   exact → status === value.
 *   range → min <= status <= max (inclusive).
 * A null status (pending/failed) never matches a numeric or range criterion.
 *
 * @param {object} criterion - StatusCriterion { kind, value?, min?, max? }
 * @param {number|null} status
 * @returns {boolean}
 */
function statusMatches(criterion, status) {
  if (!criterion) return true;
  if (status == null) return false; // pending/failed never matches (Req 6.9, 6.10)
  var s = Number(status);
  if (criterion.kind === 'exact') {
    return s === Number(criterion.value);
  }
  if (criterion.kind === 'range') {
    return s >= Number(criterion.min) && s <= Number(criterion.max);
  }
  return false;
}

/**
 * Logical AND over all present matcher criteria (Req 6.11). A criterion that is
 * absent from the matcher is not evaluated (a matcher with no criteria matches
 * every request).
 *
 * @param {object} matcher - RequestMatcher
 * @param {object} req - CapturedRequest
 * @returns {boolean}
 */
function requestMatches(matcher, req) {
  var m = matcher || {};
  if (m.url && !urlMatches(m.url, req.url)) return false;                       // Req 6.2, 6.3
  if (m.method && !methodMatches(m.method, req.method)) return false;           // Req 6.4
  if (m.queryParams && !querySubsetMatches(m.queryParams, req.queryParams)) return false; // Req 6.6
  if (m.body && !bodyMatches(m.body, req.requestBody)) return false;            // Req 6.7, 6.8
  if (m.status && !statusMatches(m.status, req.status)) return false;           // Req 6.9, 6.10
  return true;                                                                  // Req 6.11
}

/**
 * Validate a matcher before matching (Req 6.5). Currently only the method
 * criterion is validated: if present, it must be a non-empty alphabetic token
 * (e.g. GET, POST). An empty or otherwise invalid method criterion returns a
 * human-readable reason string; a valid matcher returns null.
 *
 * @param {object} matcher - RequestMatcher
 * @returns {string|null} reason string when invalid, else null
 */
function validateMatcher(matcher) {
  var m = matcher || {};
  if (Object.prototype.hasOwnProperty.call(m, 'method') && m.method != null) {
    var method = String(m.method);
    if (!/^[A-Za-z]+$/.test(method)) {
      return 'Invalid HTTP method: "' + method + '"'; // Req 6.5
    }
  }
  return null;
}

/**
 * Describe a matcher's criteria as a compact, human-readable string for use in
 * failure messages (Req 9.3).
 *
 * @param {object} matcher - RequestMatcher
 * @returns {string}
 */
function describeMatcher(matcher) {
  var m = matcher || {};
  var parts = [];
  if (m.method) parts.push('method: ' + String(m.method).toUpperCase());
  if (m.url) {
    if (m.url.kind === 'exact') parts.push('url: ' + m.url.value);
    else if (m.url.kind === 'regex') parts.push('url =~ /' + m.url.source + '/' + (m.url.flags || ''));
    else if (m.url.kind === 'glob') parts.push('url glob: ' + m.url.pattern);
  }
  if (m.queryParams) {
    var q = [];
    for (var key in m.queryParams) {
      if (Object.prototype.hasOwnProperty.call(m.queryParams, key)) {
        q.push(key + '=' + m.queryParams[key]);
      }
    }
    parts.push('query: { ' + q.join(', ') + ' }');
  }
  if (m.body) parts.push('body(' + m.body.kind + ')');
  if (m.status) {
    if (m.status.kind === 'exact') parts.push('status: ' + m.status.value);
    else if (m.status.kind === 'range') parts.push('status: ' + m.status.min + '-' + m.status.max);
  }
  return '{ ' + parts.join(', ') + ' }';
}

/**
 * Build a failure message stating the matcher criteria and the observed count
 * (Req 9.3). The expected-clause reflects the expectation kind.
 *
 * @param {object} step - the assertRequest step { matcher, expectation }
 * @param {number} observed - number of captured requests that matched
 * @param {number} [expectedCount] - required count for a count expectation
 * @returns {string}
 */
function failMsg(step, observed, expectedCount) {
  var s = step || {};
  var exp = s.expectation || { kind: 'exists' };
  var criteria = describeMatcher(s.matcher);
  var expectedClause;
  if (exp.kind === 'notMade') {
    expectedClause = 'expected no request matching ' + criteria;
  } else if (exp.kind === 'count') {
    var c = expectedCount == null ? exp.count : expectedCount;
    expectedClause = 'expected exactly ' + c + ' request(s) matching ' + criteria;
  } else {
    expectedClause = 'expected \u22651 request matching ' + criteria;
  }
  return 'AssertRequest failed: ' + expectedClause + ', observed ' + observed;
}

/**
 * Evaluate an assertRequest step against the captured request set (Req 7, 8, 9.3).
 * First validates the matcher (Req 6.5); then filters matches and evaluates the
 * expectation (exists / notMade / count).
 *
 * @param {object} step - compiled assertRequest step { matcher, expectation }
 * @param {Array<object>} captured - CapturedRequest[]
 * @returns {{ ok: boolean, matchCount: number, message?: string }}
 */
function evaluateAssertRequest(step, captured) {
  var s = step || {};
  var invalid = validateMatcher(s.matcher);
  if (invalid) return { ok: false, matchCount: 0, message: invalid }; // Req 6.5

  var records = captured || [];
  var matches = [];
  for (var i = 0; i < records.length; i++) {
    if (requestMatches(s.matcher, records[i])) matches.push(records[i]);
  }
  var n = matches.length;
  var exp = s.expectation || { kind: 'exists' };

  if (exp.kind === 'notMade') { // Req 7.3, 7.4, 7.5
    return { ok: n === 0, matchCount: n, message: n === 0 ? undefined : failMsg(s, n) };
  }
  if (exp.kind === 'count') { // Req 8.1, 8.2, 8.3
    return {
      ok: n === exp.count,
      matchCount: n,
      message: n === exp.count ? undefined : failMsg(s, n, exp.count)
    };
  }
  // exists (default) — Req 7.1, 7.2, 6.12
  return { ok: n >= 1, matchCount: n, message: n >= 1 ? undefined : failMsg(s, n) };
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
    resolveAttribution: resolveAttribution,
    globToRegExpSource: globToRegExpSource,
    urlMatches: urlMatches,
    methodMatches: methodMatches,
    querySubsetMatches: querySubsetMatches,
    isStructuralSubset: isStructuralSubset,
    parseFormBody: parseFormBody,
    bodyMatches: bodyMatches,
    statusMatches: statusMatches,
    requestMatches: requestMatches,
    validateMatcher: validateMatcher,
    describeMatcher: describeMatcher,
    failMsg: failMsg,
    evaluateAssertRequest: evaluateAssertRequest
  };
}
