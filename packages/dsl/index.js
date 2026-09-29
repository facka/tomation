// @tomationjs/dsl — runtime stubs

// --- Element Builders ---

/**
 * ElementBuilder — returned by `is.TAG` access.
 * Supports .where(matcher), .childOf(parent), .as(label) chaining.
 */
function ElementBuilder(tag) {
  this._tag = tag;
  this._where = {};
  this._childOf = undefined;
  this._navigate = undefined;
}

ElementBuilder.prototype.where = function (matcher) {
  this._where = matcher;
  return this;
};

ElementBuilder.prototype.childOf = function (parent) {
  this._childOf = parent;
  return this;
};

ElementBuilder.prototype.navigate = function (path) {
  this._navigate = path;
  return this;
};

/**
 * Build a table cell reference — a shallow copy of the base descriptor with a
 * `tableCell` accessor carrying the (un-normalized) row/column selectors.
 * Selectors are stored as given (number/string/object); the compiler normalizes.
 * @param {object} base - the base element descriptor
 * @param {number|string|object} row - row selector
 * @param {number|string|object} column - column selector
 * @returns {object} a new descriptor carrying `tableCell`
 */
function makeCellRef(base, row, column) {
  var ref = Object.assign({}, base);
  ref.tableCell = { row: row, column: column };
  return ref;
}

ElementBuilder.prototype.as = function (label) {
  var descriptor = { tag: this._tag, label: label, where: this._where, __el: true };
  if (this._childOf !== undefined) {
    descriptor.childOf = this._childOf;
  }
  if (this._navigate !== undefined) {
    descriptor.navigate = this._navigate;
  }
  descriptor.cell = function (row, column) {
    return makeCellRef(descriptor, row, column);
  };
  descriptor.firstRow = function (column) {
    return makeCellRef(descriptor, 'first', column);
  };
  descriptor.lastRow = function (column) {
    return makeCellRef(descriptor, 'last', column);
  };
  return descriptor;
};

/**
 * XPathElementBuilder — returned by Element(xpath) or is.ELEMENT(xpath).
 * Supports only .as(label).
 */
function XPathElementBuilder(xpath) {
  this._xpath = xpath;
}

XPathElementBuilder.prototype.as = function (label) {
  return { tag: '*', label: label, where: {}, xpath: this._xpath, __el: true };
};

// --- `is` Proxy ---

var is = new Proxy({}, {
  get: function (_target, prop) {
    if (typeof prop !== 'string') return undefined;
    if (prop === 'ELEMENT') {
      return function (xpath) {
        return new XPathElementBuilder(xpath);
      };
    }
    // Only respond to uppercase property names (HTML tags)
    if (prop[0] === prop[0].toUpperCase() && prop[0] !== prop[0].toLowerCase()) {
      return new ElementBuilder(prop.toLowerCase());
    }
    return undefined;
  }
});

// --- Element(xpath) standalone function ---

function Element(xpath) {
  return new XPathElementBuilder(xpath);
}

// --- Matcher factories ---

function innerTextIs(text) {
  return { textIs: text };
}

function innerTextContains(text) {
  return { textContains: text };
}

function classIncludes(cls) {
  return { classIncludes: cls };
}

function placeholderIs(ph) {
  return { placeholder: ph };
}

function nameIs(name) {
  return { name: name };
}

function typeIs(type) {
  return { type: type };
}

function idIs(id) {
  return { id: id };
}

function valueIs(val) {
  return { value: val };
}

function ariaLabel(val) {
  return { ariaLabel: val };
}

function roleIs(val) {
  return { role: val };
}

function titleIs(val) {
  return { title: val };
}

function hrefContains(val) {
  return { hrefContains: val };
}

function isDisabled() {
  return { isDisabled: true };
}

function isNthElement(n) {
  return { isNthElement: n };
}

function dataAttr(name, val) {
  return { dataAttr: { name: name, value: val } };
}

function closestLabelIs(tag, text) {
  return { closestLabel: { tag: tag, text: text } };
}

// --- Task and Test ---

function Task(fn) {
  return {
    __task: true,
    fn: fn,
    as: function (label) {
      return { __task: true, fn: fn, label: label };
    }
  };
}

function Test(name, fn) {
  return { __test: true, name: name, fn: fn };
}

function Automation(name, fn) {
  return { __automation: true, name: name, fn: fn };
}

// --- Action stubs ---

function Click(element) {
  return { __step: true, action: 'click', target: element };
}

function Type(value) {
  return {
    __step: true,
    action: 'type',
    value: value,
    in: function (element) {
      return { __step: true, action: 'type', target: element, value: value };
    }
  };
}

function TypePassword(value) {
  return {
    __step: true,
    action: 'typePassword',
    value: value,
    in: function (element) {
      return { __step: true, action: 'typePassword', target: element, value: value };
    }
  };
}

function Select(value) {
  return {
    __step: true,
    action: 'select',
    value: value,
    in: function (element) {
      return { __step: true, action: 'select', target: element, value: value };
    }
  };
}

function AssertExists(element) {
  return { __step: true, action: 'assertExists', target: element };
}

function AssertNotExists(element) {
  return { __step: true, action: 'assertNotExists', target: element };
}

function AssertHasText(element, text) {
  return { __step: true, action: 'assertHasText', target: element, value: text };
}

function Navigate(url) {
  return { __step: true, action: 'navigate', url: url };
}

/**
 * AssertRequest — fluent builder that asserts a network request was (or was not) made.
 * The URL argument yields an exact / regex / glob criterion; chain methods to refine
 * the matcher (method, query, body, status) and set the expectation (exists / notMade / times).
 * @param {string|RegExp|{glob: string}} [url] - URL criterion: plain string → exact, RegExp → pattern, { glob } → glob
 * @returns {object} chainable AssertRequest builder descriptor
 */
function AssertRequest(url) {
  var matcher = {};
  if (url !== undefined && url !== null) {
    // plain string → exact; RegExp → pattern; { glob: '...' } → glob (Req 6.2, 6.3)
    if (url instanceof RegExp) matcher.url = { kind: 'regex', source: url.source, flags: url.flags };
    else if (url && typeof url === 'object' && url.glob) matcher.url = { kind: 'glob', pattern: url.glob };
    else matcher.url = { kind: 'exact', value: String(url) };
  }
  var expectation = { kind: 'exists' }; // default: at least one match (Req 7.1)

  var builder = {
    __step: true,
    action: 'assertRequest',
    matcher: matcher,
    expectation: expectation,
    method: function (m) { matcher.method = m; return builder; },        // case-insensitive (Req 6.4)
    query: function (obj) { matcher.queryParams = obj; return builder; }, // subset (Req 6.6)
    jsonBody: function (obj) { matcher.body = { kind: 'json', value: obj }; return builder; },   // Req 6.7
    formBody: function (obj) { matcher.body = { kind: 'form', value: obj }; return builder; },   // Req 6.7
    rawBody: function (str) { matcher.body = { kind: 'raw', value: String(str) }; return builder; }, // Req 6.7
    status: function (s) {                                                // int or range (Req 6.9, 6.10)
      if (typeof s === 'string' && /^[1-5]xx$/i.test(s)) {
        var lo = parseInt(s[0], 10) * 100; matcher.status = { kind: 'range', min: lo, max: lo + 99 };
      } else if (s && typeof s === 'object' && s.min != null) {
        matcher.status = { kind: 'range', min: s.min, max: s.max };
      } else {
        matcher.status = { kind: 'exact', value: s };
      }
      return builder;
    },
    notMade: function () { expectation.kind = 'notMade'; return builder; }, // Req 7.3
    times: function (n) { expectation.kind = 'count'; expectation.count = n; return builder; } // Req 8.1
  };
  return builder;
}

function Wait(ms) {
  return { __step: true, action: 'wait', ms: ms };
}

function WaitFor(element) {
  return { __step: true, action: 'waitFor', target: element, gone: false };
}

function WaitForGone(element) {
  return { __step: true, action: 'waitFor', target: element, gone: true };
}

function Manual(description) {
  return { __step: true, action: 'manual', description: description };
}

// --- Date Helpers ---

/**
 * Day-offset date helper — returns today's date formatted.
 * @param {string} [format] - optional format string (e.g., 'MM/DD/YYYY')
 * @returns {string} placeholder (compiler intercepts this call)
 */
function today(format) {
  return '__dateHelper:today' + (format ? ':' + format : '');
}

/**
 * Day-offset date helper — returns tomorrow's date formatted.
 * @param {string} [format] - optional format string
 * @returns {string} placeholder
 */
function tomorrow(format) {
  return '__dateHelper:tomorrow' + (format ? ':' + format : '');
}

/**
 * Day-offset date helper — returns yesterday's date formatted.
 * @param {string} [format] - optional format string
 * @returns {string} placeholder
 */
function yesterday(format) {
  return '__dateHelper:yesterday' + (format ? ':' + format : '');
}

/**
 * Day-offset date helper — returns the date 7 days from now.
 * @param {string} [format] - optional format string
 * @returns {string} placeholder
 */
function nextWeek(format) {
  return '__dateHelper:nextWeek' + (format ? ':' + format : '');
}

/**
 * Day-offset date helper — returns the date 7 days ago.
 * @param {string} [format] - optional format string
 * @returns {string} placeholder
 */
function lastWeek(format) {
  return '__dateHelper:lastWeek' + (format ? ':' + format : '');
}

/**
 * Day-offset date helper — returns the date 30 days from now.
 * @param {string} [format] - optional format string
 * @returns {string} placeholder
 */
function nextMonth(format) {
  return '__dateHelper:nextMonth' + (format ? ':' + format : '');
}

/**
 * Day-offset date helper — returns the date 30 days ago.
 * @param {string} [format] - optional format string
 * @returns {string} placeholder
 */
function lastMonth(format) {
  return '__dateHelper:lastMonth' + (format ? ':' + format : '');
}

/**
 * Month-boundary date helper — returns the first day of a month.
 * @param {number} offset - month offset (0 = current, positive = future, negative = past)
 * @param {string} [format] - optional format string
 * @returns {string} placeholder
 */
function firstDateOfMonth(offset, format) {
  return '__dateHelper:firstDateOfMonth:' + offset + (format ? ':' + format : '');
}

/**
 * Month-boundary date helper — returns the last day of a month.
 * @param {number} offset - month offset (0 = current, positive = future, negative = past)
 * @param {string} [format] - optional format string
 * @returns {string} placeholder
 */
function lastDateOfMonth(offset, format) {
  return '__dateHelper:lastDateOfMonth:' + offset + (format ? ':' + format : '');
}

// --- Data and Fake Generators ---

/**
 * Data template builder — wraps a plain object as a typed Data template.
 * @param {object} template - Object with static values and/or Fake generator calls
 * @param {object} [options] - Optional options { seed?: number }
 * @returns {{ __data: true, template: object, options?: object }}
 */
function Data(template, options) {
  var result = { __data: true, template: template };
  if (options) result.options = options;
  return result;
}

/**
 * Fake — collection of generator method stubs.
 * Each method returns a descriptor object that the compiler serializes
 * and the extension runtime resolves to a concrete random value.
 */
var Fake = {
  firstName: function(gender) {
    return { __fake: true, type: 'fake', method: 'firstName', options: { gender: gender } };
  },
  lastName: function() {
    return { __fake: true, type: 'fake', method: 'lastName', options: {} };
  },
  fullName: function(gender) {
    return { __fake: true, type: 'fake', method: 'fullName', options: { gender: gender } };
  },
  dateOfBirth: function(options) {
    return { __fake: true, type: 'fake', method: 'dateOfBirth', options: options || {} };
  },
  phone: function(options) {
    return { __fake: true, type: 'fake', method: 'phone', options: options || {} };
  },
  address: function(part) {
    return { __fake: true, type: 'fake', method: 'address', options: { part: part || 'full' } };
  },
  email: function() {
    return { __fake: true, type: 'fake', method: 'email', options: {} };
  },
  oneOf: function(options) {
    return { __fake: true, type: 'fake', method: 'oneOf', options: { values: options } };
  },
  number: function(options) {
    return { __fake: true, type: 'fake', method: 'number', options: options || {} };
  },
  uuid: function() {
    return { __fake: true, type: 'fake', method: 'uuid', options: {} };
  },
  sentence: function(options) {
    return { __fake: true, type: 'fake', method: 'sentence', options: options || {} };
  },
  pastDate: function(options) {
    return { __fake: true, type: 'fake', method: 'pastDate', options: options || {} };
  },
  futureDate: function(options) {
    return { __fake: true, type: 'fake', method: 'futureDate', options: options || {} };
  },
  sequence: function(options) {
    return { __fake: true, type: 'fake', method: 'sequence', options: options || {} };
  }
};

// --- Save Actions ---

function SaveText(element) {
  return {
    as: function (keyName) {
      return { __step: true, action: 'saveText', target: element, contextKey: keyName };
    }
  };
}

function SaveAttribute(element, attributeName) {
  return {
    as: function (keyName) {
      return { __step: true, action: 'saveAttribute', target: element, attributeName: attributeName, contextKey: keyName };
    }
  };
}

function SaveValue(element) {
  return {
    as: function (keyName) {
      return { __step: true, action: 'saveValue', target: element, contextKey: keyName };
    }
  };
}

function Save(expression) {
  return {
    as: function (keyName) {
      return { __step: true, action: 'saveExpression', value: expression, key: keyName };
    }
  };
}

// --- File Upload ---

function Upload(filePath) {
  return {
    __step: true,
    action: 'upload',
    value: filePath,
    in: function (element) {
      return { __step: true, action: 'upload', target: element, value: filePath };
    }
  };
}

// --- Keyboard Actions ---

/**
 * Press a specific key with optional modifiers.
 * @param {string} key - The key to press (e.g., 'a', 'Enter', 'Tab')
 * @param {object} [options] - Modifier keys: { alt, ctrl, meta, shift }
 */
function PressKey(key, options) {
  return { __step: true, action: 'pressKey', key: key, options: options || {} };
}

/**
 * Generic Press action — same as PressKey but can target a specific element.
 * @param {string} key - The key to press
 * @param {object} [options] - Modifier keys: { alt, ctrl, meta, shift }
 */
function Press(key, options) {
  return {
    __step: true,
    action: 'pressKey',
    key: key,
    options: options || {},
    in: function (element) {
      return { __step: true, action: 'pressKey', target: element, key: key, options: options || {} };
    }
  };
}

// Shortcut press functions
function PressUp() { return { __step: true, action: 'pressKey', key: 'ArrowUp', options: {} }; }
function PressDown() { return { __step: true, action: 'pressKey', key: 'ArrowDown', options: {} }; }
function PressLeft() { return { __step: true, action: 'pressKey', key: 'ArrowLeft', options: {} }; }
function PressRight() { return { __step: true, action: 'pressKey', key: 'ArrowRight', options: {} }; }
function PressTab() { return { __step: true, action: 'pressKey', key: 'Tab', options: {} }; }
function PressEnter() { return { __step: true, action: 'pressKey', key: 'Enter', options: {} }; }
function PressEsc() { return { __step: true, action: 'pressKey', key: 'Escape', options: {} }; }
function PressSpace() { return { __step: true, action: 'pressKey', key: ' ', options: {} }; }

// --- Exports ---

module.exports = {
  // Element builders
  is: is,
  Element: Element,
  // Matcher factories
  innerTextIs: innerTextIs,
  innerTextContains: innerTextContains,
  classIncludes: classIncludes,
  placeholderIs: placeholderIs,
  nameIs: nameIs,
  typeIs: typeIs,
  idIs: idIs,
  valueIs: valueIs,
  ariaLabel: ariaLabel,
  roleIs: roleIs,
  titleIs: titleIs,
  hrefContains: hrefContains,
  isDisabled: isDisabled,
  isNthElement: isNthElement,
  dataAttr: dataAttr,
  closestLabelIs: closestLabelIs,
  // Task, Test, and Automation
  Task: Task,
  Test: Test,
  Automation: Automation,
  // Action stubs
  Click: Click,
  Type: Type,
  TypePassword: TypePassword,
  Select: Select,
  AssertExists: AssertExists,
  AssertNotExists: AssertNotExists,
  AssertHasText: AssertHasText,
  AssertRequest: AssertRequest,
  Navigate: Navigate,
  Wait: Wait,
  WaitFor: WaitFor,
  WaitForGone: WaitForGone,
  Manual: Manual,
  Upload: Upload,
  PressKey: PressKey,
  Press: Press,
  PressUp: PressUp,
  PressDown: PressDown,
  PressLeft: PressLeft,
  PressRight: PressRight,
  PressTab: PressTab,
  PressEnter: PressEnter,
  PressEsc: PressEsc,
  PressSpace: PressSpace,
  // Data and Fake generators
  Data: Data,
  Fake: Fake,
  // Save actions
  SaveText: SaveText,
  SaveAttribute: SaveAttribute,
  SaveValue: SaveValue,
  Save: Save,
  // Date helpers
  today: today,
  tomorrow: tomorrow,
  yesterday: yesterday,
  nextWeek: nextWeek,
  lastWeek: lastWeek,
  nextMonth: nextMonth,
  lastMonth: lastMonth,
  firstDateOfMonth: firstDateOfMonth,
  lastDateOfMonth: lastDateOfMonth,
};
