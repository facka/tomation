'use strict';

/**
 * parser.js — AST parsing of element declarations and Task/Test/Automation calls from DSL source files.
 *
 * Uses acorn to parse each file and walks the resulting AST to find:
 *   - const X = is.TAG.where(matcher).as('Label') → element declarations
 *   - const X = Element(xpath).as('Label') → XPath element declarations
 *   - Task('name', fn) / Test('name', fn) → task/test declarations
 *   - Automation('name', fn) or const X = Automation('name', fn) → automation declarations
 *
 * Exported API:
 *   parseFile(filePath) → ParsedFile
 *   parseSource(source, filePath, rawSource?) → ParsedFile
 *
 * ParsedFile shape:
 * {
 *   filePath: string,
 *   type: 'pom' | 'test' | 'automation',
 *   elements: ElementDef[],  // element declarations
 *   tasks: TaskDef[],        // task declarations
 *   tests: TestDef[],        // test declarations
 *   automations: AutomationDef[], // automation declarations
 *   error: null | { message: string, line: number }
 *   warnings: Array<{ message: string, filePath: string, line: number }>
 * }
 *
 * Requirements: 12.5, 2.1, 2.2, 2.3, 2.4, 4.1, 5.1, 5.2, 6.1
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const ts = require('typescript');
const { stripTypes } = require('./ts-stripper.js');
const { resolveSpecifier } = require('./resolver.js');

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
// Const object resolution (enum-style patterns)
// Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
// ---------------------------------------------------------------------------

/**
 * Walk the AST and collect top-level `const X = { key: 'literal', ... }` declarations.
 * Only includes objects whose property values are string/number/boolean literals.
 *
 * @param {object} ast - parsed AST (acorn Program node)
 * @returns {object} constBindings map: { varName: { propName: literalValue, ... }, ... }
 */
function buildConstBindings(ast) {
  const bindings = {};

  walk(ast, node => {
    if (node.type !== 'VariableDeclaration') return;
    if (node.kind !== 'const') return;

    for (const declarator of node.declarations) {
      if (!declarator || declarator.type !== 'VariableDeclarator') continue;
      if (!declarator.id || declarator.id.type !== 'Identifier') continue;
      if (!declarator.init) continue;

      // Handle `as const` assertion: the init might be a TSAsExpression wrapping ObjectExpression
      // After type stripping, `as const` is removed, so init should be plain ObjectExpression
      const initNode = declarator.init;
      if (initNode.type !== 'ObjectExpression') continue;

      const varName = declarator.id.name;
      const obj = {};
      let hasLiterals = false;

      for (const prop of initNode.properties) {
        if (prop.type !== 'Property') continue;
        const key = prop.key.type === 'Identifier' ? prop.key.name
                   : prop.key.type === 'Literal' ? String(prop.key.value)
                   : null;
        if (!key) continue;

        const val = extractString(prop.value)
                 ?? extractNumber(prop.value)
                 ?? extractBoolean(prop.value);
        if (val !== null && val !== undefined) {
          obj[key] = val;
          hasLiterals = true;
        }
      }

      if (hasLiterals) {
        bindings[varName] = obj;
      }
    }
  });

  // Also extract TypeScript enum IIFE patterns:
  // var EnumName; (function(EnumName) { EnumName["Key"] = "value"; ... })(EnumName || (EnumName = {}));
  const enumBindings = buildEnumBindings(ast);
  for (const key of Object.keys(enumBindings)) {
    if (!(key in bindings)) {
      bindings[key] = enumBindings[key];
    }
  }

  return bindings;
}

/**
 * Detect transpiled TypeScript enum IIFE patterns and extract their key-value pairs.
 * After ts.transpileModule, `enum X { A = 'a', B = 'b' }` becomes:
 *   var X; (function(X) { X["A"] = "a"; X["B"] = "b"; })(X || (X = {}));
 *
 * @param {object} ast - parsed AST (acorn Program node)
 * @returns {object} bindings map: { enumName: { memberName: literalValue, ... }, ... }
 */
function buildEnumBindings(ast) {
  const bindings = {};

  // First, collect all `var X;` declarations (uninitialized) as potential enum names
  const varDecls = new Set();
  walk(ast, node => {
    if (node.type !== 'VariableDeclaration') return;
    if (node.kind !== 'var') return;
    for (const declarator of node.declarations) {
      if (!declarator || declarator.type !== 'VariableDeclarator') continue;
      if (!declarator.id || declarator.id.type !== 'Identifier') continue;
      if (declarator.init) continue; // must be uninitialized: `var X;`
      varDecls.add(declarator.id.name);
    }
  });

  // Then find IIFE call expressions: (function(X) { ... })(X || (X = {}))
  walk(ast, node => {
    if (node.type !== 'ExpressionStatement') return;
    const expr = node.expression;
    if (!expr || expr.type !== 'CallExpression') return;
    const callee = expr.callee;
    if (!callee || callee.type !== 'FunctionExpression') return;
    if (!callee.params || callee.params.length !== 1) return;
    const paramNode = callee.params[0];
    if (!paramNode || paramNode.type !== 'Identifier') return;
    const enumName = paramNode.name;

    // The argument should be `X || (X = {})` or just `X`
    if (!expr.arguments || expr.arguments.length !== 1) return;
    const arg = expr.arguments[0];
    let matchesEnum = false;
    if (arg.type === 'LogicalExpression' && arg.operator === '||') {
      // left should be Identifier with same name
      if (arg.left && arg.left.type === 'Identifier' && arg.left.name === enumName) {
        matchesEnum = true;
      }
    } else if (arg.type === 'Identifier' && arg.name === enumName) {
      matchesEnum = true;
    } else if (arg.type === 'AssignmentExpression' && arg.left && arg.left.type === 'Identifier' && arg.left.name === enumName) {
      matchesEnum = true;
    }

    if (!matchesEnum) return;
    if (!varDecls.has(enumName)) return;

    // Extract assignments: EnumName["Key"] = "value" or EnumName.Key = "value"
    const body = callee.body;
    if (!body || body.type !== 'BlockStatement') return;

    const obj = {};
    let hasEntries = false;

    for (const stmt of body.body) {
      if (stmt.type !== 'ExpressionStatement') continue;
      const assignExpr = stmt.expression;
      if (!assignExpr || assignExpr.type !== 'AssignmentExpression') continue;
      if (assignExpr.operator !== '=') continue;

      // Left side: EnumName["Key"] or EnumName.Key
      const left = assignExpr.left;
      if (!left || left.type !== 'MemberExpression') continue;
      if (!left.object || left.object.type !== 'Identifier' || left.object.name !== enumName) continue;

      let memberKey = null;
      if (left.computed && left.property && left.property.type === 'Literal') {
        memberKey = String(left.property.value);
      } else if (!left.computed && left.property && left.property.type === 'Identifier') {
        memberKey = left.property.name;
      }
      if (!memberKey) continue;

      // Right side: literal value
      const right = assignExpr.right;
      const val = extractString(right) ?? extractNumber(right) ?? extractBoolean(right);
      if (val !== null && val !== undefined) {
        obj[memberKey] = val;
        hasEntries = true;
      }
    }

    if (hasEntries) {
      bindings[enumName] = obj;
    }
  });

  return bindings;
}

/**
 * Resolve a MemberExpression AST node against constBindings.
 * Returns the literal value if the expression references a known const object property,
 * or null if unresolvable.
 *
 * @param {object} node - MemberExpression AST node
 * @param {object} constBindings - map from buildConstBindings()
 * @param {string} filePath - current file path for error reporting
 * @param {Array} warnings - mutable warnings array
 * @returns {string|number|boolean|null} resolved literal value, or null
 */
function resolveConstMemberExpression(node, constBindings, filePath, warnings) {
  if (!node || node.type !== 'MemberExpression') return null;
  if (!node.object || node.object.type !== 'Identifier') return null;
  if (!node.property || node.property.type !== 'Identifier') return null;

  const objName = node.object.name;
  const propName = node.property.name;

  if (!(objName in constBindings)) return null;

  const binding = constBindings[objName];
  if (propName in binding) {
    return binding[propName];
  }

  // Property doesn't exist on the tracked const object — validation error
  const line = lineOf(node);
  warnings.push({
    message: `Unknown property "${propName}" on const object "${objName}" at ${filePath}:${line}`,
    filePath,
    line,
  });
  return null;
}

// ---------------------------------------------------------------------------
// Data template extraction (Data() / Fake.* declarations)
// Requirements: 1.2, 1.3, 10.1, 10.2, 10.3, 10.5
// ---------------------------------------------------------------------------

/**
 * Parse the ObjectExpression argument of a Data() call into a template structure.
 * For each property:
 *   - Fake.method(options) → { type: "fake", method, options }
 *   - Literal (string/number/boolean) → inline value
 *   - Nested ObjectExpression → recurse
 *
 * @param {object} objNode - ObjectExpression AST node
 * @param {object} [constBindings] - const object bindings map for member expression resolution
 * @param {string} [filePath] - current file path for error reporting
 * @param {Array} [warnings] - mutable warnings array
 * @returns {object|null} parsed template object, or null if not an ObjectExpression
 */
function parseDataTemplate(objNode, constBindings, filePath, warnings) {
  if (!objNode || objNode.type !== 'ObjectExpression') return null;
  if (!constBindings) constBindings = {};
  if (!warnings) warnings = [];

  const template = {};

  for (const prop of objNode.properties) {
    if (prop.type !== 'Property') continue;

    // Extract property key
    const key = prop.key.type === 'Identifier' ? prop.key.name
               : prop.key.type === 'Literal' ? String(prop.key.value)
               : null;
    if (!key) continue;

    const value = prop.value;

    // Case 1: Fake.method(options) — CallExpression with MemberExpression callee
    if (
      value.type === 'CallExpression' &&
      value.callee &&
      value.callee.type === 'MemberExpression' &&
      value.callee.object &&
      value.callee.object.type === 'Identifier' &&
      value.callee.object.name === 'Fake' &&
      value.callee.property &&
      value.callee.property.type === 'Identifier'
    ) {
      const method = value.callee.property.name;
      const args = value.arguments || [];
      let options = {};

      if (args.length > 0) {
        const firstArg = args[0];

        // Fake.oneOf(array) — ArrayExpression → { values: [...] }
        if (method === 'oneOf' && firstArg.type === 'ArrayExpression') {
          const values = [];
          for (const elem of firstArg.elements) {
            const str = extractString(elem);
            if (str !== null) {
              values.push(str);
            } else if (elem && elem.type === 'MemberExpression') {
              // Resolve const member expression (e.g., BloodType.APositive)
              const resolved = resolveConstMemberExpression(elem, constBindings, filePath || '', warnings);
              if (resolved !== null) {
                values.push(String(resolved));
              }
            }
          }
          options = { values };
        }
        // Fake.address(part) — string arg → { part: value }
        else if (method === 'address') {
          const str = extractString(firstArg);
          if (str !== null) {
            options = { part: str };
          }
        }
        // Fake.firstName(gender) / Fake.fullName(gender) — string arg → { gender: value }
        else if (method === 'firstName' || method === 'fullName') {
          const str = extractString(firstArg);
          if (str !== null) {
            options = { gender: str };
          }
        }
        // Object args (dateOfBirth, phone, number, etc.) — extract simple object
        else if (firstArg.type === 'ObjectExpression') {
          options = extractSimpleObject(firstArg) || {};
        }
      }

      template[key] = { type: 'fake', method, options };
      continue;
    }

    // Case 2: Literal values (string, number, boolean) — emit inline
    if (value.type === 'Literal') {
      if (typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean') {
        template[key] = value.value;
        continue;
      }
    }

    // Case 3: Nested ObjectExpression — recurse
    if (value.type === 'ObjectExpression') {
      const nested = parseDataTemplate(value, constBindings, filePath, warnings);
      if (nested !== null) {
        template[key] = nested;
      }
      continue;
    }
  }

  return template;
}

/**
 * Detect a `const X = Data({...})` variable declaration and parse it into a data template.
 *
 * @param {object} declarator - VariableDeclarator AST node
 * @param {object} [constBindings] - const object bindings map for member expression resolution
 * @param {string} [filePath] - current file path for error reporting
 * @param {Array} [warnings] - mutable warnings array
 * @returns {{ name: string, template: object }|null} parsed data declaration, or null if not a match
 */
function parseDataDeclaration(declarator, constBindings, filePath, warnings) {
  if (!declarator || declarator.type !== 'VariableDeclarator') return null;
  if (!declarator.init) return null;

  // Check if init is a CallExpression with callee.name === 'Data'
  if (declarator.init.type !== 'CallExpression') return null;
  if (!declarator.init.callee || declarator.init.callee.type !== 'Identifier') return null;
  if (declarator.init.callee.name !== 'Data') return null;

  // Extract the variable name
  const varName = declarator.id && declarator.id.type === 'Identifier' ? declarator.id.name : null;
  if (!varName) return null;

  // Extract the first argument as an ObjectExpression
  const args = declarator.init.arguments || [];
  if (args.length < 1) return null;

  const objArg = args[0];
  if (objArg.type !== 'ObjectExpression') return null;

  // Parse the template structure
  const template = parseDataTemplate(objArg, constBindings, filePath, warnings);
  if (!template) return null;

  // Extract optional second argument for options (e.g., { seed: 42 })
  var seed = undefined;
  if (args.length >= 2 && args[1] && args[1].type === 'ObjectExpression') {
    var optionsProps = args[1].properties || [];
    for (var oi = 0; oi < optionsProps.length; oi++) {
      var prop = optionsProps[oi];
      if (prop.type === 'Property' && prop.key && prop.key.type === 'Identifier' && prop.key.name === 'seed') {
        if (prop.value && prop.value.type === 'Literal' && typeof prop.value.value === 'number') {
          seed = prop.value.value;
        }
      }
    }
  }

  var result = { name: varName, template: template };
  if (seed !== undefined) result.seed = seed;
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
 * @param {Array} [warnings] - mutable warnings array
 * @param {string} [filePath] - current file path for warning messages
 * @param {object} [constBindings] - const/enum bindings map for resolving member expressions
 * @returns {object} where descriptor or empty object
 */
function extractMatcherCall(callNode, warnings, filePath, constBindings) {
  if (!callNode || callNode.type !== 'CallExpression') return {};
  const callee = callNode.callee;
  const calleeName = callee.type === 'Identifier' ? callee.name : null;
  if (!calleeName) return {};

  if (!warnings) warnings = [];
  if (!constBindings) constBindings = {};
  const args = callNode.arguments;
  const line = lineOf(callNode);

  // Helper: resolve a string from a literal or a const/enum member expression
  function resolveString(node) {
    const lit = extractString(node);
    if (lit !== null) return lit;
    const resolved = resolveConstMemberExpression(node, constBindings, filePath, warnings);
    return typeof resolved === 'string' ? resolved : null;
  }

  // --- Special-shape matchers ---

  // 0-arg: isDisabled
  if (calleeName === 'isDisabled') {
    if (args.length > 0) {
      warnings.push({
        message: `'isDisabled' accepts zero arguments at ${filePath}:${line}`,
        filePath,
        line,
      });
    }
    return { isDisabled: true };
  }

  // Numeric-arg: nthChild
  if (calleeName === 'nthChild') {
    const n = extractNumber(args[0]);
    if (n === null || !Number.isInteger(n) || n < 1) {
      warnings.push({
        message: `'nthChild' requires a positive integer argument at ${filePath}:${line}`,
        filePath,
        line,
      });
      return {};
    }
    return { nthChild: n };
  }

  // 2-arg string: dataAttr
  if (calleeName === 'dataAttr') {
    const name = resolveString(args[0]);
    const val = resolveString(args[1]);
    if (name === null || val === null) {
      warnings.push({
        message: `'dataAttr' requires two string arguments at ${filePath}:${line}`,
        filePath,
        line,
      });
      return {};
    }
    if (name.startsWith('data-')) {
      warnings.push({
        message: `'dataAttr' name should be the suffix only (e.g., 'testid' not 'data-testid') at ${filePath}:${line}`,
        filePath,
        line,
      });
    }
    return { dataAttr: { name: name, value: val } };
  }

  // 2-arg string: closestLabelIs
  if (calleeName === 'closestLabelIs') {
    const tag = resolveString(args[0]);
    const text = resolveString(args[1]);
    if (tag === null || text === null) {
      warnings.push({
        message: `'closestLabelIs' requires two string arguments at ${filePath}:${line}`,
        filePath,
        line,
      });
      return {};
    }
    return { closestLabel: { tag: tag, text: text } };
  }

  // --- Standard 1-arg string matchers ---
  const arg = resolveString(args[0]);
  if (arg === null) return {};

  const matcherMap = {
    innerTextIs: 'textIs',
    innerTextContains: 'textContains',
    classIncludes: 'classIncludes',
    placeholderIs: 'placeholder',
    nameIs: 'name',
    typeIs: 'type',
    idIs: 'id',
    // New single-arg matchers
    valueIs: 'value',
    ariaLabel: 'ariaLabel',
    roleIs: 'role',
    titleIs: 'title',
    hrefContains: 'hrefContains',
  };

  const key = matcherMap[calleeName];
  if (!key) return {};
  return { [key]: arg };
}

/**
 * Extract an ElementDef from a VariableDeclarator node matching the pattern:
 *   const X = is.TAG.where(matcher).as('Label')
 *   const X = is.TAG.childOf(parent).where(matcher).as('Label')
 *   const X = is.TAG.navigate(path).as('Label')
 *   const X = is.TAG.as('Label')
 *
 * Walks the method chain from top to bottom: .as() → .where() → .childOf() → .navigate() → is.TAG
 *
 * @param {object} node - VariableDeclarator AST node
 * @param {string} filePath - current file path for error reporting
 * @param {Array} [warnings] - mutable warnings array for matcher extraction diagnostics
 * @param {object} [constBindings] - const/enum bindings map for resolving member expressions
 * @returns {{ element: object|null, error: object|null }}
 */
function extractElement(node, filePath, warnings, constBindings) {
  if (node.type !== 'VariableDeclarator') return { element: null, error: null };
  if (!node.init || node.init.type !== 'CallExpression') return { element: null, error: null };
  if (!warnings) warnings = [];

  let current = node.init;
  let label = null;
  let matchers = {};
  let childOf = null;
  let navigate = null;
  let tag = null;
  let whereCount = 0;

  // Step 1: Check for .as('Label') at the top
  if (!isMethodCall(current, 'as')) return { element: null, error: null };

  // Before validating the .as() argument, peek to see if this is an XPath pattern.
  // If the base is Element(...) or is.ELEMENT(...) anywhere in the chain, defer to extractXPathElement.
  var peekNode = current.callee.object;
  while (peekNode && peekNode.type === 'CallExpression') {
    var peekCallee = peekNode.callee;
    var isXPathPattern = (peekCallee && peekCallee.type === 'Identifier' && peekCallee.name === 'Element') ||
      (peekCallee && peekCallee.type === 'MemberExpression' &&
        peekCallee.object && peekCallee.object.type === 'Identifier' && peekCallee.object.name === 'is' &&
        peekCallee.property && peekCallee.property.type === 'Identifier' && peekCallee.property.name === 'ELEMENT');
    if (isXPathPattern) return { element: null, error: null };
    // Walk further down the chain
    if (peekCallee && peekCallee.type === 'MemberExpression' && peekCallee.object) {
      peekNode = peekCallee.object;
    } else {
      break;
    }
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
        matchers = extractMatcherCall(arg, warnings, filePath, constBindings);
      }
      current = current.callee.object;
    } else if (methodName === 'childOf') {
      const parentArg = current.arguments[0];
      if (parentArg && parentArg.type === 'Identifier') {
        childOf = parentArg.name;
      }
      current = current.callee.object;
    } else if (methodName === 'navigate') {
      const navArg = current.arguments[0];
      const navStr = extractString(navArg);
      if (navStr !== null) {
        navigate = navStr;
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

  if (navigate) {
    element.navigate = navigate;
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
  let childOf = null;
  let navigate = null;

  // Step 1: Check for .as('Label') at the top
  if (!isMethodCall(current, 'as')) return { element: null, error: null };

  // Extract .as() label
  const asArg = current.arguments[0];
  label = extractString(asArg);

  // Walk down the chain to find the base Element()/is.ELEMENT() call
  // handling .childOf() and .navigate() along the way
  current = current.callee.object;

  while (current && current.type === 'CallExpression') {
    const callee = current.callee;

    // Check if this is a method call (.childOf, .navigate, .where)
    if (callee && callee.type === 'MemberExpression' && callee.property) {
      const methodName = callee.property.name || (callee.property.value);

      if (methodName === 'childOf') {
        const childOfArg = current.arguments[0];
        if (childOfArg) {
          childOf = extractString(childOfArg) || (childOfArg.type === 'Identifier' ? childOfArg.name : null);
        }
        current = callee.object;
        continue;
      }

      if (methodName === 'navigate') {
        const navArg = current.arguments[0];
        if (navArg) {
          navigate = extractString(navArg);
        }
        current = callee.object;
        continue;
      }

      if (methodName === 'where') {
        // Skip .where() — XPath elements may have it for additional filtering
        current = callee.object;
        continue;
      }
    }

    // Check if current is Element(xpath) or is.ELEMENT(xpath)
    const baseCallee = current.callee;
    const isElementCall = baseCallee && baseCallee.type === 'Identifier' && baseCallee.name === 'Element';
    const isIsElementCall = baseCallee && baseCallee.type === 'MemberExpression' &&
      baseCallee.object && baseCallee.object.type === 'Identifier' && baseCallee.object.name === 'is' &&
      baseCallee.property && baseCallee.property.type === 'Identifier' && baseCallee.property.name === 'ELEMENT';

    if (isElementCall || isIsElementCall) {
      // Found the base — extract xpath argument
      const xpathArg = current.arguments[0];
      xpath = extractString(xpathArg);
      break;
    }

    // Not a recognized pattern
    return { element: null, error: null };
  }

  if (!xpath) {
    // Didn't find a valid Element()/is.ELEMENT() base
    if (label !== null) {
      // It had .as() but no valid xpath base — might be a different pattern
      return { element: null, error: null };
    }
    return { element: null, error: null };
  }

  if (label === null) {
    return {
      element: null,
      error: {
        message: `XPath element at ${filePath}:${lineOf(node)} missing label — call .as('Label') to name it`,
        filePath,
        line: lineOf(node),
      },
    };
  }

  const variableName = node.id && node.id.type === 'Identifier' ? node.id.name : null;
  if (!variableName) return { element: null, error: null };

  var element = {
    variableName,
    tag: '*',
    label,
    where: {},
    xpath,
    line: lineOf(node),
  };

  if (childOf) {
    element.childOf = childOf;
  }

  if (navigate) {
    element.navigate = navigate;
  }

  return { element, error: null };
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
function extractStringOrTemplate(node, dataTemplateVars, constBindings) {
  if (!node) return null;
  const plain = extractString(node);
  if (plain !== null) return plain;
  if (node.type === 'TemplateLiteral') return extractTemplateValue(node);
  // Handle variable references (e.g., destructured params) → template placeholder
  if (node.type === 'Identifier') return '{{' + node.name + '}}';
  // Handle params.X member access → {{X}} template placeholder
  // But first check for data template variable references → {{data.X.Y}}
  // And const/enum bindings → resolved literal
  if (
    node.type === 'MemberExpression' &&
    node.object && node.object.type === 'Identifier' &&
    node.property && node.property.type === 'Identifier'
  ) {
    // Context value reference: ctx.greeting → {{ctx.greeting}}
    if (node.object.name === 'ctx') {
      return '{{ctx.' + node.property.name + '}}';
    }
    if (dataTemplateVars && dataTemplateVars.has(node.object.name)) {
      return '{{data.' + node.object.name + '.' + node.property.name + '}}';
    }
    // Resolve const/enum member expressions (e.g., TechSkill.TypeScript → "TypeScript")
    if (constBindings && node.object.name in constBindings) {
      const resolved = constBindings[node.object.name][node.property.name];
      if (resolved !== null && resolved !== undefined) {
        return String(resolved);
      }
    }
    return '{{' + node.property.name + '}}';
  }
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

// ---------------------------------------------------------------------------
// Date helper and runtime template extraction
// ---------------------------------------------------------------------------

/**
 * Known day-offset helper names and their offsets (in days).
 */
const DAY_OFFSET_HELPERS = {
  today: 0,
  tomorrow: 1,
  yesterday: -1,
  nextWeek: 7,
  lastWeek: -7,
  nextMonth: 30,
  lastMonth: -30,
};

/**
 * Known month-boundary helper names and their boundary type.
 */
const MONTH_BOUNDARY_HELPERS = {
  firstDateOfMonth: 'first',
  lastDateOfMonth: 'last',
};

/**
 * Extract a date helper call descriptor from a CallExpression AST node.
 * Returns a descriptor object if the node is a recognized date helper call,
 * or null if it's not a date helper.
 *
 * @param {object} node - CallExpression AST node
 * @param {string} filePath - source file path for warnings
 * @param {Array} warnings - mutable warnings array
 * @returns {object|null} date helper descriptor or null
 */
function extractDateHelperCall(node, filePath, warnings) {
  if (!node || node.type !== 'CallExpression') return null;
  if (!node.callee || node.callee.type !== 'Identifier') return null;

  const name = node.callee.name;
  const args = node.arguments || [];
  const line = lineOf(node);

  // Day-offset helpers: today(), tomorrow(), yesterday(), nextWeek(), lastWeek(), nextMonth(), lastMonth()
  if (name in DAY_OFFSET_HELPERS) {
    const descriptor = {
      type: 'dateHelper',
      kind: 'dayOffset',
      offset: DAY_OFFSET_HELPERS[name],
    };

    if (args.length > 1) {
      warnings.push({
        message: `'${name}' accepts at most 1 argument at ${filePath}:${line}`,
        filePath,
        line,
      });
    }

    if (args.length >= 1) {
      const formatArg = args[0];
      if (formatArg.type === 'Literal' && typeof formatArg.value === 'string') {
        descriptor.format = formatArg.value;
      } else if (formatArg.type === 'TemplateLiteral' && formatArg.expressions.length === 0) {
        // Simple backtick string with no expressions
        descriptor.format = formatArg.quasis[0].value.cooked;
      } else {
        warnings.push({
          message: `Date helper '${name}' format argument must be a string at ${filePath}:${line}`,
          filePath,
          line,
        });
      }
    }

    return descriptor;
  }

  // Month-boundary helpers: firstDateOfMonth(offset, format?), lastDateOfMonth(offset, format?)
  if (name in MONTH_BOUNDARY_HELPERS) {
    const descriptor = {
      type: 'dateHelper',
      kind: 'monthBoundary',
      boundary: MONTH_BOUNDARY_HELPERS[name],
      monthOffset: 0,
    };

    if (args.length > 2) {
      warnings.push({
        message: `'${name}' accepts at most 2 arguments at ${filePath}:${line}`,
        filePath,
        line,
      });
    }

    if (args.length === 0) {
      warnings.push({
        message: `'${name}' requires an integer offset argument at ${filePath}:${line}`,
        filePath,
        line,
      });
    } else {
      const offsetArg = args[0];
      if (offsetArg.type === 'Literal' && typeof offsetArg.value === 'number' && Number.isInteger(offsetArg.value)) {
        descriptor.monthOffset = offsetArg.value;
      } else if (offsetArg.type === 'UnaryExpression' && offsetArg.operator === '-' &&
                 offsetArg.argument && offsetArg.argument.type === 'Literal' &&
                 typeof offsetArg.argument.value === 'number' && Number.isInteger(offsetArg.argument.value)) {
        descriptor.monthOffset = -offsetArg.argument.value;
      } else {
        warnings.push({
          message: `'${name}' first argument must be an integer at ${filePath}:${line}`,
          filePath,
          line,
        });
      }
    }

    if (args.length >= 2) {
      const formatArg = args[1];
      if (formatArg.type === 'Literal' && typeof formatArg.value === 'string') {
        descriptor.format = formatArg.value;
      } else if (formatArg.type === 'TemplateLiteral' && formatArg.expressions.length === 0) {
        descriptor.format = formatArg.quasis[0].value.cooked;
      } else {
        warnings.push({
          message: `Date helper '${name}' format argument must be a string at ${filePath}:${line}`,
          filePath,
          line,
        });
      }
    }

    return descriptor;
  }

  return null;
}

/**
 * Extract a runtime template descriptor from a TemplateLiteral AST node
 * that has one or more expressions. Builds a `parts` array that interleaves
 * static string segments with expression descriptors.
 *
 * @param {object} node - TemplateLiteral AST node
 * @param {string} filePath - source file path for warnings
 * @param {Array} warnings - mutable warnings array
 * @returns {object} runtime template descriptor
 */
function extractRuntimeTemplate(node, filePath, warnings) {
  const parts = [];

  for (let i = 0; i < node.quasis.length; i++) {
    // Add the static string segment
    parts.push(node.quasis[i].value.cooked);

    if (i < node.expressions.length) {
      const expr = node.expressions[i];

      if (expr.type === 'Identifier') {
        // Parameter reference: ${username}
        parts.push({ type: 'param', name: expr.name });
      } else if (expr.type === 'CallExpression' && expr.callee && expr.callee.type === 'Identifier') {
        // Possible date helper call: ${tomorrow()}
        const dateDescriptor = extractDateHelperCall(expr, filePath, warnings);
        if (dateDescriptor) {
          parts.push(dateDescriptor);
        } else {
          // Unrecognized function call in template
          warnings.push({
            message: `Unknown function '${expr.callee.name}' in value position at ${filePath}:${lineOf(expr)}`,
            filePath,
            line: lineOf(expr),
          });
          parts.push({ type: 'param', name: expr.callee.name + '()' });
        }
      } else if (expr.type === 'BinaryExpression' && ['+', '-', '*', '/'].includes(expr.operator)) {
        // Arithmetic expression: ${count + 1}
        parts.push({ type: 'expression', source: reconstructSource(expr) });
      } else {
        // Unsupported expression type
        warnings.push({
          message: `Unsupported expression type in template at ${filePath}:${lineOf(expr)}`,
          filePath,
          line: lineOf(expr),
        });
        parts.push({ type: 'param', name: reconstructSource(expr) });
      }
    }
  }

  return { type: 'runtimeTemplate', parts };
}

/**
 * Reconstruct source text from a simple expression AST node.
 * Handles identifiers, literals, binary expressions, and unary expressions.
 *
 * @param {object} node - AST expression node
 * @returns {string} reconstructed source text
 */
function reconstructSource(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal') return String(node.raw || node.value);
  if (node.type === 'UnaryExpression') {
    return node.operator + reconstructSource(node.argument);
  }
  if (node.type === 'BinaryExpression') {
    return reconstructSource(node.left) + ' ' + node.operator + ' ' + reconstructSource(node.right);
  }
  if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Identifier') {
    const args = (node.arguments || []).map(a => reconstructSource(a)).join(', ');
    return node.callee.name + '(' + args + ')';
  }
  return '?';
}

/**
 * Extract a value expression from an AST node in a DSL value position.
 * Handles: string literals, template literals (with/without expressions),
 * date helper calls, identifier references, and const member expressions.
 *
 * Returns either a plain string (for string literals and zero-expression templates),
 * a descriptor object (for date helpers and runtime templates), or null.
 *
 * @param {object} node - AST node
 * @param {string} filePath - source file path for warnings
 * @param {Array} warnings - mutable warnings array
 * @param {object} [constBindings] - const object bindings map for member expression resolution
 * @returns {string|object|null} plain string, descriptor object, or null
 */
function extractValueExpression(node, filePath, warnings, constBindings, dataTemplateVars) {
  if (!node) return null;

  // Plain string literal
  const plain = extractString(node);
  if (plain !== null) return plain;

  // Template literal
  if (node.type === 'TemplateLiteral') {
    // Zero expressions → plain string
    if (node.expressions.length === 0) {
      return node.quasis[0].value.cooked;
    }
    // One or more expressions → runtime template descriptor
    return extractRuntimeTemplate(node, filePath, warnings);
  }

  // Date helper call expression
  if (node.type === 'CallExpression') {
    const dateDescriptor = extractDateHelperCall(node, filePath, warnings);
    if (dateDescriptor) return dateDescriptor;

    // Unrecognized function call in value position
    if (node.callee && node.callee.type === 'Identifier') {
      warnings.push({
        message: `Unknown function '${node.callee.name}' in value position at ${filePath}:${lineOf(node)}`,
        filePath,
        line: lineOf(node),
      });
    }
    return null;
  }

  // Identifier reference (e.g., destructured param variable)
  if (node.type === 'Identifier') return '{{' + node.name + '}}';

  // MemberExpression: check for ctx FIRST, then data template vars, then const object resolution, then fall back to param reference
  if (
    node.type === 'MemberExpression' &&
    node.object && node.object.type === 'Identifier' &&
    node.property && node.property.type === 'Identifier'
  ) {
    // Context value reference: ctx.greeting → {{ctx.greeting}}
    if (node.object.name === 'ctx') {
      return '{{ctx.' + node.property.name + '}}';
    }
    // Data template variable reference: user.name → {{data.user.name}}
    if (dataTemplateVars && dataTemplateVars.has(node.object.name)) {
      return '{{data.' + node.object.name + '.' + node.property.name + '}}';
    }
    // Try const object resolution if constBindings provided
    if (constBindings && node.object.name in constBindings) {
      const resolved = resolveConstMemberExpression(node, constBindings, filePath, warnings);
      if (resolved !== null) {
        return String(resolved);
      }
      // If resolution returned null, it already pushed a warning — fall through
      return null;
    }
    // Not a const binding — treat as param reference (e.g., params.email → {{email}})
    return '{{' + node.property.name + '}}';
  }

  return null;
}

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

function extractStep(exprNode, filePath, declaredTaskNames, warnings, constBindings, dataTemplateVars) {
  if (!exprNode) return null;
  if (!warnings) warnings = [];
  if (!constBindings) constBindings = {};

  // Pattern: SaveText(el).as(key) / SaveAttribute(el, attr).as(key) / SaveValue(el).as(key) / Save(expr).as(key)
  // AST shape: CallExpression with callee being MemberExpression (X.as) where X is a CallExpression
  if (
    exprNode.type === 'CallExpression' &&
    exprNode.callee &&
    exprNode.callee.type === 'MemberExpression' &&
    exprNode.callee.property &&
    exprNode.callee.property.type === 'Identifier' &&
    exprNode.callee.property.name === 'as'
  ) {
    const innerCall = exprNode.callee.object;
    if (innerCall && innerCall.type === 'CallExpression' && innerCall.callee && innerCall.callee.type === 'Identifier') {
      const fnName = innerCall.callee.name;
      if (fnName === 'SaveText' || fnName === 'SaveAttribute' || fnName === 'SaveValue' || fnName === 'Save') {
        // Validate .as(key) argument
        const asArgs = exprNode.arguments;
        if (!asArgs || asArgs.length === 0) {
          warnings.push({
            message: `context key name is required`,
            filePath,
            line: lineOf(exprNode),
          });
          return null;
        }
        const keyNode = asArgs[0];
        const keyName = extractString(keyNode);
        if (keyName === null) {
          warnings.push({
            message: `context key name is required`,
            filePath,
            line: lineOf(exprNode),
          });
          return null;
        }
        if (keyName === '') {
          warnings.push({
            message: `context key name must be non-empty`,
            filePath,
            line: lineOf(exprNode),
          });
          return null;
        }

        if (fnName === 'SaveText') {
          const target = extractElementRef(innerCall.arguments[0]);
          if (target === null) return null;
          return { action: 'saveText', target, contextKey: keyName };
        }

        if (fnName === 'SaveAttribute') {
          const target = extractElementRef(innerCall.arguments[0]);
          if (target === null) return null;
          const attrName = extractString(innerCall.arguments[1]);
          if (attrName === null) return null;
          return { action: 'saveAttribute', target, attributeName: attrName, contextKey: keyName };
        }

        if (fnName === 'SaveValue') {
          const target = extractElementRef(innerCall.arguments[0]);
          if (target === null) return null;
          return { action: 'saveValue', target, contextKey: keyName };
        }

        if (fnName === 'Save') {
          const exprArg = innerCall.arguments[0];
          if (!exprArg) {
            warnings.push({
              message: `Save() requires an expression argument`,
              filePath,
              line: lineOf(innerCall),
            });
            return null;
          }
          const value = extractValueExpression(exprArg, filePath, warnings, constBindings, dataTemplateVars);
          if (value === null) {
            warnings.push({
              message: `Save() argument must be a string, date helper, or template literal at ${filePath}:${lineOf(exprArg)}`,
              filePath,
              line: lineOf(exprArg),
            });
            return null;
          }
          return { action: 'saveExpression', value, key: keyName };
        }
      }
    }
  }

  // Pattern: Bare SaveText/SaveAttribute/SaveValue/Save without .as() chain — emit warning
  if (
    exprNode.type === 'CallExpression' &&
    exprNode.callee &&
    exprNode.callee.type === 'Identifier'
  ) {
    const bareName = exprNode.callee.name;
    if (bareName === 'SaveText' || bareName === 'SaveAttribute' || bareName === 'SaveValue' || bareName === 'Save') {
      warnings.push({
        message: `context key name is required`,
        filePath,
        line: lineOf(exprNode),
      });
      return null;
    }
  }

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
        const value = extractValueExpression(valueArg, filePath, warnings, constBindings, dataTemplateVars);
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
          const params = extractTaskInvocationParams(paramsArg, dataTemplateVars, constBindings);
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
          const value = extractValueExpression(args[1], filePath, warnings, constBindings, dataTemplateVars);
          return { action: 'assertHasText', target, value: value !== null ? value : '' };
        }

        // Value-only: Navigate(url)
        case 'Navigate': {
          const url = extractValueExpression(args[0], filePath, warnings, constBindings, dataTemplateVars);
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
          const description = extractValueExpression(args[0], filePath, warnings, constBindings, dataTemplateVars);
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
            const params = extractTaskInvocationParams(args[0], dataTemplateVars, constBindings);
            if (params && Object.keys(params).length > 0) step.params = params;
            return step;
          }
          // Any other argument form (e.g., bare Identifier like login(params))
          // is not supported — fall through to null which triggers warning upstream
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
function extractTaskInvocationParams(objNode, dataTemplateVars, constBindings) {
  if (!objNode || objNode.type !== 'ObjectExpression') return {};
  const params = {};
  for (const prop of objNode.properties) {
    if (prop.type !== 'Property') continue;
    const key = prop.key.type === 'Identifier' ? prop.key.name
               : prop.key.type === 'Literal' ? String(prop.key.value)
               : null;
    if (!key) continue;

    // Try string/template, then number, then boolean
    const strVal = extractStringOrTemplate(prop.value, dataTemplateVars, constBindings);
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
 * Resolves identifiers against tracked destructured params, and
 * recognizes ctx.keyName member expressions for context-based conditions.
 *
 * Supported patterns:
 *   if (paramName)              → { param: "paramName", op: "truthy" }
 *   if (!paramName)             → { param: "paramName", op: "falsy" }
 *   if (paramName === 'val')    → { param: "paramName", op: "equals", value: "val" }
 *   if (paramName !== 'val')    → { param: "paramName", op: "notEquals", value: "val" }
 *   if (paramName == true)      → { param: "paramName", op: "truthy" }
 *   if (paramName === true)     → { param: "paramName", op: "truthy" }
 *   if (paramName == false)     → { param: "paramName", op: "falsy" }
 *   if (paramName === false)    → { param: "paramName", op: "falsy" }
 *   if (paramName !== true)     → { param: "paramName", op: "falsy" }
 *   if (paramName != true)      → { param: "paramName", op: "falsy" }
 *   if (paramName !== false)    → { param: "paramName", op: "truthy" }
 *   if (paramName != false)     → { param: "paramName", op: "truthy" }
 *   if (ctx.key)               → { source: "ctx", key: "key", op: "truthy" }
 *   if (!ctx.key)              → { source: "ctx", key: "key", op: "falsy" }
 *   if (ctx.key === 'value')   → { source: "ctx", key: "key", op: "equals", value: "value" }
 *   if (ctx.key !== 'value')   → { source: "ctx", key: "key", op: "notEquals", value: "value" }
 *   if (ctx.key == true)       → { source: "ctx", key: "key", op: "truthy" }
 *   if (ctx.key == false)      → { source: "ctx", key: "key", op: "falsy" }
 *
 * @param {object} testNode - the `test` property of an IfStatement AST node
 * @param {Set<string>} trackedParams - set of known param names from destructuring
 * @returns {object|null} condition object or null if pattern is unsupported
 */
function extractCondition(testNode, trackedParams) {
  if (!testNode) return null;

  // --- Helper: check if a node is a ctx.keyName MemberExpression ---
  function getCtxKey(node) {
    if (
      node &&
      node.type === 'MemberExpression' &&
      node.object &&
      node.object.type === 'Identifier' &&
      node.object.name === 'ctx' &&
      node.property &&
      node.property.type === 'Identifier'
    ) {
      return node.property.name;
    }
    return null;
  }

  // --- Helper: resolve a node to a param name. Accepts a bare tracked
  // identifier (e.g., `unreviewed`) or a `params.X` member expression
  // (consistent with how value expressions treat params.X → {{X}}).
  function getParamName(node) {
    if (!node) return null;
    if (node.type === 'Identifier' && trackedParams.has(node.name)) {
      return node.name;
    }
    if (
      node.type === 'MemberExpression' &&
      node.object && node.object.type === 'Identifier' &&
      node.object.name === 'params' &&
      node.property && node.property.type === 'Identifier'
    ) {
      return node.property.name;
    }
    return null;
  }

  // Pattern: ctx.key (truthy)
  var ctxKey = getCtxKey(testNode);
  if (ctxKey) {
    return { source: 'ctx', key: ctxKey, op: 'truthy' };
  }

  // Pattern: paramName / params.X (truthy)
  var truthyParam = getParamName(testNode);
  if (truthyParam) {
    return { param: truthyParam, op: 'truthy' };
  }

  // Pattern: !ctx.key (falsy) or !paramName / !params.X (falsy)
  if (
    testNode.type === 'UnaryExpression' &&
    testNode.operator === '!' &&
    testNode.argument
  ) {
    var negCtxKey = getCtxKey(testNode.argument);
    if (negCtxKey) {
      return { source: 'ctx', key: negCtxKey, op: 'falsy' };
    }
    var negParam = getParamName(testNode.argument);
    if (negParam) {
      return { param: negParam, op: 'falsy' };
    }
    return null;
  }

  // Pattern: paramName/params.X/ctx.key ===/==/!==/!= value (string or boolean)
  if (
    testNode.type === 'BinaryExpression' &&
    (testNode.operator === '===' || testNode.operator === '!==' ||
     testNode.operator === '==' || testNode.operator === '!=')
  ) {
    const isEquality = testNode.operator === '===' || testNode.operator === '==';

    // Determine if left side is a ctx.key or a param (bare or params.X)
    var binCtxKey = getCtxKey(testNode.left);
    var binParam = getParamName(testNode.left);

    // Must be either ctx.key or a param
    if (!binCtxKey && !binParam) return null;

    // Boolean literal on the right: treat as truthy/falsy
    const boolVal = extractBoolean(testNode.right);
    if (boolVal !== null) {
      const isTruthy = isEquality ? boolVal === true : boolVal === false;
      if (binCtxKey) {
        return { source: 'ctx', key: binCtxKey, op: isTruthy ? 'truthy' : 'falsy' };
      }
      return { param: binParam, op: isTruthy ? 'truthy' : 'falsy' };
    }

    // String literal on the right: equals/notEquals
    const right = extractString(testNode.right);
    if (right !== null) {
      if (binCtxKey) {
        return { source: 'ctx', key: binCtxKey, op: isEquality ? 'equals' : 'notEquals', value: right };
      }
      return {
        param: binParam,
        op: isEquality ? 'equals' : 'notEquals',
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
 * @param {object} [constBindings] - const object bindings map for member expression resolution
 * @returns {object|null} conditional step or null if condition is unsupported
 */
function extractIfStep(stmt, filePath, trackedParams, warnings, source, declaredTaskNames, constBindings, dataTemplateVars) {
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
  const thenSteps = body ? extractSteps(body, filePath, trackedParams, warnings, source, declaredTaskNames, constBindings, dataTemplateVars) : [];

  if (thenSteps.length === 0) return null;

  return { action: 'if', condition, then: thenSteps };
}

/**
 * Extract a conditional if-step from a When(condition, () => { ...steps }) call expression.
 * This is the functional-style equivalent of an if-block and produces the same
 * { action: 'if', condition, then } shape so it reuses all downstream machinery.
 *
 * @param {object} exprNode - CallExpression AST node for When(...)
 * @param {string} filePath - current file path for error reporting
 * @param {Set<string>} trackedParams - set of known param names from destructuring
 * @param {Array} warnings - array to push warnings into
 * @param {string} [source] - original source code for snippet extraction
 * @param {Set<string>} [declaredTaskNames] - task names declared in this file
 * @param {object} [constBindings] - const object bindings map
 * @param {Set<string>} [dataTemplateVars] - data template variable names
 * @returns {object|null} conditional step or null if the pattern is invalid
 */
function extractWhenStep(exprNode, filePath, trackedParams, warnings, source, declaredTaskNames, constBindings, dataTemplateVars) {
  if (!exprNode || exprNode.type !== 'CallExpression') return null;
  if (!exprNode.callee || exprNode.callee.type !== 'Identifier' || exprNode.callee.name !== 'When') return null;

  const args = exprNode.arguments || [];
  const conditionNode = args[0];
  const bodyNode = args[1];

  // Extract the condition (param- or ctx-based)
  const condition = extractCondition(conditionNode, trackedParams);
  if (!condition) {
    warnings.push({
      message: `Unsupported When() condition at ${filePath}:${lineOf(exprNode)} — only param/ctx truthiness or equality checks are allowed`,
      filePath,
      line: lineOf(exprNode),
    });
    return null;
  }

  // The second argument must be a function whose body holds the conditional steps
  if (
    !bodyNode ||
    (bodyNode.type !== 'ArrowFunctionExpression' && bodyNode.type !== 'FunctionExpression')
  ) {
    warnings.push({
      message: `When() requires a callback function as its second argument at ${filePath}:${lineOf(exprNode)}`,
      filePath,
      line: lineOf(exprNode),
    });
    return null;
  }

  // Function body may be a BlockStatement (() => { ... }) or a single expression (() => Click(x))
  let thenSteps = [];
  if (bodyNode.body && bodyNode.body.type === 'BlockStatement') {
    thenSteps = extractSteps(bodyNode.body, filePath, trackedParams, warnings, source, declaredTaskNames, constBindings, dataTemplateVars);
  } else if (bodyNode.body) {
    // Concise arrow body: () => Click(x) — wrap the single expression as a step
    const singleStep = extractStep(bodyNode.body, filePath, declaredTaskNames, warnings, constBindings, dataTemplateVars);
    if (singleStep) thenSteps = [singleStep];
  }

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
 * @param {object} [constBindings] - const object bindings map for member expression resolution
 * @returns {Array} array of step objects
 */
function extractSteps(body, filePath, trackedParams, warnings, source, declaredTaskNames, constBindings, dataTemplateVars) {
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
        message: `Unrecognized statement at ${filePath}:${lineOf(stmt)} — variable declaration is not a recognized element, task, or param destructuring pattern — skipped`,
        filePath,
        line: lineOf(stmt),
        source: snippet,
      });
      continue;
    }

    // Handle if-statements → conditional steps
    if (stmt.type === 'IfStatement') {
      const ifStep = extractIfStep(stmt, filePath, trackedParams, warnings, source, declaredTaskNames, constBindings, dataTemplateVars);
      if (ifStep) {
        steps.push(ifStep);
      }
      continue;
    }

    // Handle When(condition, () => {...}) → conditional step (functional if-block)
    if (
      stmt.type === 'ExpressionStatement' &&
      stmt.expression &&
      stmt.expression.type === 'CallExpression' &&
      stmt.expression.callee &&
      stmt.expression.callee.type === 'Identifier' &&
      stmt.expression.callee.name === 'When'
    ) {
      const whenStep = extractWhenStep(stmt.expression, filePath, trackedParams, warnings, source, declaredTaskNames, constBindings, dataTemplateVars);
      if (whenStep) {
        steps.push(whenStep);
      }
      continue;
    }

    // Process expression statements
    if (stmt.type === 'ExpressionStatement') {
      const step = extractStep(stmt.expression, filePath, declaredTaskNames, warnings, constBindings, dataTemplateVars);
      if (step) {
        steps.push(step);
      } else {
       // Recognized JS but not a known automation action — emit warning
        const snippet = source ? source.slice(stmt.expression.start, stmt.expression.end).split('\n')[0] : '';
        warnings.push({
          message: `Unrecognized statement at ${filePath}:${lineOf(stmt)} — expression '${snippet}' is not a recognized DSL action or task invocation — skipped`,
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
      message: `Unrecognized statement at ${filePath}:${lineOf(stmt)} — '${stmt.type}' is not a supported DSL construct (only variable declarations, expression statements, and if-statements are allowed) — skipped`,
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

// ---------------------------------------------------------------------------
// Automation param type extraction using TypeScript compiler API
// Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.9, 2.10
// ---------------------------------------------------------------------------

/**
 * Extract typed parameter metadata from the raw TypeScript source of an Automation declaration.
 *
 * Uses ts.createSourceFile() for fast single-file AST parsing (no type-checking) to locate
 * the Automation() call expression, find the function argument's params type annotation,
 * and map each property to a ParamDef.
 *
 * Type mapping:
 *   - StringKeyword → "string"
 *   - NumberKeyword → "number"
 *   - TypeReference with identifier "Date" → "date"
 *   - UnionType where all members are string literals → "enum" with options[]
 *   - Anything else → "string" with a warning
 *
 * @param {string} rawSource - The raw TypeScript source (before type stripping)
 * @param {string} filePath - File path for error reporting
 * @returns {{ params: Array<{name: string, type: string, optional?: boolean, options?: string[]}>, warnings: Array<{message: string, filePath: string, line: number}> }}
 */
function extractAutomationParamTypes(rawSource, filePath) {
  const result = { params: [], warnings: [] };

  // Parse the raw TypeScript source into an AST (fast, single-file, no type-checking)
  var sourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      rawSource,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS
    );
  } catch (e) {
    result.warnings.push({
      message: `Failed to parse TypeScript source for param extraction: ${e.message}`,
      filePath,
      line: 1,
    });
    return result;
  }

  // Find the Automation() call expression in the source
  var automationCall = null;
  function findAutomationCall(node) {
    if (automationCall) return; // already found

    // Match: Automation('name', fn)
    if (ts.isCallExpression(node)) {
      var callee = node.expression;

      // Pattern: Automation('name', fn) — callee is Identifier
      if (ts.isIdentifier(callee) && callee.text === 'Automation') {
        automationCall = node;
        return;
      }
    }

    ts.forEachChild(node, findAutomationCall);
  }

  findAutomationCall(sourceFile);

  if (!automationCall) {
    // No Automation call found — not necessarily an error (file might not contain one)
    return result;
  }

  // Get the second argument (the function) — first argument is the name string
  var args = automationCall.arguments;
  if (!args || args.length < 2) return result;

  var fnArg = args[1];
  if (!ts.isArrowFunction(fnArg) && !ts.isFunctionExpression(fnArg)) return result;

  // Get the first parameter of the function
  var fnParams = fnArg.parameters;
  if (!fnParams || fnParams.length < 1) return result;

  var firstParam = fnParams[0];

  // The param should have a type annotation (TypeLiteral or TypeReference)
  var typeNode = firstParam.type;
  if (!typeNode) return result;

  // Handle TypeLiteral: { email: string; count: number; ... }
  if (ts.isTypeLiteralNode(typeNode)) {
    for (var i = 0; i < typeNode.members.length; i++) {
      var member = typeNode.members[i];
      if (!ts.isPropertySignature(member)) continue;

      var paramName = member.name && ts.isIdentifier(member.name) ? member.name.text : null;
      if (!paramName) continue;

      var isOptional = !!member.questionToken;
      var paramDef = mapTypeNode(member.type, paramName, filePath, sourceFile, result.warnings);

      if (isOptional) {
        paramDef.optional = true;
      }

      result.params.push(paramDef);
    }
  }

  return result;
}

/**
 * Map a TypeScript type node to a ParamDef object.
 *
 * @param {ts.TypeNode|undefined} typeNode - The type node to map
 * @param {string} paramName - The parameter name (for the returned object)
 * @param {string} filePath - For warning messages
 * @param {ts.SourceFile} sourceFile - For line number extraction
 * @param {Array} warnings - Warnings accumulator
 * @returns {{ name: string, type: string, options?: string[] }}
 */
function mapTypeNode(typeNode, paramName, filePath, sourceFile, warnings) {
  if (!typeNode) {
    // No type annotation — default to string
    return { name: paramName, type: 'string' };
  }

  // string keyword
  if (typeNode.kind === ts.SyntaxKind.StringKeyword) {
    return { name: paramName, type: 'string' };
  }

  // number keyword
  if (typeNode.kind === ts.SyntaxKind.NumberKeyword) {
    return { name: paramName, type: 'number' };
  }

  // TypeReference — check for "Date"
  if (ts.isTypeReferenceNode(typeNode)) {
    var typeName = typeNode.typeName;
    if (ts.isIdentifier(typeName) && typeName.text === 'Date') {
      return { name: paramName, type: 'date' };
    }
    // Unknown type reference — fallback to string with warning
    var line = ts.getLineAndCharacterOfPosition(sourceFile, typeNode.getStart(sourceFile)).line + 1;
    var refName = ts.isIdentifier(typeName) ? typeName.text : 'unknown';
    warnings.push({
      message: `Unknown type annotation '${refName}' for param '${paramName}' at ${filePath}:${line} — defaulting to "string"`,
      filePath,
      line,
    });
    return { name: paramName, type: 'string' };
  }

  // Union type — check if all members are string literals → "enum"
  if (ts.isUnionTypeNode(typeNode)) {
    var members = typeNode.types;
    var allStringLiterals = true;
    var options = [];

    for (var j = 0; j < members.length; j++) {
      var memberType = members[j];
      if (ts.isLiteralTypeNode(memberType) && memberType.literal && ts.isStringLiteral(memberType.literal)) {
        options.push(memberType.literal.text);
      } else {
        allStringLiterals = false;
        break;
      }
    }

    if (allStringLiterals && options.length > 0) {
      return { name: paramName, type: 'enum', options: options };
    }

    // Union contains non-string-literal members — fallback to string with warning
    var unionLine = ts.getLineAndCharacterOfPosition(sourceFile, typeNode.getStart(sourceFile)).line + 1;
    warnings.push({
      message: `Union type for param '${paramName}' at ${filePath}:${unionLine} contains non-string-literal members — defaulting to "string"`,
      filePath,
      line: unionLine,
    });
    return { name: paramName, type: 'string' };
  }

  // Anything else — fallback to string with warning
  var fallbackLine = ts.getLineAndCharacterOfPosition(sourceFile, typeNode.getStart(sourceFile)).line + 1;
  warnings.push({
    message: `Unknown type annotation for param '${paramName}' at ${filePath}:${fallbackLine} — defaulting to "string"`,
    filePath,
    line: fallbackLine,
  });
  return { name: paramName, type: 'string' };
}

// ---------------------------------------------------------------------------
// Task extraction
// ---------------------------------------------------------------------------

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
function extractTask(declarator, filePath, source, declaredTaskNames, constBindings, dataTemplateVars) {
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
    ? extractSteps(fn.body, filePath, trackedParams, warnings, source, declaredTaskNames, constBindings, dataTemplateVars)
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
function extractTest(node, filePath, source, declaredTaskNames, constBindings, dataTemplateVars) {
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
    ? extractSteps(fn.body, filePath, new Set(), warnings, source, declaredTaskNames, constBindings, dataTemplateVars)
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
// Automation extraction
// Requirements: 2.1, 2.7, 2.8, 1.4
// ---------------------------------------------------------------------------

/**
 * Extract an AutomationDef from a VariableDeclarator node matching:
 *   const X = Automation('Label', fn)
 *
 * @param {object} declarator - VariableDeclarator AST node
 * @param {string} filePath - current file path for error reporting
 * @param {string} source - stripped JS source (for step extraction)
 * @param {string|null} rawSource - raw TypeScript source (for param type extraction)
 * @param {Set<string>} [declaredTaskNames] - task names declared in this file
 * @returns {{ automation: object|null, error: object|null, warnings: Array }}
 */
function extractAutomation(declarator, filePath, source, rawSource, declaredTaskNames, constBindings, dataTemplateVars) {
  if (!declarator || declarator.type !== 'VariableDeclarator') return { automation: null, error: null, warnings: [] };
  if (!declarator.init) return { automation: null, error: null, warnings: [] };

  var variableName = declarator.id && declarator.id.type === 'Identifier' ? declarator.id.name : null;
  if (!variableName) return { automation: null, error: null, warnings: [] };

  var automationCallNode = null;
  var label = null;

  // Pattern: Automation('name', fn) — direct call with name as first arg
  if (
    declarator.init.type === 'CallExpression' &&
    declarator.init.callee &&
    declarator.init.callee.type === 'Identifier' &&
    declarator.init.callee.name === 'Automation'
  ) {
    automationCallNode = declarator.init;
    // First argument is the label string
    if (automationCallNode.arguments && automationCallNode.arguments.length >= 1) {
      label = extractString(automationCallNode.arguments[0]);
    }
  }

  if (!automationCallNode) return { automation: null, error: null, warnings: [] };

  var warnings = [];

  // Validate function argument (second argument)
  var args = automationCallNode.arguments || [];
  if (args.length < 2) {
    return {
      automation: null,
      error: {
        message: `Automation() at ${filePath}:${lineOf(automationCallNode)} requires a name and a function argument`,
        filePath,
        line: lineOf(automationCallNode),
      },
      warnings,
    };
  }

  var fn = args[1];
  if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') {
    return {
      automation: null,
      error: {
        message: `Automation() at ${filePath}:${lineOf(automationCallNode)} second argument must be a function`,
        filePath,
        line: lineOf(automationCallNode),
      },
      warnings,
    };
  }

  // Extract param types from raw TypeScript source (before type stripping)
  var params = [];
  if (rawSource) {
    var paramResult = extractAutomationParamTypes(rawSource, filePath);
    params = paramResult.params;
    if (paramResult.warnings.length > 0) {
      warnings.push.apply(warnings, paramResult.warnings);
    }
  }

  // Build tracked params set for step extraction
  // Include params from type extraction (so params.X and destructured X both resolve)
  var trackedParams = new Set();
  for (var i = 0; i < params.length; i++) {
    trackedParams.add(params[i].name);
  }

  // Also extract destructured params from function signature (e.g., ({email, password}) => ...)
  var fnParams = extractFnParams(fn.params);
  for (var j = 0; j < fnParams.length; j++) {
    trackedParams.add(fnParams[j]);
  }

  // Extract steps from the function body
  var steps = fn.body && fn.body.type === 'BlockStatement'
    ? extractSteps(fn.body, filePath, trackedParams, warnings, source, declaredTaskNames, constBindings, dataTemplateVars)
    : [];

  // --- Validation warnings ---

  // Missing name argument (Req 7.1)
  if (!label) {
    warnings.push({
      message: `Automation '${variableName}' at ${filePath}:${lineOf(declarator)} is missing a name — a label string is required as the first argument`,
      filePath,
      line: lineOf(declarator),
    });
  }

  // Empty params object — zero params means this should be a Test (Req 7.2)
  if (params.length === 0) {
    warnings.push({
      message: `Automation '${variableName}' at ${filePath}:${lineOf(declarator)} has no parameters — consider using Test instead`,
      filePath,
      line: lineOf(declarator),
    });
  }

  // No recognizable steps in body (Req 7.4)
  if (steps.length === 0) {
    warnings.push({
      message: `Automation '${variableName}' at ${filePath}:${lineOf(declarator)} has no recognizable steps`,
      filePath,
      line: lineOf(declarator),
    });
  }

  return {
    automation: {
      name: variableName,
      label: label || null,
      params: params,
      steps: steps,
      line: lineOf(declarator),
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
 * @returns {'pom'|'test'|'automation'}
 */
function detectFileType(filePath) {
  if (filePath.endsWith('.pom.js') || filePath.endsWith('.pom.ts')) return 'pom';
  if (filePath.endsWith('.test.js') || filePath.endsWith('.test.ts')) return 'test';
  if (filePath.endsWith('.page.js') || filePath.endsWith('.page.ts')) return 'pom';
  if (filePath.endsWith('.automation.ts')) return 'automation';
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
 *   type: 'pom' | 'test' | 'automation',
 *   elements: ElementDef[],
 *   tasks: TaskDef[],
 *   tests: TestDef[],
 *   automations: AutomationDef[],
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
      automations: [],
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
 * @param {string} [rawSource] - raw TypeScript source (before type stripping) for Automation param extraction
 * @param {object} [options] - optional settings: { baseUrl: string } for ~/ alias resolution
 * @returns {ParsedFile}
 */
function parseSource(source, filePath, rawSource, options) {
  const parseOptions = options || {};
  const result = {
    filePath,
    type: detectFileType(filePath),
    tests: [],
    elements: [],
    tasks: [],
    automations: [],
    dataTemplates: [],  // Data() template declarations
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
  // Also tracks named imports for const object resolution
  walk(ast, node => {
    if (node.type !== 'ImportDeclaration') return;
    if (!node.source || typeof node.source.value !== 'string') return;
    var importPath = node.source.value;
    // Only track relative and ~/ imports (project-internal POM files)
    if (!importPath.startsWith('.') && !importPath.startsWith('~/')) return;
    // Extract import specifiers
    if (node.specifiers) {
      for (var si = 0; si < node.specifiers.length; si++) {
        var spec = node.specifiers[si];
        if (spec.type === 'ImportDefaultSpecifier' && spec.local && spec.local.name) {
          result.imports.push({
            localName: spec.local.name,
            importPath: importPath,
          });
        }
        // Named imports: import { BloodType, Gender } from '~/data/enums'
        if (spec.type === 'ImportSpecifier' && spec.local && spec.local.name) {
          result.imports.push({
            localName: spec.local.name,
            importPath: importPath,
            named: true,
          });
        }
      }
    }
  });

  // Build constBindings from local const object declarations
  const constBindings = buildConstBindings(ast);

  // Resolve imported const objects and enums from ~/paths
  // For each import (named or default) that references a ~/ path, try to read and parse the source
  // to extract const bindings from the imported file
  const resolvedImportPaths = new Set(); // avoid parsing same file twice
  for (const imp of result.imports) {
    if (!imp.importPath.startsWith('~/') && !imp.importPath.startsWith('.')) continue;
    // Only attempt cross-file resolution if the local name isn't already a local const binding
    if (imp.localName in constBindings) continue;

    // Resolve the import path to an absolute file path
    const baseUrl = parseOptions.baseUrl || path.dirname(filePath);
    let resolvedPath = null;
    try {
      resolvedPath = resolveSpecifier(imp.importPath, filePath, baseUrl);
    } catch (e) {
      // Skip unresolvable imports gracefully
      continue;
    }
    if (!resolvedPath) continue;
    if (resolvedImportPaths.has(resolvedPath)) continue;
    resolvedImportPaths.add(resolvedPath);

    // Read and parse the imported file to extract const bindings
    try {
      const importedSource = fs.readFileSync(resolvedPath, 'utf8');
      // Strip types if it's a TypeScript file
      let jsSource = importedSource;
      if (resolvedPath.endsWith('.ts') || resolvedPath.endsWith('.tsx')) {
        const stripResult = stripTypes(importedSource, resolvedPath);
        if (stripResult.error) continue; // Skip on strip failure
        jsSource = stripResult.code;
      }
      // Parse the stripped source to extract const bindings
      const importedAst = acorn.parse(jsSource, {
        ecmaVersion: 2020,
        sourceType: 'module',
        locations: true,
      });
      const importedBindings = buildConstBindings(importedAst);
      // Only import the specific named binding
      if (imp.localName in importedBindings) {
        constBindings[imp.localName] = importedBindings[imp.localName];
      }
    } catch (e) {
      // Skip files that can't be read or parsed — don't fail compilation
      continue;
    }
  }

  // Walk the AST for Data() declarations: const X = Data({...})
  // Detects Data template declarations in any file type (.data.ts or .test.ts)
  walk(ast, node => {
    if (node.type !== 'VariableDeclaration') return;
    for (const declarator of node.declarations) {
      const dataDecl = parseDataDeclaration(declarator, constBindings, filePath, result.warnings);
      if (dataDecl) {
        result.dataTemplates.push(dataDecl);
      }
    }
  });

  // Build the set of variable names that are Data template instances.
  // This includes:
  //   1. Local Data() declarations (const user = Data({...}))
  //   2. Imports from .data.ts files (import user from '~/data/user.data')
  var dataTemplateVars = new Set();
  for (const dt of result.dataTemplates) {
    dataTemplateVars.add(dt.name);
  }
  for (const imp of result.imports) {
    if (imp.importPath && imp.importPath.endsWith('.data')) {
      dataTemplateVars.add(imp.localName);
    }
  }

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
      const { element, error } = extractElement(declarator, filePath, result.warnings, constBindings);
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
      const { task, error, warnings } = extractTask(declarator, filePath, source, declaredTaskNames, constBindings, dataTemplateVars);
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
      const { test, error, warnings } = extractTest(node, filePath, source, declaredTaskNames, constBindings, dataTemplateVars);
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

  // Walk the AST for Automation declarations: Automation('name', fn) or const X = Automation('name', fn)
  walk(ast, node => {
    // Pattern 1: Standalone call expression — Automation('name', fn)
    if (node.type === 'ExpressionStatement' && node.expression && node.expression.type === 'CallExpression') {
      var callExpr = node.expression;
      if (callExpr.callee && callExpr.callee.type === 'Identifier' && callExpr.callee.name === 'Automation') {
        var args = callExpr.arguments || [];
        var label = args.length >= 1 ? extractString(args[0]) : null;
        var fn = args.length >= 2 ? args[1] : null;
        var warnings = [];

        if (!fn || (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression')) {
          result.warnings.push({
            message: `Automation() at ${filePath}:${lineOf(callExpr)} requires a name and a function argument`,
            filePath,
            line: lineOf(callExpr),
          });
          return false;
        }

        // Extract param types from raw TypeScript source
        var params = [];
        if (rawSource) {
          var paramResult = extractAutomationParamTypes(rawSource, filePath);
          params = paramResult.params;
          if (paramResult.warnings.length > 0) {
            warnings.push.apply(warnings, paramResult.warnings);
          }
        }

        // Build tracked params set
        var trackedParams = new Set();
        for (var i = 0; i < params.length; i++) {
          trackedParams.add(params[i].name);
        }
        var fnParams = extractFnParams(fn.params);
        for (var j = 0; j < fnParams.length; j++) {
          trackedParams.add(fnParams[j]);
        }

        // Extract steps
        var steps = fn.body && fn.body.type === 'BlockStatement'
          ? extractSteps(fn.body, filePath, trackedParams, warnings, source, declaredTaskNames, constBindings, dataTemplateVars)
          : [];

        // Validation warnings
        if (!label) {
          warnings.push({
            message: `Automation at ${filePath}:${lineOf(callExpr)} is missing a name — a label string is required as the first argument`,
            filePath,
            line: lineOf(callExpr),
          });
        }
        if (params.length === 0) {
          warnings.push({
            message: `Automation '${label || '(unnamed)'}' at ${filePath}:${lineOf(callExpr)} has no parameters — consider using Test instead`,
            filePath,
            line: lineOf(callExpr),
          });
        }
        if (steps.length === 0) {
          warnings.push({
            message: `Automation '${label || '(unnamed)'}' at ${filePath}:${lineOf(callExpr)} has no recognizable steps`,
            filePath,
            line: lineOf(callExpr),
          });
        }

        if (warnings.length > 0) {
          result.warnings.push(...warnings);
        }

        result.automations.push({
          name: label || null,
          label: label || null,
          params: params,
          steps: steps,
          line: lineOf(callExpr),
        });

        return false;
      }
    }

    // Pattern 2: Variable declaration — const X = Automation('name', fn)
    if (node.type === 'VariableDeclaration') {
      for (const declarator of node.declarations) {
        const { automation, error, warnings } = extractAutomation(declarator, filePath, source, rawSource || null, declaredTaskNames, constBindings, dataTemplateVars);
        if (error) {
          result.warnings.push(error);
        }
        if (warnings) {
          result.warnings.push(...warnings);
        }
        if (automation) {
          result.automations.push(automation);
        }
      }
    }
  });

  return result;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { parseFile, parseSource, extractElement, extractXPathElement, extractTask, extractTest, extractAutomation, extractStep, extractElementRef, extractIfStep, extractWhenStep, extractCondition, extractValueExpression, extractDateHelperCall, extractRuntimeTemplate, extractMatcherCall, extractAutomationParamTypes, parseDataDeclaration, parseDataTemplate, buildConstBindings, buildEnumBindings, resolveConstMemberExpression, DAY_OFFSET_HELPERS, MONTH_BOUNDARY_HELPERS };
