'use strict';

/**
 * parser.js — AST parsing of Page() / Task() calls from DSL source files.
 *
 * Uses acorn to parse each file and walks the resulting AST to find:
 *   - Page(name, { elements, tasks }) constructor calls → POM files
 *   - module.exports = { name, steps } patterns → test files
 *
 * Exported API:
 *   parseFile(filePath) → ParsedFile
 *
 * ParsedFile shape:
 * {
 *   filePath: string,
 *   type: 'pom' | 'test',
 *   pages: PageDef[],        // for POM files
 *   tests: TestDef[],        // for test files
 *   error: null | { message: string, line: number }
 * }
 *
 * Requirements: 12.5, 13.1
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
// Step extraction — parses the step call expressions inside a Task([...]) body
// ---------------------------------------------------------------------------

/**
 * Extract a step descriptor from a CallExpression node representing an action call
 * like click('btn'), type('input', 'hello'), task('Login__login', {...}), etc.
 *
 * @param {object} callNode - CallExpression AST node
 * @returns {object|null} step descriptor or null if unrecognized
 */
function extractStep(callNode) {
  if (!callNode || callNode.type !== 'CallExpression') return null;

  const callee = callNode.callee;
  const actionName = callee.type === 'Identifier' ? callee.name :
                     callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
                       ? callee.property.name : null;
  if (!actionName) return null;

  const args = callNode.arguments || [];

  switch (actionName) {
    case 'click':
    case 'assertExists':
    case 'assertNotExists': {
      const target = extractString(args[0]);
      if (target === null) return null;
      return { action: actionName, target };
    }
    case 'type':
    case 'typePassword':
    case 'select':
    case 'assertHasText': {
      const target = extractString(args[0]);
      const value = extractString(args[1]);
      if (target === null) return null;
      return { action: actionName, target, value: value !== null ? value : '' };
    }
    case 'waitFor': {
      const target = extractString(args[0]);
      const gone = extractBoolean(args[1]);
      if (target === null) return null;
      return { action: 'waitFor', target, gone: gone !== null ? gone : false };
    }
    case 'navigate': {
      const url = extractString(args[0]);
      if (url === null) return null;
      return { action: 'navigate', url };
    }
    case 'wait': {
      const ms = extractNumber(args[0]);
      return { action: 'wait', ms: ms !== null ? ms : 0 };
    }
    case 'manual': {
      const description = extractString(args[0]);
      return { action: 'manual', description: description !== null ? description : '' };
    }
    case 'task': {
      const name = extractString(args[0]);
      if (name === null) return null;
      const step = { action: 'task', name };
      // Optional params object: task('name', { key: 'val' })
      if (args[1] && args[1].type === 'ObjectExpression') {
        const params = extractSimpleObject(args[1]);
        if (params) step.params = params;
      }
      return step;
    }
    default:
      return null;
  }
}

/**
 * Extract steps from an array expression (the argument to Task([...])).
 * @param {object} arrayNode - ArrayExpression AST node
 * @returns {Array} array of step objects (unrecognized calls produce { action: '__unknown__' })
 */
function extractSteps(arrayNode) {
  if (!arrayNode || arrayNode.type !== 'ArrayExpression') return [];
  const steps = [];
  for (const element of arrayNode.elements) {
    if (!element) continue;
    if (element.type === 'CallExpression') {
      const step = extractStep(element);
      if (step) {
        steps.push(step);
      }
    }
  }
  return steps;
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
// el() descriptor extraction
// ---------------------------------------------------------------------------

/**
 * Extract an element descriptor from an ObjectExpression (argument to el({...})).
 * Handles `tag`, `label`, `childOf`, and `where` sub-object.
 *
 * @param {object} argNode - ObjectExpression passed to el()
 * @param {number} line - source line number
 * @returns {object} element descriptor
 */
function extractElDescriptor(argNode, line) {
  const descriptor = { line };
  if (!argNode || argNode.type !== 'ObjectExpression') return descriptor;

  for (const prop of argNode.properties) {
    if (prop.type !== 'Property') continue;
    const key = prop.key.type === 'Identifier' ? prop.key.name
               : prop.key.type === 'Literal' ? String(prop.key.value)
               : null;
    if (!key) continue;

    if (key === 'where') {
      const where = extractSimpleObject(prop.value);
      if (where) descriptor.where = where;
    } else {
      const val = extractString(prop.value);
      if (val !== null) descriptor[key] = val;
    }
  }

  return descriptor;
}

/**
 * Try to extract an element descriptor from a call or variable reference
 * in the elements map value position.
 *
 * Handles:
 *   - el({ tag: 'input', where: { id: 'x' } })  — CallExpression
 *   - { tag: 'input', where: { id: 'x' } }       — ObjectExpression (bare object)
 *
 * @param {object} valueNode
 * @param {number} line
 * @returns {object|null}
 */
function extractElementValue(valueNode, line) {
  if (!valueNode) return null;

  // el({...}) call
  if (valueNode.type === 'CallExpression') {
    const calleeName = valueNode.callee.type === 'Identifier' ? valueNode.callee.name : null;
    if (calleeName === 'el' && valueNode.arguments.length >= 1) {
      return extractElDescriptor(valueNode.arguments[0], line);
    }
    return null;
  }

  // Bare object literal
  if (valueNode.type === 'ObjectExpression') {
    return extractElDescriptor(valueNode, line);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Task({steps, params}) extraction from value node
// ---------------------------------------------------------------------------

/**
 * Extract a task definition from a Task([...]) call expression or object literal.
 *
 * Handles:
 *   Task([...steps...])
 *   Task([...steps...], { params: ['p1', 'p2'] })   // extended form
 *   { steps: [...], params: [...] }                  // bare object
 *
 * @param {object} valueNode
 * @param {number} line
 * @returns {object|null} { steps, params?, line }
 */
function extractTaskValue(valueNode, line) {
  if (!valueNode) return null;

  // Task([...]) call
  if (valueNode.type === 'CallExpression') {
    const calleeName = valueNode.callee.type === 'Identifier' ? valueNode.callee.name : null;
    if (calleeName === 'Task' && valueNode.arguments.length >= 1) {
      const stepsNode = valueNode.arguments[0];
      const steps = extractSteps(stepsNode);
      const taskDef = { steps, line };

      // Optional second argument: { params: ['p1', ...] }
      if (valueNode.arguments[1] && valueNode.arguments[1].type === 'ObjectExpression') {
        const opts = extractSimpleObject(valueNode.arguments[1]);
        if (opts && Array.isArray(opts.params)) taskDef.params = opts.params;
      }

      return taskDef;
    }
    return null;
  }

  // Bare object: { steps: [...], params: [...] }
  if (valueNode.type === 'ObjectExpression') {
    const taskDef = { steps: [], line };
    for (const prop of valueNode.properties) {
      if (prop.type !== 'Property') continue;
      const key = prop.key.type === 'Identifier' ? prop.key.name : null;
      if (key === 'steps' && prop.value.type === 'ArrayExpression') {
        taskDef.steps = extractSteps(prop.value);
      }
      if (key === 'params' && prop.value.type === 'ArrayExpression') {
        taskDef.params = prop.value.elements
          .map(e => extractString(e))
          .filter(s => s !== null);
      }
    }
    return taskDef;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Page() call extraction
// ---------------------------------------------------------------------------

/**
 * Extract a PageDef from a Page(name, { elements, tasks }) CallExpression.
 *
 * @param {object} callNode - CallExpression AST node
 * @returns {object|null} PageDef or null if not a valid Page() call
 */
function extractPageCall(callNode) {
  if (!callNode || callNode.type !== 'CallExpression') return null;

  const callee = callNode.callee;
  const calleeName = callee.type === 'Identifier' ? callee.name : null;
  if (calleeName !== 'Page') return null;

  const args = callNode.arguments || [];
  if (args.length < 2) return null;

  const name = extractString(args[0]);
  if (!name) return null;

  const defNode = args[1];
  if (!defNode || defNode.type !== 'ObjectExpression') return null;

  const line = lineOf(callNode);
  const pageDef = { name, line, elements: {}, tasks: {} };

  for (const prop of defNode.properties) {
    if (prop.type !== 'Property') continue;

    const propKey = prop.key.type === 'Identifier' ? prop.key.name
                   : prop.key.type === 'Literal' ? String(prop.key.value)
                   : null;

    if (propKey === 'elements' && prop.value.type === 'ObjectExpression') {
      for (const elProp of prop.value.properties) {
        if (elProp.type !== 'Property') continue;
        const elKey = elProp.key.type === 'Identifier' ? elProp.key.name
                     : elProp.key.type === 'Literal' ? String(elProp.key.value)
                     : null;
        if (!elKey) continue;

        const elLine = lineOf(elProp);
        const elDescriptor = extractElementValue(elProp.value, elLine);
        if (elDescriptor) {
          pageDef.elements[elKey] = elDescriptor;
        }
      }
    }

    if (propKey === 'tasks' && prop.value.type === 'ObjectExpression') {
      for (const taskProp of prop.value.properties) {
        if (taskProp.type !== 'Property') continue;
        const taskKey = taskProp.key.type === 'Identifier' ? taskProp.key.name
                       : taskProp.key.type === 'Literal' ? String(taskProp.key.value)
                       : null;
        if (!taskKey) continue;

        const taskLine = lineOf(taskProp);
        const taskDef = extractTaskValue(taskProp.value, taskLine);
        if (taskDef) {
          pageDef.tasks[taskKey] = taskDef;
        }
      }
    }
  }

  return pageDef;
}

// ---------------------------------------------------------------------------
// Test file extraction
// ---------------------------------------------------------------------------

/**
 * Try to extract test definitions from module.exports = { name, steps } patterns.
 * Also handles module.exports = { tests: [...] } or arrays.
 *
 * @param {object} ast - root Program AST node
 * @returns {Array} TestDef[]
 */
function extractTestDefinitions(ast) {
  const tests = [];

  walk(ast, node => {
    // module.exports = <expr>
    if (
      node.type === 'AssignmentExpression' &&
      node.operator === '=' &&
      node.left.type === 'MemberExpression' &&
      node.left.object.type === 'Identifier' &&
      node.left.object.name === 'module' &&
      node.left.property.type === 'Identifier' &&
      node.left.property.name === 'exports'
    ) {
      const rhs = node.right;
      const line = lineOf(node);

      // module.exports = { name: '...', steps: [...] }
      if (rhs.type === 'ObjectExpression') {
        const test = extractSingleTest(rhs, line);
        if (test) {
          tests.push(test);
        }
        // module.exports = { tests: [...] }
        for (const prop of rhs.properties) {
          if (prop.type !== 'Property') continue;
          const key = prop.key.type === 'Identifier' ? prop.key.name : null;
          if (key === 'tests' && prop.value.type === 'ArrayExpression') {
            for (const element of prop.value.elements) {
              if (!element) continue;
              const t = extractSingleTest(element, lineOf(element));
              if (t) tests.push(t);
            }
          }
        }
      }

      // module.exports = [{ name, steps }, ...]
      if (rhs.type === 'ArrayExpression') {
        for (const element of rhs.elements) {
          if (!element) continue;
          const t = extractSingleTest(element, lineOf(element));
          if (t) tests.push(t);
        }
      }
    }
  });

  return tests;
}

/**
 * Extract a single TestDef from an object expression { name, steps }.
 * @param {object} objNode - ObjectExpression AST node
 * @param {number} defaultLine
 * @returns {object|null}
 */
function extractSingleTest(objNode, defaultLine) {
  if (!objNode || objNode.type !== 'ObjectExpression') return null;

  let name = null;
  let steps = null;
  let line = defaultLine;

  for (const prop of objNode.properties) {
    if (prop.type !== 'Property') continue;
    const key = prop.key.type === 'Identifier' ? prop.key.name : null;
    if (key === 'name') {
      name = extractString(prop.value);
      line = lineOf(prop);
    }
    if (key === 'steps' && prop.value.type === 'ArrayExpression') {
      steps = extractSteps(prop.value);
    }
  }

  if (name === null || steps === null) return null;
  return { name, steps, line };
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
  if (filePath.endsWith('.pom.js')) return 'pom';
  if (filePath.endsWith('.test.js')) return 'test';
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
 *   pages: PageDef[],
 *   tests: TestDef[],
 *   error: null | { message: string, line: number }
 * }
 */
function parseFile(filePath) {
  const result = {
    filePath,
    type: detectFileType(filePath),
    pages: [],
    tests: [],
    error: null,
  };

  // Read the source file
  let source;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    result.error = {
      message: 'Parse error in ' + filePath + ':0: ' + e.message,
      line: 0,
    };
    return result;
  }

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

  // Walk the AST and collect Page() calls (for POM files)
  // We collect them regardless of file type so that files that don't strictly
  // follow naming conventions still work.
  walk(ast, node => {
    if (node.type !== 'CallExpression') return;
    const calleeName = node.callee && node.callee.type === 'Identifier' ? node.callee.name : null;

    if (calleeName === 'Page') {
      const pageDef = extractPageCall(node);
      if (pageDef) {
        result.pages.push(pageDef);
        // If we found a Page() call, mark this as a POM file
        result.type = 'pom';
      }
      return false; // don't recurse into Page() arguments for more Page() calls
    }
  });

  // Extract test definitions from module.exports assignments
  if (result.pages.length === 0) {
    result.tests = extractTestDefinitions(ast);
    result.type = 'test';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { parseFile };
