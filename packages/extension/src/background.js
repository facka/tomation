// background.js — service worker / orchestrator
// Implementation: Tasks 14, 15
try { importScripts('storage.js'); } catch (e) { /* Node.js test environment */ }
var api = typeof browser !== 'undefined' ? browser : chrome;

// Open side panel when the extension icon is clicked (Chrome/Edge only)
if (api.sidePanel && api.sidePanel.setPanelBehavior) {
  api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(function () { /* ignore if unsupported */ });
}

/**
 * Safely send a message to the panel via runtime.sendMessage.
 * Catches "Could not establish connection" errors that occur when
 * the panel is not open/connected.
 *
 * @param {object} msg - The message to send
 */
function safeSendMessage(msg) {
  try {
    api.runtime.sendMessage(msg).catch(function (err) {
      console.log(
        '[tomation] sendMessage failed: ' + (err.message || err) + '\n' +
        'Possible reason: The side panel or popup is not open, or the extension context was invalidated.\n' +
        'Suggested solutions:\n' +
        '  1. Open the extension side panel and try again.\n' +
        '  2. Reload the page to re-establish the content script connection.\n' +
        '  3. Reload the extension from chrome://extensions if the context was invalidated.'
      );
    });
  } catch (e) {
    console.log(
      '[tomation] sendMessage threw synchronously: ' + (e.message || e) + '\n' +
      'Possible reason: The extension runtime is no longer available (e.g., extension was updated or disabled).\n' +
      'Suggested solutions:\n' +
      '  1. Reload the extension from the extensions page.\n' +
      '  2. Reload the page to restore the connection.\n' +
      '  3. Close and reopen the browser if the issue persists.'
    );
  }
}

/**
 * Generate a random alphanumeric string of the given length.
 * @param {number} [len=8] - Length of the random string
 * @returns {string}
 */
function generateRandom(len) {
  if (len === undefined) len = 8;
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  for (var i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Format a Date using token substitution.
 * Tokens: YYYY, MM, DD, M, D. Everything else is literal.
 * @param {Date} date
 * @param {string} [formatStr='YYYY-MM-DD']
 * @returns {string}
 */
function formatDate(date, formatStr) {
  if (formatStr === undefined) formatStr = 'YYYY-MM-DD';
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  var day = date.getDate();

  // Ordered from longest token to shortest to avoid partial matches
  var tokens = {
    'YYYY': String(year),
    'MM': (month < 10 ? '0' : '') + month,
    'DD': (day < 10 ? '0' : '') + day,
    'M': String(month),
    'D': String(day)
  };

  var result = '';
  var i = 0;
  while (i < formatStr.length) {
    var matched = false;
    // Try each token from longest to shortest
    var tokenNames = ['YYYY', 'MM', 'DD', 'M', 'D'];
    for (var t = 0; t < tokenNames.length; t++) {
      var token = tokenNames[t];
      if (formatStr.substr(i, token.length) === token) {
        result += tokens[token];
        i += token.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Check if this is an alphabetic sequence (potential unrecognized token)
      var ch = formatStr.charAt(i);
      if (ch >= 'A' && ch <= 'Z' || ch >= 'a' && ch <= 'z') {
        // Gather the full alphabetic sequence
        var start = i;
        while (i < formatStr.length) {
          var c = formatStr.charAt(i);
          if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) {
            i++;
          } else {
            break;
          }
        }
        var unknownToken = formatStr.substring(start, i);
        console.warn('[tomation] Unrecognized format token "' + unknownToken + '"');
        result += unknownToken;
      } else {
        // Literal separator character (/, -, ., space, etc.)
        result += ch;
        i++;
      }
    }
  }
  return result;
}

/**
 * Resolve a dateHelper descriptor to a date string.
 * @param {object} descriptor - { type, kind, offset?, boundary?, monthOffset?, format? }
 * @returns {string} formatted date string
 */
function resolveDateHelper(descriptor) {
  var now = new Date();
  var resolved;

  if (descriptor.kind === 'dayOffset') {
    resolved = new Date(now.getFullYear(), now.getMonth(), now.getDate() + descriptor.offset);
  } else if (descriptor.kind === 'monthBoundary') {
    var targetMonth = now.getMonth() + descriptor.monthOffset;
    var targetYear = now.getFullYear();

    // Normalize month/year when targetMonth goes out of 0-11 range
    targetYear += Math.floor(targetMonth / 12);
    targetMonth = ((targetMonth % 12) + 12) % 12;

    if (descriptor.boundary === 'first') {
      resolved = new Date(targetYear, targetMonth, 1);
    } else {
      // Last day of month: day 0 of the next month gives last day of target month
      resolved = new Date(targetYear, targetMonth + 1, 0);
    }
  } else {
    resolved = now;
  }

  return formatDate(resolved, descriptor.format);
}

/**
 * Evaluate an arithmetic expression string with param substitution.
 * Supports: +, -, *, /, parentheses, identifiers (from params), numbers.
 * Uses a simple recursive descent parser — no eval().
 * @param {string} source - expression source text
 * @param {object} params - parameter context
 * @returns {string} result coerced to string, or '' on error
 */
function evaluateExpression(source, params) {
  var pos = 0;
  var src = source;

  function skipWhitespace() {
    while (pos < src.length && (src.charAt(pos) === ' ' || src.charAt(pos) === '\t')) {
      pos++;
    }
  }

  function parseNumber() {
    skipWhitespace();
    var start = pos;
    // Handle leading negative for number literals only when not an operator context
    if (pos < src.length && src.charAt(pos) === '.') {
      pos++;
    }
    while (pos < src.length && src.charAt(pos) >= '0' && src.charAt(pos) <= '9') {
      pos++;
    }
    if (pos < src.length && src.charAt(pos) === '.') {
      pos++;
      while (pos < src.length && src.charAt(pos) >= '0' && src.charAt(pos) <= '9') {
        pos++;
      }
    }
    if (pos === start) return null;
    return parseFloat(src.substring(start, pos));
  }

  function parseIdentifier() {
    skipWhitespace();
    var start = pos;
    var ch = src.charAt(pos);
    if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$')) {
      return null;
    }
    pos++;
    while (pos < src.length) {
      ch = src.charAt(pos);
      if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_' || ch === '$') {
        pos++;
      } else {
        break;
      }
    }
    return src.substring(start, pos);
  }

  function parsePrimary() {
    skipWhitespace();
    if (pos >= src.length) return NaN;

    var ch = src.charAt(pos);

    // Parenthesized sub-expression
    if (ch === '(') {
      pos++; // consume '('
      var val = parseAddSub();
      skipWhitespace();
      if (pos < src.length && src.charAt(pos) === ')') {
        pos++; // consume ')'
      }
      return val;
    }

    // Unary minus
    if (ch === '-') {
      pos++;
      var operand = parsePrimary();
      return -operand;
    }

    // Unary plus
    if (ch === '+') {
      pos++;
      return parsePrimary();
    }

    // Number literal
    var num = parseNumber();
    if (num !== null) return num;

    // Reset pos if parseNumber consumed nothing (it shouldn't but be safe)
    // Identifier → lookup from params
    var ident = parseIdentifier();
    if (ident !== null) {
      var paramVal = (params && params.hasOwnProperty(ident)) ? params[ident] : 0;
      return Number(paramVal);
    }

    // Unrecognized character
    return NaN;
  }

  function parseMulDiv() {
    var left = parsePrimary();
    skipWhitespace();
    while (pos < src.length && (src.charAt(pos) === '*' || src.charAt(pos) === '/')) {
      var op = src.charAt(pos);
      pos++;
      var right = parsePrimary();
      if (op === '*') {
        left = left * right;
      } else {
        if (right === 0) {
          console.warn('[tomation] Expression "' + source + '" division by zero');
          return NaN;
        }
        left = left / right;
      }
      skipWhitespace();
    }
    return left;
  }

  function parseAddSub() {
    var left = parseMulDiv();
    skipWhitespace();
    while (pos < src.length && (src.charAt(pos) === '+' || src.charAt(pos) === '-')) {
      var op = src.charAt(pos);
      pos++;
      var right = parseMulDiv();
      if (op === '+') {
        left = left + right;
      } else {
        left = left - right;
      }
      skipWhitespace();
    }
    return left;
  }

  var result = parseAddSub();

  if (result !== result || result === Infinity || result === -Infinity) {
    // NaN check: result !== result is true only for NaN
    if (result === result) {
      // It's Infinity/-Infinity (not NaN), but check if it was division by zero
      // Division by zero already warned above, but Infinity can also come from other sources
      console.warn('[tomation] Expression "' + source + '" produced non-finite result');
    } else {
      console.warn('[tomation] Expression "' + source + '" produced non-finite result');
    }
    return '';
  }

  return String(result);
}

/**
 * Resolve a runtimeTemplate descriptor to a string.
 * @param {object} descriptor - { type: "runtimeTemplate", parts: Array }
 * @param {object} params - current parameter context
 * @returns {string} concatenated result
 */
function resolveRuntimeTemplate(descriptor, params) {
  var parts = descriptor.parts;
  var result = '';
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (typeof part === 'string') {
      result += part;
    } else if (part && part.type === 'param') {
      if (params && params.hasOwnProperty(part.name)) {
        result += String(params[part.name]);
      } else {
        console.warn('[tomation] Missing param "' + part.name + '" — substituting empty string');
        result += '';
      }
    } else if (part && part.type === 'dateHelper') {
      result += String(resolveDateHelper(part));
    } else if (part && part.type === 'expression') {
      result += String(evaluateExpression(part.source, params));
    } else {
      result += String(part);
    }
  }
  return result;
}

/**
 * Resolve all {{ctx.keyName}} tokens, {{paramName}} tokens, and $random values in a string.
 * Context tokens ({{ctx.*}}) are resolved first and produce a hard error if a key is missing.
 * Missing params are substituted with "" and a warning is logged.
 *
 * @param {string} value - The string to resolve
 * @param {object} params - The params map from the task invocation
 * @param {object} [contextStore] - The per-run context store (key → value)
 * @returns {string|object} - Fully resolved string, or { __ctxError: "..." } on missing context key
 */
function resolveValue(value, params, contextStore) {
  if (value === undefined || value === null) return value;

  // Object-typed runtime values (dateHelper, runtimeTemplate)
  if (typeof value === 'object' && value !== null && value.type) {
    switch (value.type) {
      case 'dateHelper': return resolveDateHelper(value);
      case 'runtimeTemplate': return resolveRuntimeTemplate(value, params);
      default:
        console.warn('[tomation] Unknown value descriptor type "' + value.type + '"');
        return '';
    }
  }

  if (typeof value !== 'string') return value;

  // Resolve $random
  if (value === '$random') {
    return generateRandom(8);
  }

  // Resolve {{ctx.keyName}} tokens FIRST (fail on missing)
  var ctxError = null;
  var resolved = value.replace(/\{\{ctx\.([^}]+)\}\}/g, function (match, keyName) {
    if (contextStore && contextStore.hasOwnProperty(keyName)) {
      return contextStore[keyName];
    }
    ctxError = 'Context key "' + keyName + '" has not been saved yet';
    return match; // leave token for error reporting
  });

  if (ctxError) {
    return { __ctxError: ctxError }; // signal error to caller
  }

  // Resolve {{paramName}} tokens
  resolved = resolved.replace(/\{\{([^}]+)\}\}/g, function (match, paramName) {
    if (params && params.hasOwnProperty(paramName)) {
      return params[paramName];
    }
    console.warn('[tomation] Missing param "' + paramName + '" — substituting empty string');
    return '';
  });

  // Resolve any $random tokens embedded in the string
  resolved = resolved.replace(/\$random/g, function () {
    return generateRandom(8);
  });

  return resolved;
}

/**
 * Evaluate a conditional expression against the current params context.
 *
 * @param {object} condition - The condition object { param, op, value? }
 * @param {object} params - The current params map
 * @returns {boolean} - Whether the condition is met
 */
function evaluateCondition(condition, params) {
  var val = params[condition.param];
  switch (condition.op) {
    case 'truthy':    return !!val;
    case 'falsy':     return !val;
    case 'equals':    return val === condition.value;
    case 'notEquals': return val !== condition.value;
    default:          return false;
  }
}

/**
 * Flatten test steps by expanding task actions inline, resolving parameters,
 * and skipping unchecked steps. Returns an array of resolved step messages
 * ready to be sent as EXECUTE_STEP to the runtime.
 *
 * @param {Array} testSteps - The test's steps array
 * @param {object} tasksMap - The spec's tasks map (key → { params?, steps[] })
 * @param {object} pageElements - The spec's pageElements map (key → descriptor)
 * @param {Set|Array} checkedIndexes - Set or array of top-level step indexes that are checked (included)
 * @returns {Array} - Ordered array of resolved EXECUTE_STEP message objects
 */
function flattenSteps(testSteps, tasksMap, pageElements, checkedIndexes, initialParams) {
  var checked;
  if (checkedIndexes && typeof checkedIndexes.has === 'function') {
    checked = checkedIndexes;
  } else if (Array.isArray(checkedIndexes)) {
    checked = {};
    for (var ci = 0; ci < checkedIndexes.length; ci++) {
      checked[checkedIndexes[ci]] = true;
    }
    checked.has = function (idx) { return this[idx] === true; };
  } else {
    // If no checked set provided, include all steps
    checked = { has: function () { return true; } };
  }

  var params = initialParams || {};
  var result = [];

  for (var i = 0; i < testSteps.length; i++) {
    if (!checked.has(i)) {
      continue;
    }

    var step = testSteps[i];
    var expanded = expandStep(step, tasksMap, pageElements, params);
    for (var j = 0; j < expanded.length; j++) {
      result.push(expanded[j]);
    }
  }

  return result;
}

/**
 * Recursively expand a single step. If the step is a task action, expand
 * the task's steps inline with parameter resolution. Otherwise, build
 * the EXECUTE_STEP message with resolved values and element descriptors.
 *
 * @param {object} step - A single step object
 * @param {object} tasksMap - The spec's tasks map
 * @param {object} pageElements - The spec's pageElements map
 * @param {object} params - Current parameter context for template resolution
 * @returns {Array} - Array of resolved step message objects
 */
function expandStep(step, tasksMap, pageElements, params) {
  if (step.action === 'task') {
    return expandTaskStep(step, tasksMap, pageElements, params);
  }

  if (step.action === 'if') {
    if (evaluateCondition(step.condition, params)) {
      var result = [];
      for (var i = 0; i < step.then.length; i++) {
        var expanded = expandStep(step.then[i], tasksMap, pageElements, params);
        for (var j = 0; j < expanded.length; j++) {
          result.push(expanded[j]);
        }
      }
      return result;
    }
    return [];
  }

  // saveExpression steps are handled entirely in the background at execution time;
  // bypass buildStepMessage so that value resolution happens in runStepLoop
  // (where contextStore contains values saved by preceding steps).
  if (step.action === 'saveExpression') {
    return [{ action: 'saveExpression', value: step.value, key: step.key }];
  }

  return [buildStepMessage(step, pageElements, params)];
}

/**
 * Expand a task action step by looking up the task definition and
 * recursively expanding its child steps with merged parameters.
 *
 * @param {object} step - The task step { action: "task", name: string, params?: object }
 * @param {object} tasksMap - The spec's tasks map
 * @param {object} pageElements - The spec's pageElements map
 * @param {object} parentParams - Inherited params from an outer task context
 * @returns {Array} - Array of resolved step message objects
 */
function expandTaskStep(step, tasksMap, pageElements, parentParams) {
  var taskName = step.name;
  var taskDef = tasksMap[taskName];

  if (!taskDef) {
    console.warn('[tomation] Task "' + taskName + '" not found in tasks map');
    return [];
  }

  // Merge parent params with this invocation's params
  var mergedParams = {};
  var pk;
  if (parentParams) {
    var parentKeys = Object.keys(parentParams);
    for (var pi = 0; pi < parentKeys.length; pi++) {
      pk = parentKeys[pi];
      mergedParams[pk] = parentParams[pk];
    }
  }
  if (step.params) {
    var stepParamKeys = Object.keys(step.params);
    for (var si = 0; si < stepParamKeys.length; si++) {
      pk = stepParamKeys[si];
      // Resolve param values themselves (they may contain {{tokens}} from outer context)
      mergedParams[pk] = resolveValue(step.params[pk], parentParams, runState.contextStore);
    }
  }

  var result = [];
  var taskSteps = taskDef.steps;

  for (var i = 0; i < taskSteps.length; i++) {
    var childStep = taskSteps[i];
    var expanded = expandStep(childStep, tasksMap, pageElements, mergedParams);
    for (var j = 0; j < expanded.length; j++) {
      result.push(expanded[j]);
    }
  }

  return result;
}

/**
 * Build a single EXECUTE_STEP message object from a resolved step.
 * Attaches elementDescriptor and parentDescriptor when applicable.
 *
 * @param {object} step - The step object (non-task)
 * @param {object} pageElements - The spec's pageElements map
 * @param {object} params - Current params for template resolution
 * @returns {object} - The EXECUTE_STEP message object
 */
function buildStepMessage(step, pageElements, params) {
  var msg = {
    type: 'EXECUTE_STEP',
    action: step.action
  };

  // Resolve value field
  if (step.value !== undefined) {
    var resolvedVal = resolveValue(step.value, params, runState.contextStore);
    // If ctx resolution fails (key not saved yet), keep original for lazy resolution at runtime
    if (resolvedVal && typeof resolvedVal === 'object' && resolvedVal.__ctxError) {
      msg.value = step.value;
      msg.__needsCtxResolve = true;
    } else {
      msg.value = resolvedVal;
    }
  }

  // Copy over action-specific fields
  if (step.target !== undefined) {
    msg.target = step.target;
  }
  if (step.url !== undefined) {
    var resolvedUrl = resolveValue(step.url, params, runState.contextStore);
    if (resolvedUrl && typeof resolvedUrl === 'object' && resolvedUrl.__ctxError) {
      msg.url = step.url;
      msg.__needsCtxResolve = true;
    } else {
      msg.url = resolvedUrl;
    }
  }
  if (step.ms !== undefined) {
    msg.ms = step.ms;
  }
  if (step.gone !== undefined) {
    msg.gone = step.gone;
  }
  if (step.description !== undefined) {
    msg.description = resolveValue(step.description, params, runState.contextStore);
  }
  if (step.name !== undefined) {
    msg.name = step.name;
  }
  if (step.contextKey !== undefined) {
    msg.contextKey = step.contextKey;
  }
  if (step.attributeName !== undefined) {
    msg.attributeName = step.attributeName;
  }
  if (step.key !== undefined) {
    msg.key = step.key;
  }

  // Attach element descriptors for steps with a target
  if (step.target && pageElements) {
    var descriptor = pageElements[step.target];
    if (descriptor) {
      msg.elementDescriptor = descriptor;

      // If the descriptor has a childOf field, resolve the parent element descriptor
      if (descriptor.childOf) {
        var parentDescriptor = findParentDescriptor(descriptor.childOf, pageElements);
        if (parentDescriptor) {
          msg.parentDescriptor = parentDescriptor;
        }
      }
    }
  }

  return msg;
}

/**
 * Find the parent element descriptor by childOf value.
 * childOf references the `id` matcher value of another pageElement entry.
 *
 * @param {string} childOfId - The id value referenced by childOf
 * @param {object} pageElements - The spec's pageElements map
 * @returns {object|null} - The parent element descriptor or null if not found
 */
function findParentDescriptor(childOfId, pageElements) {
  var keys = Object.keys(pageElements);
  for (var i = 0; i < keys.length; i++) {
    var entry = pageElements[keys[i]];
    if (entry.where && entry.where.id === childOfId) {
      return entry;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Speed Delay Infrastructure
// ---------------------------------------------------------------------------

/** Mapping of execution speed names to delay durations in milliseconds */
var SPEED_DELAYS = {
  'FAST': 150,
  'NORMAL': 800,
  'SLOW': 2000
};

/**
 * Return a Promise that resolves after the delay mapped to the given speed.
 * Unknown speed values default to 0ms (no delay).
 *
 * @param {string} speed - One of 'FAST', 'NORMAL', 'SLOW' (or any other value for default)
 * @returns {Promise} - Resolves after the mapped delay
 */
function applySpeedDelay(speed) {
  var delay = SPEED_DELAYS.hasOwnProperty(speed) ? SPEED_DELAYS[speed] : 0;
  return new Promise(function (resolve) {
    setTimeout(resolve, delay);
  });
}

// ---------------------------------------------------------------------------
// Run State Machine (Task 15)
// ---------------------------------------------------------------------------

/** Default configuration (v1 behavior when no config is provided) */
var DEFAULT_RUN_CONFIG = {
  allowContinueOnFailure: false,
  allowRetryOnFailure: false,
  executionSpeed: 'FAST'
};

/** Runtime state for the current test run */
var runState = {
  running: false,
  paused: false,
  stopRequested: false,
  lockedTabId: null,
  currentTestName: '',
  steps: [],
  spec: null,
  stepIndex: 0,
  passCount: 0,
  failCount: 0,
  pauseResolve: null,
  awaitingAction: false,
  failedStepIndex: null,
  retryAttempt: 0,
  config: {
    allowContinueOnFailure: false,
    allowRetryOnFailure: false,
    executionSpeed: 'FAST'
  },
  tabStack: [],
  pendingTabSwitch: null,
  metaHostnames: null,
  contextStore: {}
};

// ---------------------------------------------------------------------------
// Tab Tracker — Pure Utility Functions
// ---------------------------------------------------------------------------

/**
 * Extract the lowercase hostname from a URL string.
 * Returns empty string for invalid or unparseable URLs.
 *
 * @param {string} url - A URL string to parse
 * @returns {string} The lowercase hostname, or '' if invalid
 */
function extractHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Check if a hostname matches any hostname extracted from metaUrls.
 * Comparison is case-insensitive.
 *
 * @param {string} hostname - The hostname to check (already lowercase)
 * @param {string[]} metaUrls - Array of URL strings from spec meta.urls
 * @returns {boolean} True if hostname matches at least one meta URL hostname
 */
function isMatchingHostname(hostname, metaUrls) {
  if (!hostname || !metaUrls || metaUrls.length === 0) return false;
  var target = hostname.toLowerCase();
  for (var i = 0; i < metaUrls.length; i++) {
    var metaHost = extractHostname(metaUrls[i]);
    if (metaHost && metaHost === target) return true;
  }
  return false;
}

/**
 * Reset run state to defaults.
 */
function resetRunState() {
  runState.running = false;
  runState.paused = false;
  runState.stopRequested = false;
  runState.lockedTabId = null;
  runState.currentTestName = '';
  runState.steps = [];
  runState.stepIndex = 0;
  runState.passCount = 0;
  runState.failCount = 0;
  runState.pauseResolve = null;
  runState.awaitingAction = false;
  runState.failedStepIndex = null;
  runState.retryAttempt = 0;
  runState.config = {
    allowContinueOnFailure: false,
    allowRetryOnFailure: false,
    executionSpeed: 'FAST'
  };
  runState.tabStack = [];
  runState.pendingTabSwitch = null;
  runState.metaHostnames = null;
  runState.contextStore = {};
}

// ---------------------------------------------------------------------------
// Tab Tracker — Lifecycle Functions
// ---------------------------------------------------------------------------

// Store references to listener functions so we can remove them
var _tabCreatedListener = null;
var _tabRemovedListener = null;
var _tabActivatedListener = null;

/**
 * Initialize the tab tracker for a new test run.
 * Registers chrome.tabs.onCreated, onRemoved, and onActivated listeners,
 * initializes tabStack with the current locked tab,
 * and computes metaHostnames from spec meta.urls.
 */
function initTabTracker() {
  // Initialize tab stack with the initial locked tab
  runState.tabStack = [runState.lockedTabId];

  // Compute metaHostnames set from spec meta.urls
  var urls = (runState.spec && runState.spec.meta && runState.spec.meta.urls) || [];
  var hostnameSet = {};
  for (var i = 0; i < urls.length; i++) {
    var h = extractHostname(urls[i]);
    if (h) hostnameSet[h] = true;
  }
  runState.metaHostnames = hostnameSet;

  // Register listeners (store references for removal)
  _tabCreatedListener = handleTabCreated;
  _tabRemovedListener = handleTabRemoved;
  _tabActivatedListener = handleTabActivated;
  if (api.tabs.onCreated) {
    api.tabs.onCreated.addListener(_tabCreatedListener);
  }
  if (api.tabs.onRemoved) {
    api.tabs.onRemoved.addListener(_tabRemovedListener);
  }
  if (api.tabs.onActivated) {
    api.tabs.onActivated.addListener(_tabActivatedListener);
  }
}

/**
 * Tear down the tab tracker when a test run ends.
 * Removes event listeners and clears tab tracking state.
 */
function teardownTabTracker() {
  if (_tabCreatedListener && api.tabs.onCreated) {
    api.tabs.onCreated.removeListener(_tabCreatedListener);
    _tabCreatedListener = null;
  }
  if (_tabRemovedListener && api.tabs.onRemoved) {
    api.tabs.onRemoved.removeListener(_tabRemovedListener);
    _tabRemovedListener = null;
  }
  if (_tabActivatedListener && api.tabs.onActivated) {
    api.tabs.onActivated.removeListener(_tabActivatedListener);
    _tabActivatedListener = null;
  }
  runState.tabStack = [];
  runState.pendingTabSwitch = null;
  runState.metaHostnames = null;
}

// ---------------------------------------------------------------------------
// Tab Tracker — Event Handlers
// ---------------------------------------------------------------------------

/**
 * Handle a newly created tab during a test run.
 * If the tab's hostname matches any hostname in meta.urls and no pending
 * switch is already active, sets up a pendingTabSwitch state and waits for
 * RUNTIME_READY from that tab (with a 10-second timeout).
 *
 * @param {object} tab - The chrome.tabs.Tab object for the new tab
 */
function handleTabCreated(tab) {
  // Only track tabs while a run is active
  if (!runState.running) return;

  // If a pending switch is already active, ignore this tab (first match wins)
  if (runState.pendingTabSwitch) return;

  // Check if the new tab was opened by the locked tab (e.g., target="_blank" click)
  // OR if we can already identify it as a matching hostname
  var hostname = extractHostname(tab.url || tab.pendingUrl || '');
  var isFromLockedTab = tab.openerTabId === runState.lockedTabId;
  var isMatchingUrl = hostname && runState.metaHostnames && runState.metaHostnames[hostname];

  // Only set up pending switch if:
  // 1. The tab was opened by the locked tab (most common case: link click), OR
  // 2. The URL is already known and matches meta.urls
  if (!isFromLockedTab && !isMatchingUrl) {
    return; // Unrelated tab — no state change
  }

  // Set pending tab switch state — step loop will await this promise
  var tabId = tab.id;
  var timeoutId = null;
  var resolveSwitch = null;

  var switchPromise = new Promise(function (resolve) {
    resolveSwitch = resolve;
  });

  timeoutId = setTimeout(function () {
    // Timeout: clear pending switch and resume on current tab
    console.warn('[Tab_Tracker] Timeout waiting for RUNTIME_READY from tab ' + tabId);
    runState.pendingTabSwitch = null;
    resolveSwitch();
  }, 10000);

  runState.pendingTabSwitch = {
    tabId: tabId,
    resolve: resolveSwitch,
    timeoutId: timeoutId,
    promise: switchPromise
  };
}

/**
 * Handle a tab being removed during a test run.
 * If the closed tab is the locked tab, performs fallback logic.
 *
 * @param {number} tabId - The ID of the removed tab
 */
function handleTabRemoved(tabId) {
  // Only handle during an active run
  if (!runState.running) return;

  // If the removed tab is not the locked tab, ignore
  if (tabId !== runState.lockedTabId) return;

  // Fallback logic — implemented in task 4
  fallbackToPreviousTab();
}

/**
 * Handle user switching to a different tab during a test run.
 * Re-activates the locked tab to prevent user from interfering.
 *
 * @param {object} activeInfo - { tabId, windowId }
 */
function handleTabActivated(activeInfo) {
  if (!runState.running) return;
  if (!runState.lockedTabId) return;

  // If the user activated a tab that isn't the locked tab, switch back
  if (activeInfo.tabId !== runState.lockedTabId) {
    // Don't fight if a pending tab switch is happening (we're about to switch anyway)
    if (runState.pendingTabSwitch) return;

    api.tabs.update(runState.lockedTabId, { active: true }).catch(function () {
      // Ignore errors (tab might have been closed)
    });
  }
}

/**
 * Switch execution to a new tab.
 * Pushes the current lockedTabId onto the tab stack, locks the new tab,
 * resolves the pendingTabSwitch promise so the step loop can resume,
 * and clears the timeout.
 *
 * @param {number} tabId - The new tab to switch to
 * @returns {Promise}
 */
function switchToTab(tabId) {
  // Push current locked tab onto stack
  runState.tabStack.push(runState.lockedTabId);

  // Clear the timeout since the switch succeeded
  if (runState.pendingTabSwitch && runState.pendingTabSwitch.timeoutId) {
    clearTimeout(runState.pendingTabSwitch.timeoutId);
  }

  // Capture the resolve function before clearing state
  var resolve = runState.pendingTabSwitch && runState.pendingTabSwitch.resolve;

  // Clear pending state
  runState.pendingTabSwitch = null;

  // Lock the new tab and resolve the wait promise
  return lockTab(tabId).then(function () {
    if (resolve) resolve();
  });
}

/**
 * Fall back to the previous tab when the locked tab is closed.
 * Pops from the tab stack. If the stack is non-empty, locks the new
 * top tab and resumes execution. If the stack is empty, fails the run
 * with a descriptive error.
 */
function fallbackToPreviousTab() {
  // The stack contains previous tabs; the locked tab is NOT in the stack
  if (runState.tabStack.length > 0) {
    var previousTab = runState.tabStack.pop();
    lockTab(previousTab);
  } else {
    // No fallback available — increment fail count and finish with failure
    runState.failCount++;
    console.warn('Active tab closed and no fallback tab available');
    finishRun();
  }
}

/**
 * Lock the active tab for the duration of the test run.
 * Stores the tabId and calls api.tabs.update to keep it active.
 *
 * @param {number} tabId - The tab to lock
 * @returns {Promise}
 */
function lockTab(tabId) {
  runState.lockedTabId = tabId;
  return api.tabs.update(tabId, { active: true });
}

/**
 * Unlock the active tab after a test run ends.
 * Clears the lockedTabId from run state.
 */
function unlockTab() {
  runState.lockedTabId = null;
}

/**
 * Send a single step to the runtime content script and return its response.
 *
 * @param {object} step - The resolved EXECUTE_STEP message
 * @param {number} stepIndex - The current step index
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function sendStepToRuntime(step, stepIndex) {
  var msg = {};
  var keys = Object.keys(step);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] === '__needsCtxResolve') continue;
    msg[keys[i]] = step[keys[i]];
  }
  msg.type = 'EXECUTE_STEP';
  msg.stepIndex = stepIndex;

  // Lazily resolve {{ctx.X}} placeholders that couldn't be resolved during flattening
  if (step.__needsCtxResolve) {
    if (msg.value && typeof msg.value === 'string' && msg.value.indexOf('{{ctx.') !== -1) {
      var resolved = resolveValue(msg.value, {}, runState.contextStore);
      if (resolved && typeof resolved === 'object' && resolved.__ctxError) {
        // Still unresolved — report as step failure
        emitLog(stepIndex, step, false, resolved.__ctxError);
        runState.failCount++;
        runState.stepIndex++;
        return Promise.resolve({ ok: false, error: resolved.__ctxError });
      }
      msg.value = resolved;
    }
    if (msg.url && typeof msg.url === 'string' && msg.url.indexOf('{{ctx.') !== -1) {
      var resolvedUrl = resolveValue(msg.url, {}, runState.contextStore);
      if (resolvedUrl && typeof resolvedUrl === 'object' && resolvedUrl.__ctxError) {
        emitLog(stepIndex, step, false, resolvedUrl.__ctxError);
        runState.failCount++;
        runState.stepIndex++;
        return Promise.resolve({ ok: false, error: resolvedUrl.__ctxError });
      }
      msg.url = resolvedUrl;
    }
  }

  return api.tabs.sendMessage(runState.lockedTabId, msg).catch(function (error) {
    if (error && error.message && error.message.indexOf('Could not establish connection') !== -1) {
      return { ok: false, error: 'Content script not available on this tab. Reload the page and try again.' };
    }
    throw error;
  });
}

/**
 * Emit a LOG message to the panel after a step completes.
 *
 * @param {number} stepIndex - The index of the completed step
 * @param {object} step - The step object (with action, target, value)
 * @param {boolean} ok - Whether the step passed
 * @param {string} [error] - Error message if the step failed
 */
function emitLog(stepIndex, step, ok, error) {
  var logMsg = {
    type: 'LOG',
    stepIndex: stepIndex,
    action: step.action,
    target: step.target || null,
    value: step.value || null,
    ok: ok
  };
  // Include action-specific fields
  if (step.url) logMsg.url = step.url;
  if (step.ms != null) logMsg.ms = step.ms;
  if (step.description) logMsg.description = step.description;
  if (step.name) logMsg.name = step.name;
  if (step.params) logMsg.params = step.params;
  if (step.gone != null) logMsg.gone = step.gone;
  if (error) {
    logMsg.error = error;
  }
  safeSendMessage(logMsg);
}

/**
 * Emit a final summary message to the panel.
 *
 * @param {string} type - 'RUN_COMPLETE' or 'RUN_STOPPED'
 * @param {number} total - Total steps attempted
 * @param {number} passed - Steps that passed
 * @param {number} failed - Steps that failed
 */
function emitSummary(type, total, passed, failed) {
  safeSendMessage({
    type: type,
    total: total,
    passed: passed,
    failed: failed
  });
}

/**
 * Start a test run. Flattens steps, locks the tab, and begins the step loop.
 *
 * @param {number} tabId - The active tab id to lock
 * @param {object} test - The test object from the spec (has .name and .steps)
 * @param {object} spec - The full spec object (has .tasks, .pageElements)
 * @param {Array|Set} checkedSteps - The checked step indexes
 * @returns {Promise}
 */
function startRun(tabId, test, spec, checkedSteps, config) {
  resetRunState();

  if (config) {
    runState.config = config;
  }

  var resolvedSteps = flattenSteps(
    test.steps,
    spec.tasks || {},
    spec.pageElements || {},
    checkedSteps
  );

  runState.running = true;
  runState.contextStore = {};
  runState.currentTestName = test.name || '';
  runState.steps = resolvedSteps;
  runState.spec = spec;
  runState.stepIndex = 0;
  runState.passCount = 0;
  runState.failCount = 0;

  return lockTab(tabId).then(function () {
    initTabTracker();
    return runStepLoop();
  });
}

/**
 * Execute steps sequentially. Halts on failure or stop request.
 * Checks pause state before each step. Inserts a speed delay before
 * dispatching each step to the runtime. On failure, enters
 * awaiting-action state if retry/skip is enabled; otherwise halts immediately.
 * Emits LOG after each step and a summary on completion.
 *
 * @returns {Promise}
 */
function runStepLoop() {
  if (runState.stepIndex >= runState.steps.length || runState.stopRequested) {
    return finishRun();
  }

  // If awaiting user action (retry/skip), do not advance
  if (runState.awaitingAction) {
    return Promise.resolve();
  }

  // If paused, wait for continueRun() to resolve the pause promise
  var waitForPause;
  if (runState.paused) {
    waitForPause = new Promise(function (resolve) {
      runState.pauseResolve = resolve;
    });
  } else {
    waitForPause = Promise.resolve();
  }

  return waitForPause.then(function () {
    // After unpausing, check if stop was requested while paused
    if (runState.stopRequested) {
      return finishRun();
    }

    // If a tab switch is pending, wait for it to complete before dispatching
    var waitForTabSwitch;
    if (runState.pendingTabSwitch && runState.pendingTabSwitch.promise) {
      waitForTabSwitch = runState.pendingTabSwitch.promise;
    } else {
      waitForTabSwitch = Promise.resolve();
    }

    return waitForTabSwitch.then(function () {
    // Check stop again after tab switch wait
    if (runState.stopRequested) {
      return finishRun();
    }

    var currentIndex = runState.stepIndex;
    var step = runState.steps[currentIndex];

    // Handle navigate steps in the background (don't send to runtime)
    if (step.action === 'navigate') {
      safeSendMessage({ type: 'STEP_STARTING', stepIndex: currentIndex, action: 'navigate', url: step.url });
      return handleNavigateStep(step, currentIndex);
    }

    // Handle wait steps in the background (don't send to runtime)
    if (step.action === 'wait') {
      safeSendMessage({ type: 'STEP_STARTING', stepIndex: currentIndex, action: 'wait', ms: step.ms });
      return handleWaitStep(step, currentIndex);
    }

    // Handle manual steps in the background (don't send to runtime)
    if (step.action === 'manual') {
      safeSendMessage({ type: 'STEP_STARTING', stepIndex: currentIndex, action: 'manual', description: step.description });
      return handleManualStep(step, currentIndex);
    }

    // Handle upload steps in the background — fetch file, then send to runtime with data
    if (step.action === 'upload') {
      safeSendMessage({ type: 'STEP_STARTING', stepIndex: currentIndex, action: 'upload', target: step.target, value: step.value });
      return handleUploadStep(step, currentIndex);
    }

    // Handle saveExpression steps entirely in the background (no message sent to runtime)
    if (step.action === 'saveExpression') {
      var resolvedValue = resolveValue(step.value, {}, runState.contextStore);
      if (resolvedValue !== null && resolvedValue !== undefined) {
        if (typeof resolvedValue === 'object' && resolvedValue.__ctxError) {
          // Context key reference error within the expression
          emitLog(currentIndex, step, false, resolvedValue.__ctxError);
          runState.failCount++;
          // Check if retry/skip is enabled
          if (runState.config.allowRetryOnFailure || runState.config.allowContinueOnFailure) {
            runState.awaitingAction = true;
            runState.failedStepIndex = currentIndex;
            safeSendMessage({
              type: 'STEP_FAILED_AWAITING_ACTION',
              stepIndex: currentIndex,
              action: step.action,
              target: null,
              value: step.value || null,
              error: resolvedValue.__ctxError
            });
            return;
          }
          // Halt run on failure
          teardownTabTracker();
          unlockTab();
          runState.running = false;
          emitSummary('RUN_COMPLETE', currentIndex + 1, runState.passCount, runState.failCount);
          return;
        }
        runState.contextStore[step.key] = String(resolvedValue);
      } else {
        runState.contextStore[step.key] = '';
      }
      emitLog(currentIndex, step, true);
      runState.passCount++;
      runState.stepIndex++;
      return runStepLoop();
    }

    // Apply speed delay before dispatching step to runtime
    return applySpeedDelay(runState.config.executionSpeed).then(function () {
      // Check stop again after the delay
      if (runState.stopRequested) {
        return finishRun();
      }

      // Emit "step starting" to give the panel immediate feedback
      var startMsg = {
        type: 'STEP_STARTING',
        stepIndex: currentIndex,
        action: step.action
      };
      if (step.target) startMsg.target = step.target;
      if (step.value) startMsg.value = step.value;
      if (step.url) startMsg.url = step.url;
      if (step.ms != null) startMsg.ms = step.ms;
      if (step.description) startMsg.description = step.description;
      if (step.name) startMsg.name = step.name;
      if (step.params) startMsg.params = step.params;
      if (step.gone != null) startMsg.gone = step.gone;
      safeSendMessage(startMsg);

      return sendStepToRuntime(step, currentIndex).then(function (result) {
        if (runState.stopRequested) {
          return finishRun();
        }

        var ok = result && result.ok;
        var error = result && result.error;

        if (ok) {
          runState.passCount++;

          // Store savedValue in context store for DOM save actions
          if (step.action === 'saveText' || step.action === 'saveAttribute' || step.action === 'saveValue') {
            if (result.savedValue !== undefined) {
              runState.contextStore[step.contextKey] = result.savedValue;
            }
          }
        } else {
          runState.failCount++;
        }

        // Emit LOG for this step
        emitLog(currentIndex, step, !!ok, error || undefined);

        if (!ok) {
          // Check if retry or skip is enabled
          var canRetry = runState.config.allowRetryOnFailure;
          var canSkip = runState.config.allowContinueOnFailure;

          if (canRetry || canSkip) {
            // Enter awaiting-action state — keep run alive, tab locked, pause loop
            runState.awaitingAction = true;
            runState.failedStepIndex = currentIndex;

            // Emit STEP_FAILED_AWAITING_ACTION to panel
            safeSendMessage({
              type: 'STEP_FAILED_AWAITING_ACTION',
              stepIndex: currentIndex,
              action: step.action,
              target: step.target || null,
              value: step.value || null,
              error: error || 'Step failed'
            });

            // Do NOT halt or unlock tab — just pause the loop
            return;
          }

          // v1 behavior: halt run on failure immediately
          teardownTabTracker();
          unlockTab();
          runState.running = false;
          emitSummary('RUN_COMPLETE', currentIndex + 1, runState.passCount, runState.failCount);
          return;
        }

        // Advance to next step
        runState.stepIndex++;
        // Yield to macrotask queue to allow chrome.tabs.onCreated to fire
        // before the next step is dispatched (handles target="_blank" tab opens)
        return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
          return runStepLoop();
        });
      });
    });
    }); // end waitForTabSwitch.then
  });
}

/**
 * Handle a navigate step: update the tab URL, then wait for RUNTIME_READY
 * from the content script on the new page. Times out after 10 seconds.
 *
 * @param {object} step - The navigate step (has step.url)
 * @param {number} currentIndex - The current step index
 * @returns {Promise}
 */
function handleNavigateStep(step, currentIndex) {
  // Resolve relative URLs against the current page URL (not the extension URL)
  var navigateUrl = step.url;

  function doNavigate(resolvedUrl) {
    return api.tabs.update(runState.lockedTabId, { url: resolvedUrl }).then(function () {
      return new Promise(function (resolve, reject) {
        var timeoutId = null;
        var listener = null;

        listener = function (message, sender) {
          // Only accept RUNTIME_READY from the locked tab
          var fromTab = sender && sender.tab && sender.tab.id === runState.lockedTabId;
          if (message && message.type === 'RUNTIME_READY' && fromTab) {
            clearTimeout(timeoutId);
            api.runtime.onMessage.removeListener(listener);
            resolve();
          }
        };

        api.runtime.onMessage.addListener(listener);

        timeoutId = setTimeout(function () {
          api.runtime.onMessage.removeListener(listener);
          reject(new Error('Navigation timeout: RUNTIME_READY not received within 10 seconds'));
        }, 10000);
      });
    }).then(function () {
      // Navigation succeeded
      runState.passCount++;
      emitLog(currentIndex, step, true, undefined);
      runState.stepIndex++;
      return runStepLoop();
    }).catch(function (err) {
      // Navigation timed out or failed
      runState.failCount++;
      emitLog(currentIndex, step, false, err.message || 'Navigation failed');
      teardownTabTracker();
      unlockTab();
      runState.running = false;
      emitSummary('RUN_COMPLETE', currentIndex + 1, runState.passCount, runState.failCount);
    });
  }

  // If URL is already absolute (starts with http/https), use directly
  if (/^https?:\/\//.test(navigateUrl)) {
    return doNavigate(navigateUrl);
  }

  // Otherwise resolve relative to the current tab's URL
  return api.tabs.get(runState.lockedTabId).then(function (tab) {
    var baseUrl = tab.url || '';
    try {
      var resolved = new URL(navigateUrl, baseUrl).href;
      return doNavigate(resolved);
    } catch (e) {
      // Fallback: use as-is if URL parsing fails
      return doNavigate(navigateUrl);
    }
  });
}

/**
 * Handle a wait step: pause execution for the specified milliseconds,
 * then emit LOG and advance to the next step.
 *
 * @param {object} step - The wait step (has step.ms)
 * @param {number} currentIndex - The current step index
 * @returns {Promise}
 */
function handleWaitStep(step, currentIndex) {
  return new Promise(function (resolve) {
    setTimeout(resolve, step.ms || 0);
  }).then(function () {
    if (runState.stopRequested) {
      return finishRun();
    }
    runState.passCount++;
    emitLog(currentIndex, step, true, undefined);
    runState.stepIndex++;
    return runStepLoop();
  });
}

/**
 * Handle a manual step: emit MANUAL_PAUSE to the panel with the step's description,
 * then pause execution until the panel sends CONTINUE. Once continued, emit LOG
 * and advance to the next step.
 *
 * @param {object} step - The manual step (has step.description)
 * @param {number} currentIndex - The current step index
 * @returns {Promise}
 */
function handleManualStep(step, currentIndex) {
  // Emit MANUAL_PAUSE to the panel
  safeSendMessage({
    type: 'MANUAL_PAUSE',
    description: step.description || ''
  });

  // Pause execution using the same mechanism as pauseRun
  runState.paused = true;
  return new Promise(function (resolve) {
    runState.pauseResolve = resolve;
  }).then(function () {
    if (runState.stopRequested) {
      return finishRun();
    }
    runState.passCount++;
    emitLog(currentIndex, step, true, undefined);
    runState.stepIndex++;
    return runStepLoop();
  });
}

/**
 * Handle an upload step: fetch the file from testFiles URL, then send to runtime
 * with the file data as a base64 string. The runtime creates a real File object.
 *
 * @param {object} step - The upload step { action: "upload", target: "...", value: "filename.pdf" }
 * @param {number} currentIndex - The current step index
 * @returns {Promise}
 */
function handleUploadStep(step, currentIndex) {
  var fileName = step.value || '';
  var testFilesBase = runState.spec && runState.spec.meta && runState.spec.meta.testFiles;

  // If no testFiles URL configured, fall back to sending just the filename (stub file)
  if (!testFilesBase) {
    // Send to runtime without file data — runtime will create an empty stub
    return sendUploadToRuntime(step, currentIndex, null, null);
  }

  // Build full URL and fetch the file
  var fileUrl = testFilesBase.replace(/\/$/, '') + '/' + fileName;

  return fetch(fileUrl).then(function (response) {
    if (!response.ok) {
      throw new Error('Failed to fetch test file: ' + response.status + ' ' + fileUrl);
    }
    return response.blob();
  }).then(function (blob) {
    // Convert blob to base64 for message passing
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve({ data: reader.result, type: blob.type });
      };
      reader.onerror = function () {
        reject(new Error('Failed to read file data'));
      };
      reader.readAsDataURL(blob);
    });
  }).then(function (fileInfo) {
    return sendUploadToRuntime(step, currentIndex, fileInfo.data, fileInfo.type);
  }).catch(function (err) {
    runState.failCount++;
    emitLog(currentIndex, step, false, err.message || 'Upload failed');
    unlockTab();
    runState.running = false;
    emitSummary('RUN_COMPLETE', currentIndex + 1, runState.passCount, runState.failCount);
  });
}

/**
 * Send the upload step to the runtime with optional file data.
 */
function sendUploadToRuntime(step, currentIndex, fileDataUrl, mimeType) {
  var msg = {
    type: 'EXECUTE_STEP',
    action: 'upload',
    stepIndex: currentIndex,
    target: step.target,
    value: step.value,
  };
  if (fileDataUrl) {
    msg.fileDataUrl = fileDataUrl;
    msg.mimeType = mimeType;
  }

  return api.tabs.sendMessage(runState.lockedTabId, msg).catch(function (error) {
    if (error && error.message && error.message.indexOf('Could not establish connection') !== -1) {
      return { ok: false, error: 'Content script not available on this tab. Reload the page and try again.' };
    }
    throw error;
  }).then(function (result) {
    if (runState.stopRequested) return finishRun();

    var ok = result && result.ok;
    var error = result && result.error;

    if (ok) { runState.passCount++; }
    else { runState.failCount++; }

    emitLog(currentIndex, step, !!ok, error || undefined);

    if (!ok) {
      unlockTab();
      runState.running = false;
      emitSummary('RUN_COMPLETE', currentIndex + 1, runState.passCount, runState.failCount);
      return;
    }

    runState.stepIndex++;
    return runStepLoop();
  });
}

/**
 * Handle a RETRY_STEP message from the panel. Re-sends the failed step
 * to the runtime. On success, resumes the step loop from the next step.
 * On failure, halts the run and unlocks the tab.
 *
 * @param {object} msg - { type: 'RETRY_STEP', stepIndex: number }
 */
function handleRetryStep(msg) {
  if (!runState.awaitingAction) {
    console.warn('[tomation] RETRY_STEP received but not awaiting action — ignoring');
    return;
  }

  if (msg.stepIndex !== runState.failedStepIndex) {
    console.warn('[tomation] RETRY_STEP stepIndex mismatch — ignoring');
    return;
  }

  runState.retryAttempt++;

  var currentIndex = runState.failedStepIndex;
  var step = runState.steps[currentIndex];

  sendStepToRuntime(step, currentIndex).then(function (result) {
    var ok = result && result.ok;
    var error = result && result.error;

    if (ok) {
      runState.awaitingAction = false;
      runState.failedStepIndex = null;
      runState.passCount++;
      runState.stepIndex++;

      // Emit LOG with retryAttempt field
      var logMsg = {
        type: 'LOG',
        stepIndex: currentIndex,
        action: step.action,
        target: step.target || null,
        value: step.value || null,
        ok: true,
        retryAttempt: runState.retryAttempt
      };
      safeSendMessage(logMsg);

      // Resume step loop
      runStepLoop();
    } else {
      // Halt run on retry failure
      runState.awaitingAction = false;
      runState.failedStepIndex = null;
      runState.running = false;
      unlockTab();

      // Emit failure LOG
      var failLogMsg = {
        type: 'LOG',
        stepIndex: currentIndex,
        action: step.action,
        target: step.target || null,
        value: step.value || null,
        ok: false,
        error: error || 'Retry failed',
        retryAttempt: runState.retryAttempt
      };
      safeSendMessage(failLogMsg);

      emitSummary('RUN_COMPLETE', currentIndex + 1, runState.passCount, runState.failCount);
    }
  });
}

/**
 * Handle a SKIP_STEP message from the panel.
 * Advances past the failed step without modifying passCount.
 * If the failed step was the last step, finishes the run; otherwise resumes the step loop.
 *
 * @param {object} msg - The SKIP_STEP message payload (must include stepIndex)
 */
function handleSkipStep(msg) {
  if (!runState.awaitingAction) {
    console.warn('[tomation] SKIP_STEP received but not awaiting action — ignoring');
    return;
  }

  if (msg.stepIndex !== runState.failedStepIndex) {
    console.warn('[tomation] SKIP_STEP stepIndex mismatch — ignoring');
    return;
  }

  runState.awaitingAction = false;
  runState.failedStepIndex = null;
  runState.stepIndex = msg.stepIndex + 1;

  if (runState.stepIndex >= runState.steps.length) {
    finishRun();
  } else {
    runStepLoop();
  }
}

/**
 * Finish the run (either all steps done or stopped).
 * Unlocks tab and emits appropriate summary.
 */
function finishRun() {
  teardownTabTracker();
  unlockTab();
  runState.running = false;
  runState.contextStore = {};

  var total = runState.stepIndex;
  var passed = runState.passCount;
  var failed = runState.failCount;

  if (runState.stopRequested) {
    runState.stopRequested = false;
    emitSummary('RUN_STOPPED', total, passed, failed);
  } else {
    emitSummary('RUN_COMPLETE', total, passed, failed);
  }
}

/**
 * Pause the current test run. Creates a promise that the step loop
 * will await before each step, blocking dispatch until continueRun() is called.
 *
 * @returns {Promise|undefined} - The pause promise (resolves when continued), or undefined if not running
 */
function pauseRun() {
  if (!runState.running) return undefined;
  runState.paused = true;
  var promise = new Promise(function (resolve) {
    runState.pauseResolve = resolve;
  });
  return promise;
}

/**
 * Continue after a pause. Resolves the pause promise to unblock the step loop
 * and resets the paused state.
 */
function continueRun() {
  if (runState.pauseResolve) {
    runState.pauseResolve();
    runState.pauseResolve = null;
  }
  runState.paused = false;
}

/**
 * Request the run to stop. The step loop will check this flag
 * and halt at the next iteration. If currently paused, also unblocks
 * the step loop so it can exit.
 */
function stopRun() {
  if (runState.running) {
    runState.stopRequested = true;
    if (runState.paused) {
      continueRun();
    }
  }
}

// ---------------------------------------------------------------------------
// Message Router (Task 15.5)
// ---------------------------------------------------------------------------

/**
 * Handle messages from the panel (RUN_TEST, PAUSE, CONTINUE, STOP)
 * and from content scripts (STEP_RESULT, RUNTIME_READY).
 *
 * @param {object} message - The incoming message
 * @param {object} sender - The message sender info
 * @param {function} sendResponse - Callback to send a response (unused for async)
 */
function handleMessage(message, sender, sendResponse) {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'RUN_TEST':
      handleRunTest(message);
      break;
    case 'RUN_AUTOMATION':
      handleRunAutomation(message);
      break;
    case 'PAUSE':
      pauseRun();
      break;
    case 'CONTINUE':
      continueRun();
      break;
    case 'STOP':
      stopRun();
      break;
    case 'RETRY_STEP':
      handleRetryStep(message);
      break;
    case 'SKIP_STEP':
      handleSkipStep(message);
      break;
    case 'RUNTIME_READY':
      // If a tab switch is pending and the sender matches the expected tab, complete the switch
      if (runState.pendingTabSwitch && sender && sender.tab && sender.tab.id === runState.pendingTabSwitch.tabId) {
        switchToTab(sender.tab.id);
      }
      // If no pending switch but RUNTIME_READY comes from a different tab with matching hostname,
      // this handles the case where onCreated fired before the URL was known
      else if (runState.running && !runState.pendingTabSwitch && sender && sender.tab && sender.tab.id !== runState.lockedTabId) {
        var readyHostname = extractHostname(sender.tab.url || '');
        if (readyHostname && runState.metaHostnames && runState.metaHostnames[readyHostname]) {
          // Matching tab sent RUNTIME_READY — set up and immediately resolve a tab switch
          switchToTab(sender.tab.id);
        }
      }
      break;
    // STEP_RESULT is handled inline by sendStepToRuntime via its own listener.
    // RUNTIME_READY for navigation is handled inline by handleNavigateStep.
    // The case above only handles tab-switch resolution for newly created tabs.
  }
}

/**
 * Handle the RUN_TEST message from the panel.
 * Queries the active tab, looks up the project by hostname, finds the test
 * by index, and starts the run.
 *
 * @param {object} message - { type: 'RUN_TEST', testIndex: number, checkedSteps: Array }
 */
function handleRunTest(message) {
  var testIndex = message.testIndex;
  var checkedSteps = message.checkedSteps;
  var config = message.config || {
    allowContinueOnFailure: false,
    allowRetryOnFailure: false,
    executionSpeed: 'FAST'
  };

  api.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    if (!tabs || tabs.length === 0) return;

    var tab = tabs[0];
    var url = new URL(tab.url);
    var hostname = url.hostname;

    return getProject(hostname).then(function (project) {
      if (!project || !project.specs || project.specs.length === 0) return;

      // Find the test across all specs in the project
      var foundTest = null;
      var foundSpec = null;
      var globalIndex = 0;

      for (var s = 0; s < project.specs.length; s++) {
        var spec = project.specs[s].spec;
        if (!spec || !spec.tests) continue;

        for (var t = 0; t < spec.tests.length; t++) {
          if (globalIndex === testIndex) {
            foundTest = spec.tests[t];
            foundSpec = spec;
            break;
          }
          globalIndex++;
        }
        if (foundTest) break;
      }

      if (foundTest && foundSpec) {
        startRun(tab.id, foundTest, foundSpec, checkedSteps, config);
      }
    });
  });
}

/**
 * Handle the RUN_AUTOMATION message from the panel.
 * Queries the active tab, looks up the project by hostname, finds the automation
 * by index, and starts the automation run with user-provided params.
 *
 * @param {object} message - { type: 'RUN_AUTOMATION', automationIndex: number, params: object, checkedSteps: Array, config: object }
 */
function handleRunAutomation(message) {
  var automationIndex = message.automationIndex;
  var params = message.params || {};
  var checkedSteps = message.checkedSteps;
  var config = message.config || {
    allowContinueOnFailure: false,
    allowRetryOnFailure: false,
    executionSpeed: 'FAST'
  };

  api.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    if (!tabs || tabs.length === 0) return;

    var tab = tabs[0];
    var url = new URL(tab.url);
    var hostname = url.hostname;

    return getProject(hostname).then(function (project) {
      if (!project || !project.specs || project.specs.length === 0) return;

      // Find the automation across all specs in the project
      var foundAutomation = null;
      var foundSpec = null;
      var globalIndex = 0;

      for (var s = 0; s < project.specs.length; s++) {
        var spec = project.specs[s].spec;
        if (!spec || !spec.automations) continue;

        for (var a = 0; a < spec.automations.length; a++) {
          if (globalIndex === automationIndex) {
            foundAutomation = spec.automations[a];
            foundSpec = spec;
            break;
          }
          globalIndex++;
        }
        if (foundAutomation) break;
      }

      if (foundAutomation && foundSpec) {
        startAutomationRun(tab.id, foundAutomation, foundSpec, checkedSteps, config, params);
      }
    });
  });
}

/**
 * Start an Automation run. Identical to startRun but seeds the context store
 * with user-provided params so that {{paramName}} placeholders resolve correctly
 * during step flattening.
 *
 * @param {number} tabId - The tab to run in
 * @param {object} automation - The automation object { name, params, steps }
 * @param {object} spec - The full spec object
 * @param {Array} checkedSteps - Checked step indices
 * @param {object} config - Run configuration
 * @param {object} params - User-provided param values (e.g., { email: "...", count: 5 })
 * @returns {Promise}
 */
function startAutomationRun(tabId, automation, spec, checkedSteps, config, params) {
  resetRunState();

  if (config) {
    runState.config = config;
  }

  // Seed context store with user-provided params so {{paramName}} resolves at runtime
  runState.contextStore = {};
  var paramKeys = Object.keys(params);
  for (var i = 0; i < paramKeys.length; i++) {
    runState.contextStore[paramKeys[i]] = String(params[paramKeys[i]]);
  }

  var resolvedSteps = flattenSteps(
    automation.steps,
    spec.tasks || {},
    spec.pageElements || {},
    checkedSteps,
    params
  );

  runState.running = true;
  runState.currentTestName = automation.name || '';
  runState.steps = resolvedSteps;
  runState.spec = spec;
  runState.stepIndex = 0;
  runState.passCount = 0;
  runState.failCount = 0;

  return lockTab(tabId).then(function () {
    initTabTracker();
    return runStepLoop();
  });
}

/**
 * Send STATE_SYNC to a newly connected panel port.
 *
 * @param {object} port - The connected port
 */
function handlePanelConnect(port) {
  if (port.name === 'panel') {
    port.postMessage({
      type: 'STATE_SYNC',
      running: runState.running,
      paused: runState.paused,
      lockedTabId: runState.lockedTabId
    });
  }
}

/**
 * Initialize the message router listeners.
 * Called once when the background script loads.
 */
function initMessageRouter() {
  api.runtime.onMessage.addListener(handleMessage);
  api.runtime.onConnect.addListener(handlePanelConnect);
}

// Initialize the router (only in extension context, not in Node test context)
if (typeof module === 'undefined' || !module.exports) {
  initMessageRouter();
}

// Export for testing in Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateRandom: generateRandom,
    resolveValue: resolveValue,
    evaluateCondition: evaluateCondition,
    flattenSteps: flattenSteps,
    expandStep: expandStep,
    expandTaskStep: expandTaskStep,
    buildStepMessage: buildStepMessage,
    findParentDescriptor: findParentDescriptor,
    safeSendMessage: safeSendMessage,
    SPEED_DELAYS: SPEED_DELAYS,
    applySpeedDelay: applySpeedDelay,
    DEFAULT_RUN_CONFIG: DEFAULT_RUN_CONFIG,
    runState: runState,
    resetRunState: resetRunState,
    extractHostname: extractHostname,
    isMatchingHostname: isMatchingHostname,
    lockTab: lockTab,
    unlockTab: unlockTab,
    sendStepToRuntime: sendStepToRuntime,
    emitLog: emitLog,
    emitSummary: emitSummary,
    startRun: startRun,
    startAutomationRun: startAutomationRun,
    runStepLoop: runStepLoop,
    finishRun: finishRun,
    stopRun: stopRun,
    pauseRun: pauseRun,
    continueRun: continueRun,
    handleNavigateStep: handleNavigateStep,
    handleWaitStep: handleWaitStep,
    handleManualStep: handleManualStep,
    handleRetryStep: handleRetryStep,
    handleMessage: handleMessage,
    handleRunTest: handleRunTest,
    handleRunAutomation: handleRunAutomation,
    handlePanelConnect: handlePanelConnect,
    initMessageRouter: initMessageRouter
  };
}
