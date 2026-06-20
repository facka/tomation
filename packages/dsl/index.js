// @tomation/dsl — runtime stubs

// --- Element Builders ---

/**
 * ElementBuilder — returned by `is.TAG` access.
 * Supports .where(matcher), .childOf(parent), .as(label) chaining.
 */
function ElementBuilder(tag) {
  this._tag = tag;
  this._where = {};
  this._childOf = undefined;
}

ElementBuilder.prototype.where = function (matcher) {
  this._where = matcher;
  return this;
};

ElementBuilder.prototype.childOf = function (parent) {
  this._childOf = parent;
  return this;
};

ElementBuilder.prototype.as = function (label) {
  var descriptor = { tag: this._tag, label: label, where: this._where, __el: true };
  if (this._childOf !== undefined) {
    descriptor.childOf = this._childOf;
  }
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

// --- Task and Test ---

function Task(name, fn) {
  return { __task: true, name: name, fn: fn };
}

function Test(name, fn) {
  return { __test: true, name: name, fn: fn };
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
  // Task and Test
  Task: Task,
  Test: Test,
  // Action stubs
  Click: Click,
  Type: Type,
  TypePassword: TypePassword,
  Select: Select,
  AssertExists: AssertExists,
  AssertNotExists: AssertNotExists,
  AssertHasText: AssertHasText,
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
};
