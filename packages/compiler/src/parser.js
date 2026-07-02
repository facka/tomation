'use strict';

/**
 * parser.js — AST parsing of element declarations and Task/Test calls from DSL source files.
 *
 * Uses acorn to parse each file and walks the resulting AST to find:
 *   - const X = is.TAG.where(matcher).as('Label') → element declarations
 *   - const X = Element(xpath).as('Label') → XPath element declarations
 *   - Task('name', fn) / Test('name', fn) → task/test declarations
 *
 * Exported API:
 *   parseFile(filePath) → ParsedFile
 *   parseSource(source, filePath) → ParsedFile
 *
 * ParsedFile shape:
 * {
 *   filePath: string,
 *   type: 'pom' | 'test',
 *   elements: ElementDef[],  // element declarations
 *   tasks: TaskDef[],        // task declarations
 *   tests: TestDef[],        // test declarations
 *   error: null | { message: string, line: number }
 *   warnings: Array<{ message: string, filePath: string, line: number }>
 * }
 *
 * Requirements: 12.5, 2.1, 2.2, 2.3, 2.4, 4.1, 5.1, 5.2, 6.1
 */

const fs = require('fs');
const acorn = require('acorn');

// ---------------------------------------------------------------------------
// AST walk helper
// ---------------------------------------------------------------------------

/**
 * Simple recursive AST walker. Calls visitor(node) for every node in the tree.
 * @param {object} node - AST node
 * @param {function} visitor - called with each node; return false to skip children
 */
function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;

  const result = visitor(node);
  if (result === false) return; // visitor opted to skip children

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === 'string') {
          walk(item, visitor);
        }
      }
    } else if (child && typeof child.type === 'string') {
      walk(child, visitor);
    }
  }
}

// ---------------------------------------------------------------------------
// Value extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract a plain JS string value from a Literal or TemplateLiteral AST node.
 * Returns null if the node isn't a simple string.
 * @param {object} node
 * @returns {string|null}
 */
function extractString(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral' && node.quasis.length === 1 && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

/**
 * Extract a number from a Literal node (or UnaryExpression -N).
 * @param {object} node
 * @returns {number|null}
 */
function extractNumber(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'number') return node.value;
  if (node.type === 'UnaryExpression' && node.operator === '-') {
    const inner = extractNumber(node.argument);
    return inner !== null ? -inner : null;
  }
  return null;
}

/**
 * Extract a boolean from a Literal node.
 * @param {object} node
 * @returns {boolean|null}
 */
function extractBoolean(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'boolean') return node.value;
  return null;
}

/**
 * Get the line number of an AST node (1-based).
 * @param {object} node
 * @returns {number}
 */
function lineOf(node) {
  return node && node.loc ? node.loc.start.line : 0;
}

// ---------------------------------------------------------------------------
// Object literal extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract a plain { key: stringValue } object from an ObjectExpression.
 * Only handles properties whose values are Literals (strings/numbers/booleans).
 * Returns null if the node is not an ObjectExpression.
 * @param {object} node - ObjectExpression AST node
 * @returns {object|null}
 */
function extractSimpleObject(node) {
  if (!node || node.type !== 'ObjectExpression') return null;
  const result = {};
  for (const prop of node.properties) {
    if (prop.type !== 'Property') continue;
    const key = prop.key.type === 'Identifier' ? prop.key.name
               : prop.key.type === 'Literal' ? String(prop.key.value)
               : null;
    if (!key) continue;
    const val = extractString(prop.value)
             ?? extractNumber(prop.value)
             ?? extractBoolean(prop.value);
    if (val !== null && val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Element pattern extraction
// ---------------------------------------------------------------------------

/**
 * Check if a node is a method call on an object with a specific method name.
 * e.g., isMethodCall(node, 'as') matches X.as(...)
 * @param {object} node - AST node
 * @param {string} methodName - expected method name
 * @returns {boolean}
 */
function isMethodCall(node, methodName) {
  return (
    node &&
    node.type === 'CallExpression' &&
    node.callee &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === methodName
  );
}

/**
 * Extract a WhereMatcher descriptor from a matcher factory call expression.
 * e.g., innerTextIs('Login') → { textIs: 'Login' }
 *
 * @param {object} callNode - CallExpression for the matcher factory
 * @returns {object} where descriptor or empty object
 */
function extractMatcherCall(callNode) {
  if (!callNode || callNode.type !== 'CallExpression') return {};
  const callee = callNode.callee;
  const calleeName = callee.type === 'Identifier' ? callee.name : null;
  if (!calleeName) return {};

  const arg = extractString(callNode.arguments[0]);
  if (arg === null) return {};

  const matcherMap = {
    innerTextIs: 'textIs',
    innerTextContains: 'textContains',
    classIncludes: 'classIncludes',
    placeholderIs: 'placeholder',
    nameIs: 'name',
    typeIs: 'type',
    idIs: 'id',
  };

  const key = matcherMap[calleeName];
  if (!key) return {};
  return { [key]: arg };
}

/**
 * Extract an ElementDef from a VariableDeclarator node matching the pattern:
 *   const X = is.TAG.where(matcher).as('Label')
 *   const X = is.TAG.childOf(parent).where(matcher).as('Label')
 *   const X = is.TAG.as('Label')
 *
 * Walks the method chain from top to bottom: .as() → .where() → .childOf() → is.TAG
 *
 * @param {object} node - VariableDeclarator AST node
 * @param {string} filePath - current file path for error reporting
 * @returns {{ element: object|null, error: object|null }}
 */
function extractElement(node, filePath) {
  if (node.type !== 'VariableDeclarator') return { element: null, error: null };
  if (!node.init || node.init.type !== 'CallExpression') return { element: null, error: null };

  let current = node.init;
  let label = null;
  let matchers = {};
  let childOf = null;
  let tag = null;
  let whereCount = 0;

  // Step 1: Check for .as('Label') at the top
  if (!isMethodCall(current, 'as')) return { element: null, error: null };

  // Before validating the .as() argument, peek to see if this is an XPath pattern.
  // If the base is Element(...) or is.ELEMENT(...), defer to extractXPathElement.
  const peekBase = current.callee.object;
  if (peekBase && peekBase.type === 'CallExpression') {
    const peekCallee = peekBase.callee;
    const isXPathPattern = (peekCallee && peekCallee.type === 'Identifier' && peekCallee.name === 'Element') ||
      (peekCallee && peekCallee.type === 'MemberExpression' &&
        peekCallee.object && peekCallee.object.type === 'Identifier' && peekCallee.object.name === 'is' &&
        peekCallee.property && peekCallee.property.type === 'Identifier' && peekCallee.property.name === 'ELEMENT');
    if (isXPathPattern) return { element: null, error: null };
  }

  const asArg = current.arguments[0];
  label = extractString(asArg);
  if (label === null) {
    // .as() called without a string argument
    return {
      element: null,
      error: {
        message: `Element at ${filePath}:${lineOf(current)} missing label in .as()`,
        filePath,
        line: lineOf(current),
      },
    };
  }

  current = current.callee.object;

  // Step 2: Walk .where() and .childOf() calls (may appear in any order, multiple times)
  while (current && current.type === 'CallExpression' && current.callee && current.callee.type === 'MemberExpression') {
    const methodName = current.callee.property && current.callee.property.type === 'Identifier'
      ? current.callee.property.name
      : null;

    if (methodName === 'where') {
      whereCount++;
      if (whereCount > 1) {
        return {
          element: null,
          error: {
            message: `Multiple .where() calls at ${filePath}:${lineOf(current)} — use a single .where() with all conditions`,
            filePath,
            line: lineOf(current),
          },
        };
      }
      const arg = current.arguments[0];
      if (arg && arg.type === 'CallExpression') {
        matchers = extractMatcherCall(arg);
      }
      current = current.callee.object;
    } else if (methodName === 'childOf') {
      const parentArg = current.arguments[0];
      if (parentArg && parentArg.type === 'Identifier') {
        childOf = parentArg.name;
      }
      current = current.callee.object;
    } else {
      // Unknown method in the chain — not a recognized element builder pattern
      break;
    }
  }

  // Step 3: Check for is.TAG at the base
  if (
    current &&
    current.type === 'MemberExpression' &&
    current.object &&
    current.object.type === 'Identifier' &&
    current.object.name === 'is' &&
    current.property &&
    current.property.type === 'Identifier'
  ) {
    const propName = current.property.name;
    // Must be uppercase (HTML tag name convention in DSL)
    if (propName[0] === propName[0].toUpperCase() && propName[0] !== propName[0].toLowerCase()) {
      // ELEMENT is reserved for the XPath form — handled separately
      if (propName === 'ELEMENT') return { element: null, error: null };
      tag = propName.toLowerCase();
    }
  }

  if (!tag) return { element: null, error: null };

  const variableName = node.id && node.id.type === 'Identifier' ? node.id.name : null;
  if (!variableName) return { element: null, error: null };

  const element = {
    variableName,
    tag,
    label,
    where: matchers,
    line: lineOf(node),
  };

  if (childOf) {
    element.childOf = childOf;
  }

  return { element, error: null };
}

/**
 * Extract an XPath ElementDef from a VariableDeclarator node matching either:
 *   const X = Element(xpath).as('Label')
 *   const X = is.ELEMENT(xpath).as('Label')
 *
 * Sets tag to '*', where to {}, and populates the xpath field.
 *
 * @param {object} node - VariableDeclarator AST node
 * @param {string} filePath - current file path for error reporting
 * @returns {{ element: object|null, error: object|null }}
 */
function extractXPathElement(node, filePath) {
  if (node.type !== 'VariableDeclarator') return { element: null, error: null };
  if (!node.init || node.init.type !== 'CallExpression') return { element: null, error: null };

  let current = node.init;
  let label = null;
  let xpath = null;

  // Step 1: Check for .as('Label') at the top
  if (!isMethodCall(current, 'as')) return { element: null, error: null };

  // Peek at the base to see if this is an XPath pattern before committing
  const baseCandidate = current.callee.object;
  if (!baseCandidate || baseCandidate.type !== 'CallExpression') return { element: null, error: null };

  const baseCallee = baseCandidate.callee;
  const isElementCall = baseCallee && baseCallee.type === 'Identifier' && baseCallee.name === 'Element';
  const isIsElementCall = baseCallee && baseCallee.type === 'MemberExpression' &&
    baseCallee.object && baseCallee.object.type === 'Identifier' && baseCallee.object.name === 'is' &&
    baseCallee.property && baseCallee.property.type === 'Identifier' && baseCallee.property.name === 'ELEMENT';

  if (!isElementCall && !isIsElementCall) return { element: null, error: null };

  // This IS an XPath pattern — now validate fully

  // Extract .as() label
  const asArg = current.arguments[0];
  label = extractString(asArg);
  if (label === null) {
    return {
      element: null,
      error: {
        message: `XPath element at ${filePath}:${lineOf(current)} missing label — call .as('Label') to name it`,
        filePath,
        line: lineOf(current),
      },
    };
  }

  // Extract xpath argument from base call
  const xpathArg = baseCandidate.arguments[0];
  xpath = extractString(xpathArg);
  if (xpath === null) {
    return {
      element: null,
      error: {
        message: `XPath element at ${filePath}:${lineOf(baseCandidate)} requires a string argument`,
        filePath,
        line: lineOf(baseCandidate),
      },
    };
  }

  const variableName = node.id && node.id.type === 'Identifier' ? node.id.name : null;
  if (!variableName) return { element: null, error: null };

  return {
    element: {
      variableName,
      tag: '*',
      label,
      where: {},
      xpath,
      line: lineOf(node),
    },
    error: null,
  };
}

/**
 * Check for XPath element patterns used WITHOUT .as('Label') — emit helpful error.
 * Detects: Element(xpath) or is.ELEMENT(xpath) used as a bare expression or assignment
 * without the .as() chain.
 *
 * @param {object} node - VariableDeclarator AST node
 * @param {string} filePath - current file path for error reporting
 * @returns {{ error: object|null }}
 */
function checkBareXPathElement(node, filePath) {
  if (node.type !== 'VariableDeclarator') return { error: null };
  if (!node.init || node.init.type !== 'CallExpression') return { error: null };

  const current = node.init;
  const callee = current.callee;

  const isElementCall = callee && callee.type === 'Identifier' && callee.name === 'Element';
  const isIsElementCall = callee && callee.type === 'MemberExpression' &&
    callee.object && callee.object.type === 'Identifier' && callee.object.name === 'is' &&
    callee.property && callee.property.type === 'Identifier' && callee.property.name === 'ELEMENT';

  if (!isElementCall && !isIsElementCall) return { error: null };

  // This is Element(xpath) or is.ELEMENT(xpath) without .as()
  return {
    error: {
      message: `XPath element at ${filePath}:${lineOf(current)} missing label — call .as('Label') to name it`,
      filePath,
      line: lineOf(current),
    },
  };
}

// ---------------------------------------------------------------------------
// Task/Test declaration extraction
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Step extraction — parses action calls in Task/Test function bodies
// ---------------------------------------------------------------------------

/**
 * Extract a template string value from a TemplateLiteral that may contain expressions.
 * Converts `${paramName}` to `{{paramName}}` format used in spec.json.
 *
 * @param {object} node - TemplateLiteral AST node
 * @returns {string|null}
 */
function extractTemplateValue(node) {
  if (!node || node.type !== 'TemplateLiteral') return null;

  let result = '';
  for (let i = 0; i < node.quasis.length; i++) {
    result += node.quasis[i].value.cooked;
    if (i < node.expressions.length) {
      const expr = node.expressions[i];
      if (expr.type === 'Identifier') {
        result += '{{' + expr.name + '}}';
      } else {
        // Unsupported expression type in template — skip gracefully
        result += '{{?}}';
      }
    }
  }
  return result;
}

/**
 * Extract a string or template value from an AST node.
 * Handles plain strings, simple template literals (no expressions),
 * and template literals with identifier expressions (→ {{param}} format).
 *
 * @param {object} node - AST node
 * @returns {string|null}
 */
function extractStringOrTemplate(node) {
  if (!node) return null;
  const plain = extractString(node);
  if (plain !== null) return plain;
  if (node.type === 'TemplateLiteral') return extractTemplateValue(node);
  // Handle variable references (e.g., destructured params) → template placeholder
  if (node.type === 'Identifier') return '{{' + node.name + '}}';
  return null;
}

/**
 * Extract a step descriptor from a single expression node.
 * Handles all 12 DSL actions and task invocation patterns.
 *
 * Patterns:
 *   Click(element)                 → { action: "click", target: "varName" }
 *   Type(value).in(element)        → { action: "type", target: "varName", value: "..." }
 *   TypePassword(value).in(el)     → { action: "typePassword", target: "varName", value: "..." }
 *   Select(value).in(element)      → { action: "select", target: "varName", value: "..." }
 *   AssertExists(element)          → { action: "assertExists", target: "varName" }
 *   AssertNotExists(element)       → { action: "assertNotExists", target: "varName" }
 *   AssertHasText(element, text)   → { action: "assertHasText", target: "varName", value: "..." }
 *   Navigate(url)                  → { action: "navigate", url: "..." }
 *   Wait(ms)                       → { action: "wait", ms: N }
 *   WaitFor(element)               → { action: "waitFor", target: "varName", gone: false }
 *   WaitForGone(element)           → { action: "waitFor", target: "varName", gone: true }
 *   Manual(description)            → { action: "manual", description: "..." }
 *   taskName(params)               → { action: "task", name: "taskName", params: {...} }
 *   PageName.taskName(params)      → { action: "task", name: "PageName__taskName", params: {...} }
 *
 * @param {object} exprNode - expression AST node (typically CallExpression or MemberExpression call)
 * @param {string} filePath - current file path for error reporting
 * @param {Set<string>} [declaredTaskNames] - task names declared in this file
 * @returns {object|null} step descriptor or null if unrecognized
 */

/**
 * Extract an element reference from an AST node.
 * Handles two patterns:
 *   - Bare identifier: `submitButton` → "submitButton" (resolved later by POM extractor)
 *   - Member expression: `Login.submitButton` → "Login__submitButton" (cross-file reference)
 *
 * @param {object} node - AST node (Identifier or MemberExpression)
 * @returns {string|null} element reference string, or null if not a valid pattern
 */
function extractElementRef(node) {
  if (!node) return null;
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (
    node.type === 'MemberExpression' &&
    node.object && node.object.type === 'Identifier' &&
    node.property && node.property.type === 'Identifier'
  ) {
    return node.object.name + '__' + node.property.name;
  }
  return null;
}

function extractStep(exprNode, filePath, declaredTaskNames) {
  if (!exprNode) return null;

  // Pattern: Type(value).in(element) / TypePassword(value).in(element) / Select(value).in(element)
  // AST shape: CallExpression with callee being MemberExpression (X.in) where X is a CallExpression
  if (
    exprNode.type === 'CallExpression' &&
    exprNode.callee &&
    exprNode.callee.type === 'MemberExpression' &&
    exprNode.callee.property &&
    exprNode.callee.property.type === 'Identifier' &&
    exprNode.callee.property.name === 'in'
  ) {
    const innerCall = exprNode.callee.object;
    if (innerCall && innerCall.type === 'CallExpression' && innerCall.callee && innerCall.callee.type === 'Identifier') {
      const actionName = innerCall.callee.name;
      const actionMap = { Type: 'type', TypePassword: 'typePassword', Select: 'select', Upload: 'upload' };
      const action = actionMap[actionName];
      if (action) {
        const valueArg = innerCall.arguments[0];
        const value = extractStringOrTemplate(valueArg);
        const targetArg = exprNode.arguments[0];
        const target = extractElementRef(targetArg);
        if (target === null) return null;
        return { action, target, value: value !== null ? value : '' };
      }
      // Press(key, options).in(element) → pressKey with target
      if (actionName === 'Press') {
        const key = extractStringOrTemplate(innerCall.arguments[0]);
        if (key === null) return null;
        const opts = extractSimpleObject(innerCall.arguments[1]) || {};
        const targetArg = exprNode.arguments[0];
        const target = extractElementRef(targetArg);
        if (target === null) return null;
        return { action: 'pressKey', target: target, key: key, options: opts };
      }
    }
  }

  // Pattern: Simple CallExpression — Click(el), Navigate(url), etc.
  if (exprNode.type === 'CallExpression' && exprNode.callee) {
    // Task invocation: PageName.taskName(params)
    if (exprNode.callee.type === 'MemberExpression') {
      const obj = exprNode.callee.object;
      const prop = exprNode.callee.property;
      if (
        obj && obj.type === 'Identifier' &&
        prop && prop.type === 'Identifier'
      ) {
        const taskName = obj.name + '__' + prop.name;
        const step = { action: 'task', name: taskName };
        // Optional params object
        const paramsArg = exprNode.arguments[0];
        if (paramsArg && paramsArg.type === 'ObjectExpression') {
          const params = extractTaskInvocationParams(paramsArg);
          if (params && Object.keys(params).length > 0) step.params = params;
        }
        return step;
      }
      return null;
    }

    // Named function calls (actions)
    if (exprNode.callee.type === 'Identifier') {
      const fnName = exprNode.callee.name;
      const args = exprNode.arguments || [];

      switch (fnName) {
        // Simple target actions (one element arg)
        case 'Click':
        case 'AssertExists':
        case 'AssertNotExists': {
          const target = extractElementRef(args[0]);
          if (target === null) return null;
          const actionNameMap = { Click: 'click', AssertExists: 'assertExists', AssertNotExists: 'assertNotExists' };
          return { action: actionNameMap[fnName], target };
        }

        case 'WaitFor': {
          const target = extractElementRef(args[0]);
          if (target === null) return null;
          return { action: 'waitFor', target, gone: false };
        }

        case 'WaitForGone': {
          const target = extractElementRef(args[0]);
          if (target === null) return null;
          return { action: 'waitFor', target, gone: true };
        }

        // Two-argument target+value: AssertHasText(element, text)
        case 'AssertHasText': {
          const target = extractElementRef(args[0]);
          if (target === null) return null;
          const value = extractStringOrTemplate(args[1]);
          return { action: 'assertHasText', target, value: value !== null ? value : '' };
        }

        // Value-only: Navigate(url)
        case 'Navigate': {
          const url = extractStringOrTemplate(args[0]);
          if (url === null) return null;
          return { action: 'navigate', url };
        }

        // Value-only: Wait(ms)
        case 'Wait': {
          const ms = extractNumber(args[0]);
          return { action: 'wait', ms: ms !== null ? ms : 0 };
        }

        // Value-only: Manual(description)
        case 'Manual': {
          const description = extractStringOrTemplate(args[0]);
          return { action: 'manual', description: description !== null ? description : '' };
        }

        // PressKey(key, options) — keyboard action without target
        case 'PressKey': {
          const key = extractStringOrTemplate(args[0]);
          if (key === null) return null;
          const opts = extractSimpleObject(args[1]) || {};
          return { action: 'pressKey', key: key, options: opts };
        }

        // Shortcut press functions
        case 'PressUp':    return { action: 'pressKey', key: 'ArrowUp', options: {} };
        case 'PressDown':  return { action: 'pressKey', key: 'ArrowDown', options: {} };
        case 'PressLeft':  return { action: 'pressKey', key: 'ArrowLeft', options: {} };
        case 'PressRight': return { action: 'pressKey', key: 'ArrowRight', options: {} };
        case 'PressTab':   return { action: 'pressKey', key: 'Tab', options: {} };
        case 'PressEnter': return { action: 'pressKey', key: 'Enter', options: {} };
        case 'PressEsc':   return { action: 'pressKey', key: 'Escape', options: {} };
        case 'PressSpace': return { action: 'pressKey', key: ' ', options: {} };

        // Type/TypePassword/Select/Upload without .in() chain — shouldn't normally occur,
        // but return null to skip gracefully
        case 'Type':
        case 'TypePassword':
        case 'Select':
        case 'Upload':
          return null;

        default: {
          // Bare task invocation: taskName() / taskName({ ...params })
          // Only treat as task if this function is declared as a Task in this file.
          if (!declaredTaskNames || !declaredTaskNames.has(fnName)) {
            return null;
          }
          if (args.length === 0) {
            return { action: 'task', name: fnName };
          }
          if (args.length === 1 && args[0] && args[0].type === 'ObjectExpression') {
            const step = { action: 'task', name: fnName };
            const params = extractTaskInvocationParams(args[0]);
            if (params && Object.keys(params).length > 0) step.params = params;
            return step;
          }
          return null;
        }
      }
    }
  }

  return null;
}

/**
 * Extract params from a task invocation's ObjectExpression argument.
 * Handles string/number/boolean values and template literals with param refs.
 *
 * @param {object} objNode - ObjectExpression AST node
 * @returns {object} params object
 */
function extractTaskInvocationParams(objNode) {
  if (!objNode || objNode.type !== 'ObjectExpression') return {};
  const params = {};
  for (const prop of objNode.properties) {
    if (prop.type !== 'Property') continue;
    const key = prop.key.type === 'Identifier' ? prop.key.name
               : prop.key.type === 'Literal' ? String(prop.key.value)
               : null;
    if (!key) continue;

    // Try string/template, then number, then boolean
    const strVal = extractStringOrTemplate(prop.value);
    if (strVal !== null) {
      params[key] = strVal;
      continue;
    }
    const numVal = extractNumber(prop.value);
    if (numVal !== null) {
      params[key] = numVal;
      continue;
    }
    const boolVal = extractBoolean(prop.value);
    if (boolVal !== null) {
      params[key] = boolVal;
      continue;
    }
  }
  return params;
}

/**
 * Extract the condition from an if-statement's test expression.
 * Resolves identifiers against tracked destructured params.
 *
 * Supported patterns:
 *   if (paramName)           → { param: "paramName", op: "truthy" }
 *   if (!paramName)          → { param: "paramName", op: "falsy" }
 *   if (paramName === 'val') → { param: "paramName", op: "equals", value: "val" }
 *   if (paramName !== 'val') → { param: "paramName", op: "notEquals", value: "val" }
 *
 * @param {object} testNode - the `test` property of an IfStatement AST node
 * @param {Set<string>} trackedParams - set of known param names from destructuring
 * @returns {object|null} condition object or null if pattern is unsupported
 */
function extractCondition(testNode, trackedParams) {
  if (!testNode) return null;

  // Pattern: paramName (truthy)
  if (testNode.type === 'Identifier') {
    if (trackedParams.has(testNode.name)) {
      return { param: testNode.name, op: 'truthy' };
    }
    return null;
  }

  // Pattern: !paramName (falsy)
  if (
    testNode.type === 'UnaryExpression' &&
    testNode.operator === '!' &&
    testNode.argument &&
    testNode.argument.type === 'Identifier'
  ) {
    if (trackedParams.has(testNode.argument.name)) {
      return { param: testNode.argument.name, op: 'falsy' };
    }
    return null;
  }

  // Pattern: paramName === 'value' or paramName !== 'value'
  if (
    testNode.type === 'BinaryExpression' &&
    (testNode.operator === '===' || testNode.operator === '!==')
  ) {
    const left = testNode.left && testNode.left.type === 'Identifier'
      ? testNode.left.name
      : null;
    const right = extractString(testNode.right);
    if (left && trackedParams.has(left) && right !== null) {
      return {
        param: left,
        op: testNode.operator === '===' ? 'equals' : 'notEquals',
        value: right,
      };
    }
    return null;
  }

  return null;
}

/**
 * Extract a conditional if-step from an IfStatement AST node.
 * Emits a warning for else blocks and unsupported condition patterns.
 * Recursively extracts steps from the if-block body (including nested ifs).
 *
 * @param {object} stmt - IfStatement AST node
 * @param {string} filePath - current file path for error reporting
 * @param {Set<string>} trackedParams - set of known param names from destructuring
 * @param {Array} warnings - array to push warnings into
 * @param {Set<string>} [declaredTaskNames] - task names declared in this file
 * @returns {object|null} conditional step or null if condition is unsupported
 */
function extractIfStep(stmt, filePath, trackedParams, warnings, source, declaredTaskNames) {
  if (!stmt || stmt.type !== 'IfStatement') return null;

  // Warn about else blocks (not supported)
  if (stmt.alternate !== null) {
    warnings.push({
      message: `else blocks are not supported — use a separate if with the negated condition`,
      filePath,
      line: stmt.alternate.loc ? stmt.alternate.loc.start.line : lineOf(stmt),
    });
  }

  // Extract the condition
  const condition = extractCondition(stmt.test, trackedParams);
  if (!condition) {
    // Unsupported condition pattern — emit warning
    warnings.push({
      message: `Unsupported if-condition at ${filePath}:${lineOf(stmt)} — only param truthiness/equality checks are allowed`,
      filePath,
      line: lineOf(stmt),
    });
    return null;
  }

  // Recursively extract steps from the if-block body
  const consequent = stmt.consequent;
  const body = consequent && consequent.type === 'BlockStatement' ? consequent : null;
  const thenSteps = body ? extractSteps(body, filePath, trackedParams, warnings, source, declaredTaskNames) : [];

  if (thenSteps.length === 0) return null;

  return { action: 'if', condition, then: thenSteps };
}

/**
 * Extract steps from a BlockStatement body (the function body of a Task or Test).
 * Iterates statements, handling param destructuring tracking, if-statements for
 * conditional steps, and ExpressionStatements for action steps.
 * Emits warnings for unrecognized statements with file path, line number, and source snippet.
 *
 * @param {object} body - BlockStatement AST node (fn.body)
 * @param {string} filePath - current file path for error reporting
 * @param {Set<string>} [trackedParams] - set of known param names from destructuring
 * @param {Array} [warnings] - array to push warnings into
 * @param {string} [source] - original source code for snippet extraction
 * @param {Set<string>} [declaredTaskNames] - task names declared in this file
 * @returns {Array} array of step objects
 */
function extractSteps(body, filePath, trackedParams, warnings, source, declaredTaskNames) {
  if (!body || body.type !== 'BlockStatement') return [];
  if (!trackedParams) trackedParams = new Set();
  if (!warnings) warnings = [];
  const steps = [];

  for (const stmt of body.body) {
    // Track param destructuring: const { x, y } = params
    if (stmt.type === 'VariableDeclaration') {
      const destructured = extractBodyDestructuring(stmt);
      if (destructured.length > 0) {
        for (const name of destructured) {
          trackedParams.add(name);
        }
        continue;
      }
      // Non-destructuring variable declarations are unrecognized
      const snippet = source ? source.slice(stmt.start, stmt.end).split('\n')[0] : '';
      warnings.push({
        message: `Unrecognized statement at ${filePath}:${lineOf(stmt)} — skipped`,
        filePath,
        line: lineOf(stmt),
        source: snippet,
      });
      continue;
    }

    // Handle if-statements → conditional steps
    if (stmt.type === 'IfStatement') {
      const ifStep = extractIfStep(stmt, filePath, trackedParams, warnings, source, declaredTaskNames);
      if (ifStep) {
        steps.push(ifStep);
      }
      continue;
    }

    // Process expression statements
    if (stmt.type === 'ExpressionStatement') {
      const step = extractStep(stmt.expression, filePath, declaredTaskNames);
      if (step) {
        steps.push(step);
      } else {
        // Recognized JS but not a known tomation action — emit warning
        const snippet = source ? source.slice(stmt.start, stmt.end).split('\n')[0] : '';
        warnings.push({
          message: `Unrecognized statement at ${filePath}:${lineOf(stmt)} — skipped`,
          filePath,
          line: lineOf(stmt),
          source: snippet,
        });
      }
      continue;
    }

    // Any other statement type (for, while, return, throw, etc.) — emit warning
    const snippet = source ? source.slice(stmt.start, stmt.end).split('\n')[0] : '';
    warnings.push({
      message: `Unrecognized statement at ${filePath}:${lineOf(stmt)} — skipped`,
      filePath,
      line: lineOf(stmt),
      source: snippet,
    });
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Task/Test declaration extraction
// ---------------------------------------------------------------------------

/**
 * Extract destructured parameter names from function params.
 * Handles: ({username, password}) => ...  OR  (params) => ...
 *
 * For ObjectPattern: returns the property names directly.
 * For Identifier: returns empty (we'll track body destructuring separately).
 *
 * @param {Array} fnParams - function parameter nodes
 * @returns {string[]} extracted param names
 */
function extractFnParams(fnParams) {
  const params = [];
  if (!fnParams || fnParams.length === 0) return params;

  const firstParam = fnParams[0];
  if (firstParam.type === 'ObjectPattern') {
    for (const prop of firstParam.properties) {
      if (prop.type === 'Property' && prop.key && prop.key.type === 'Identifier') {
        params.push(prop.key.name);
      } else if (prop.type === 'RestElement' && prop.argument && prop.argument.type === 'Identifier') {
        params.push(prop.argument.name);
      }
    }
  }
  // For plain identifier params (e.g., `(params) => ...`), we return empty;
  // body destructuring like `const { x, y } = params` is tracked separately.

  return params;
}

/**
 * Track `const { x, y } = params` or `const { x, y } = someIdentifier` destructuring
 * inside a task/test body. Returns the destructured variable names.
 *
 * @param {object} stmt - VariableDeclaration AST node
 * @returns {string[]} destructured param names, or empty if not a matching pattern
 */
function extractBodyDestructuring(stmt) {
  if (!stmt || stmt.type !== 'VariableDeclaration') return [];
  const params = [];

  for (const declarator of stmt.declarations) {
    if (
      declarator.id &&
      declarator.id.type === 'ObjectPattern' &&
      declarator.init &&
      declarator.init.type === 'Identifier'
    ) {
      for (const prop of declarator.id.properties) {
        if (prop.type === 'Property' && prop.key && prop.key.type === 'Identifier') {
          params.push(prop.key.name);
        }
      }
    }
  }

  return params;
}

/**
 * Extract a TaskDef from a VariableDeclarator node matching:
 *   const X = Task((params) => { ... }).as('Label')
 *   const X = Task(function(params) { ... }).as('Label')
 *   const X = Task((params) => { ... })  (no label — variable name used as fallback)
 *
 * The variable name becomes the task key (for namespacing).
 * The .as('Label') provides a display label for the panel.
 *
 * @param {object} declarator - VariableDeclarator AST node
 * @param {string} filePath - current file path for error reporting
 * @param {string} source - original source for snippet extraction
 * @param {Set<string>} [declaredTaskNames] - task names declared in this file
 * @returns {{ task: object|null, error: object|null, warnings: Array }}
 */
function extractTask(declarator, filePath, source, declaredTaskNames) {
  if (!declarator || declarator.type !== 'VariableDeclarator') return { task: null, error: null };
  if (!declarator.init) return { task: null, error: null };

  var variableName = declarator.id && declarator.id.type === 'Identifier' ? declarator.id.name : null;
  if (!variableName) return { task: null, error: null };

  var taskCallNode = null;
  var label = null;

  // Pattern 1: Task(fn).as('Label') — .as() chain
  if (
    declarator.init.type === 'CallExpression' &&
    isMethodCall(declarator.init, 'as')
  ) {
    // Check if the object of .as() is a Task() call
    var asObj = declarator.init.callee.object;
    if (
      asObj && asObj.type === 'CallExpression' &&
      asObj.callee && asObj.callee.type === 'Identifier' &&
      asObj.callee.name === 'Task'
    ) {
      taskCallNode = asObj;
      label = extractString(declarator.init.arguments[0]);
    }
  }

  // Pattern 2: Task(fn) — direct call without .as()
  if (
    !taskCallNode &&
    declarator.init.type === 'CallExpression' &&
    declarator.init.callee &&
    declarator.init.callee.type === 'Identifier' &&
    declarator.init.callee.name === 'Task'
  ) {
    taskCallNode = declarator.init;
  }

  if (!taskCallNode) return { task: null, error: null };

  var args = taskCallNode.arguments || [];

  // First argument must be a function
  if (args.length < 1) {
    return {
      task: null,
      error: {
        message: `Task() at ${filePath}:${lineOf(taskCallNode)} requires a function argument`,
        filePath,
        line: lineOf(taskCallNode),
      },
    };
  }

  var fn = args[0];

  // Support old syntax Task('name', fn) for backward compat during transition
  if (fn.type === 'Literal' && typeof fn.value === 'string') {
    // Old syntax: Task('name', fn) — use string as label, fn is second arg
    label = fn.value;
    fn = args[1];
    if (!fn) {
      return {
        task: null,
        error: {
          message: `Task('${label}') at ${filePath}:${lineOf(taskCallNode)} requires a function as the second argument`,
          filePath,
          line: lineOf(taskCallNode),
        },
      };
    }
  }

  if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') {
    return {
      task: null,
      error: {
        message: `Task() at ${filePath}:${lineOf(taskCallNode)} argument must be a function`,
        filePath,
        line: lineOf(taskCallNode),
      },
    };
  }

  // Extract params from function parameter destructuring
  const params = extractFnParams(fn.params);

  // Build the initial tracked params set from function signature params
  const trackedParams = new Set(params);

  // Pre-scan body for destructuring to collect allParams for the task definition
  const bodyParams = [];
  if (fn.body && fn.body.type === 'BlockStatement') {
    for (const stmt of fn.body.body) {
      if (stmt.type === 'VariableDeclaration') {
        const destructured = extractBodyDestructuring(stmt);
        bodyParams.push(...destructured);
      }
    }
  }

  // Merge: params from fn signature + body destructuring
  const allParams = [...params, ...bodyParams];

  // Extract steps from the function body
  const warnings = [];
  const steps = fn.body && fn.body.type === 'BlockStatement'
    ? extractSteps(fn.body, filePath, trackedParams, warnings, source, declaredTaskNames)
    : [];

  return {
    task: {
      name: variableName,
      label: label || null,
      params: allParams,
      steps,
      line: lineOf(declarator),
    },
    error: null,
    warnings,
  };
}

/**
 * Extract a TestDef from a CallExpression node matching:
 *   Test('name', () => { ... })
 *   Test('name', function() { ... })
 *
 * @param {object} node - CallExpression AST node
 * @param {string} filePath - current file path for error reporting
 * @param {Set<string>} [declaredTaskNames] - task names declared in this file
 * @returns {{ test: object|null, error: object|null }}
 */
function extractTest(node, filePath, source, declaredTaskNames) {
  if (!node || node.type !== 'CallExpression') return { test: null, error: null };

  const callee = node.callee;
  if (!callee || callee.type !== 'Identifier' || callee.name !== 'Test') return { test: null, error: null };

  const args = node.arguments || [];

  // First argument must be a string (the test name)
  if (args.length < 1) {
    return {
      test: null,
      error: {
        message: `Test() at ${filePath}:${lineOf(node)} requires a name string as the first argument`,
        filePath,
        line: lineOf(node),
      },
    };
  }

  const name = extractString(args[0]);
  if (name === null) {
    return {
      test: null,
      error: {
        message: `Test() at ${filePath}:${lineOf(node)} first argument must be a string`,
        filePath,
        line: lineOf(node),
      },
    };
  }

  // Second argument must be a function (arrow or function expression)
  if (args.length < 2) {
    return {
      test: null,
      error: {
        message: `Test('${name}') at ${filePath}:${lineOf(node)} requires a function as the second argument`,
        filePath,
        line: lineOf(node),
      },
    };
  }

  const fn = args[1];
  if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') {
    return {
      test: null,
      error: {
        message: `Test('${name}') at ${filePath}:${lineOf(node)} second argument must be a function`,
        filePath,
        line: lineOf(node),
      },
    };
  }

  // Extract steps from the function body
  const warnings = [];
  const steps = fn.body && fn.body.type === 'BlockStatement'
    ? extractSteps(fn.body, filePath, new Set(), warnings, source, declaredTaskNames)
    : [];

  return {
    test: {
      name,
      steps,
      line: lineOf(node),
    },
    error: null,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// File type detection
// ---------------------------------------------------------------------------

/**
 * Determine whether a file is a POM or test file based on naming convention.
 * Falls back to content inspection if the name is ambiguous.
 *
 * @param {string} filePath
 * @returns {'pom'|'test'}
 */
function detectFileType(filePath) {
  if (filePath.endsWith('.pom.js') || filePath.endsWith('.pom.ts')) return 'pom';
  if (filePath.endsWith('.test.js') || filePath.endsWith('.test.ts')) return 'test';
  if (filePath.endsWith('.page.js') || filePath.endsWith('.page.ts')) return 'pom';
  // Fallback: treat as unknown but default to 'test'
  return 'test';
}

// ---------------------------------------------------------------------------
// Main parseFile function
// ---------------------------------------------------------------------------

/**
 * Parse a single DSL file and return a structured AST representation.
 *
 * @param {string} filePath - absolute path to the file
 * @returns {ParsedFile}
 *
 * ParsedFile:
 * {
 *   filePath: string,
 *   type: 'pom' | 'test',
 *   elements: ElementDef[],
 *   tasks: TaskDef[],
 *   tests: TestDef[],
 *   error: null | { message: string, line: number }
 *   warnings: Array<{ message: string, filePath: string, line: number }>
 * }
 */
function parseFile(filePath) {
  // Read the source file
  let source;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return {
      filePath,
      type: detectFileType(filePath),
      tests: [],
      elements: [],
      tasks: [],
      error: {
        message: 'Parse error in ' + filePath + ':0: ' + e.message,
        line: 0,
      },
      warnings: [],
    };
  }

  return parseSource(source, filePath);
}

/**
 * Parse DSL source code (already read/type-stripped) and return a structured AST representation.
 *
 * @param {string} source - JavaScript source code (types already stripped)
 * @param {string} filePath - file path (for error reporting and file type detection)
 * @returns {ParsedFile}
 */
function parseSource(source, filePath) {
  const result = {
    filePath,
    type: detectFileType(filePath),
    tests: [],
    elements: [],
    tasks: [],
    imports: [],   // track import declarations for namespace resolution
    error: null,
    warnings: [],
  };

  // Parse with acorn
  let ast;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: 2020,
      sourceType: 'module',
      locations: true,  // enable loc for line numbers
    });
  } catch (e) {
    // acorn parse errors include a `loc` property with line info
    const line = e.loc ? e.loc.line : 0;
    result.error = {
      message: 'Parse error in ' + filePath + ':' + line + ': ' + e.message,
      line,
    };
    return result;
  }

  // Extract import declarations: import X from './path' or import X from '~/path'
  // Builds a map of localName → importPath for namespace resolution later
  walk(ast, node => {
    if (node.type !== 'ImportDeclaration') return;
    if (!node.source || typeof node.source.value !== 'string') return;
    var importPath = node.source.value;
    // Only track relative and ~/ imports (project-internal POM files)
    if (!importPath.startsWith('.') && !importPath.startsWith('~/')) return;
    // Extract the default import specifier (import X from '...')
    if (node.specifiers) {
      for (var si = 0; si < node.specifiers.length; si++) {
        var spec = node.specifiers[si];
        if (spec.type === 'ImportDefaultSpecifier' && spec.local && spec.local.name) {
          result.imports.push({
            localName: spec.local.name,
            importPath: importPath,
          });
        }
      }
    }
  });

  // Pre-collect declared task names so bare local task calls (e.g., login())
  // can be recognized during step extraction, including forward references.
  var declaredTaskNames = new Set();
  walk(ast, node => {
    if (node.type !== 'VariableDeclaration') return;
    for (const declarator of node.declarations) {
      if (!declarator || declarator.type !== 'VariableDeclarator') continue;
      if (!declarator.id || declarator.id.type !== 'Identifier') continue;
      if (!declarator.init || declarator.init.type !== 'CallExpression') continue;

      var isTaskDeclaration = false;

      // Pattern: const x = Task(fn)
      if (
        declarator.init.callee &&
        declarator.init.callee.type === 'Identifier' &&
        declarator.init.callee.name === 'Task'
      ) {
        isTaskDeclaration = true;
      }

      // Pattern: const x = Task(fn).as('Label')
      if (
        !isTaskDeclaration &&
        isMethodCall(declarator.init, 'as') &&
        declarator.init.callee.object &&
        declarator.init.callee.object.type === 'CallExpression' &&
        declarator.init.callee.object.callee &&
        declarator.init.callee.object.callee.type === 'Identifier' &&
        declarator.init.callee.object.callee.name === 'Task'
      ) {
        isTaskDeclaration = true;
      }

      if (isTaskDeclaration) {
        declaredTaskNames.add(declarator.id.name);
      }
    }
  });

  // Walk the AST for element declarations: const X = is.TAG.where(...).as('Label')
  // and XPath element declarations: const X = Element(xpath).as('Label') / is.ELEMENT(xpath).as('Label')
  walk(ast, node => {
    if (node.type !== 'VariableDeclaration') return;
    for (const declarator of node.declarations) {
      // Try tag-based element pattern first
      const { element, error } = extractElement(declarator, filePath);
      if (error) {
        result.warnings.push(error);
      }
      if (element) {
        result.elements.push(element);
        result.type = 'pom';
        continue;
      }

      // Try XPath element pattern: Element(xpath).as('Label') / is.ELEMENT(xpath).as('Label')
      const { element: xpathElement, error: xpathError } = extractXPathElement(declarator, filePath);
      if (xpathError) {
        result.warnings.push(xpathError);
      }
      if (xpathElement) {
        result.elements.push(xpathElement);
        result.type = 'pom';
        continue;
      }

      // Check for bare XPath usage without .as() (only if neither pattern matched)
      if (!error && !xpathError) {
        const { error: bareError } = checkBareXPathElement(declarator, filePath);
        if (bareError) {
          result.warnings.push(bareError);
        }
      }
    }
  });

  // Walk the AST for Task declarations: const X = Task(fn).as('Label') / const X = Task(fn)
  walk(ast, node => {
    if (node.type !== 'VariableDeclaration') return;
    for (const declarator of node.declarations) {
      const { task, error, warnings } = extractTask(declarator, filePath, source, declaredTaskNames);
      if (error) {
        result.warnings.push(error);
      }
      if (warnings) {
        result.warnings.push(...warnings);
      }
      if (task) {
        result.tasks.push(task);
        result.type = 'pom';
      }
    }
  });

  // Walk the AST for Test declarations: Test('name', fn)
  walk(ast, node => {
    if (node.type !== 'CallExpression') return;
    const callee = node.callee;
    if (!callee || callee.type !== 'Identifier') return;

    if (callee.name === 'Test') {
      const { test, error, warnings } = extractTest(node, filePath, source, declaredTaskNames);
      if (error) {
        result.warnings.push(error);
      }
      if (warnings) {
        result.warnings.push(...warnings);
      }
      if (test) {
        result.tests.push(test);
        result.type = 'test';
      }
      return false; // don't recurse into Test() arguments
    }
  });

  return result;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { parseFile, parseSource, extractElement, extractXPathElement, extractTask, extractTest, extractStep, extractElementRef, extractIfStep, extractCondition };
