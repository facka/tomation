'use strict';

/**
 * Tests for parser.js — element/Task/Test AST extraction.
 *
 * Validates: Requirements 12.5
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseFile, parseSource } = require('./parser.js');
const { stripTypes } = require('./ts-stripper.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a temporary JS file and return its absolute path.
 * The caller is responsible for cleanup (or it gets left in os.tmpdir()).
 */
function writeTmp(content, suffix) {
  const filePath = path.join(os.tmpdir(), 'tomation-test-' + Date.now() + '-' + Math.random().toString(36).slice(2) + (suffix || '.pom.js'));
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// ---------------------------------------------------------------------------
// Requirement 12.5: Parser reports errors with file path and line number
// ---------------------------------------------------------------------------

test('parseFile: reports syntax errors with file path and line number', () => {
  const src = `
const x = {
  broken syntax here !!!@#$
`;
  const filePath = writeTmp(src, '.pom.js');
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.ok(result.error !== null, 'should have an error');
  assert.ok(typeof result.error.message === 'string');
  assert.ok(result.error.message.includes(filePath), 'error message should contain file path');
  assert.ok(typeof result.error.line === 'number');
  assert.ok(result.error.line > 0, 'error line should be > 0');
});

test('parseFile: reports file-not-found errors with file path', () => {
  const result = parseFile('/nonexistent/path/to/file.pom.js');

  assert.ok(result.error !== null);
  assert.ok(typeof result.error.message === 'string');
  assert.ok(result.error.message.includes('/nonexistent/path/to/file.pom.js'));
  assert.equal(result.error.line, 0);
});

test('parseFile: error message includes line number in expected format', () => {
  // Syntax error on a specific line
  const src = [
    "const x = 1;",
    "// line 2 comment",
    "// line 3 comment",
    "const broken = {{{;",  // line 4 — syntax error
  ].join('\n');

  const filePath = writeTmp(src, '.pom.js');
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.ok(result.error !== null);
  // Error message format: "Parse error in <file>:<line>: <detail>"
  assert.match(result.error.message, /Parse error in .+:\d+:/);
  assert.ok(result.error.message.includes(filePath));
});

test('parseSource: remaps TypeScript locations after type-only declarations are stripped', () => {
  const source = [
    "import { Test } from '@tomationjs/dsl';",
    'interface User { name: string }',
    '',
    "Test('example', () => {",
    '  unsupportedStatement();',
    '});',
  ].join('\n');
  const stripped = stripTypes(source, '/tmp/example.test.ts');
  const result = parseSource(stripped.code, '/tmp/example.test.ts', source, {
    lineMap: stripped.lineMap,
  });

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].line, 5);
});

test('parseSource: remaps syntax errors to original TypeScript lines', () => {
  const source = [
    "import { Test } from '@tomationjs/dsl';",
    'type UserId = string;',
    '',
    'const broken = {{{;',
  ].join('\n');
  const stripped = stripTypes(source, '/tmp/example.pom.ts');
  const result = parseSource(stripped.code, '/tmp/example.pom.ts', source, {
    lineMap: stripped.lineMap,
  });

  assert.ok(result.error);
  assert.equal(result.error.line, 4);
});

// ---------------------------------------------------------------------------
// File type detection
// ---------------------------------------------------------------------------

test('parseFile: detects POM file from .pom.js extension', () => {
  const src = `
const loginBtn = is.BUTTON.where(innerTextIs('Login')).as('Login Button');
`;
  const filePath = writeTmp(src, '.pom.js');
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.equal(result.error, null);
  assert.equal(result.type, 'pom');
  assert.equal(result.elements.length, 1);
});

// ---------------------------------------------------------------------------
// Return shape completeness
// ---------------------------------------------------------------------------

test('parseFile: always returns all required fields', () => {
  const src = `
const btn = is.BUTTON.where(idIs('x')).as('Button');
`;
  const filePath = writeTmp(src, '.pom.js');
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.ok('filePath' in result);
  assert.ok('type' in result);
  assert.ok('tests' in result);
  assert.ok('elements' in result);
  assert.ok('tasks' in result);
  assert.ok('error' in result);
  assert.ok(Array.isArray(result.tests));
  assert.ok(Array.isArray(result.elements));
  assert.ok(Array.isArray(result.tasks));
  assert.equal(result.filePath, filePath);
});

test('parseFile: returns error object with correct shape on parse failure', () => {
  const src = `!!!! not valid JS at all !!!!`;
  const filePath = writeTmp(src, '.pom.js');
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.ok(result.error !== null);
  assert.ok('message' in result.error);
  assert.ok('line' in result.error);
  assert.ok(typeof result.error.message === 'string');
  assert.ok(typeof result.error.line === 'number');
  // filePath and type should still be set
  assert.equal(result.filePath, filePath);
  assert.ok(Array.isArray(result.tests));
  assert.ok(Array.isArray(result.elements));
  assert.ok(Array.isArray(result.tasks));
});

// ---------------------------------------------------------------------------
// Requirement 3.5, 3.6, 3.7, 4.3, 4.4, 4.5: Compiler warning scenarios
// ---------------------------------------------------------------------------

test('parseSource: day-offset helper with non-string format argument emits warning', () => {
  const src = `
const el = is.INPUT.where(idIs('x')).as('Field');
const fillDate = Task(() => {
  Type(today(123)).in(el);
}).as('Fill Date');
`;
  const result = parseSource(src, 'date-warn.test.js');

  assert.equal(result.error, null);
  const w = result.warnings.find(x => x.message.includes("Date helper 'today' format argument must be a string"));
  assert.ok(w, 'should emit warning for non-string format arg');
  assert.ok(w.filePath.includes('date-warn.test.js'), 'warning should include filePath');
  assert.ok(typeof w.line === 'number' && w.line > 0, 'warning should include positive line number');
});

test('parseSource: month-boundary helper missing integer argument emits warning', () => {
  const src = `
const el = is.INPUT.where(idIs('x')).as('Field');
const fillDate = Task(() => {
  Type(firstDateOfMonth()).in(el);
}).as('Fill Date');
`;
  const result = parseSource(src, 'date-warn2.test.js');

  assert.equal(result.error, null);
  const w = result.warnings.find(x => x.message.includes("'firstDateOfMonth' requires an integer offset argument"));
  assert.ok(w, 'should emit warning for missing integer arg');
  assert.ok(w.filePath.includes('date-warn2.test.js'), 'warning should include filePath');
  assert.ok(typeof w.line === 'number' && w.line > 0, 'warning should include positive line number');
});

test('parseSource: month-boundary helper with non-integer first arg emits warning', () => {
  const src = `
const el = is.INPUT.where(idIs('x')).as('Field');
const fillDate = Task(() => {
  Type(firstDateOfMonth('notANumber')).in(el);
}).as('Fill Date');
`;
  const result = parseSource(src, 'date-warn3.test.js');

  assert.equal(result.error, null);
  const w = result.warnings.find(x => x.message.includes("'firstDateOfMonth' first argument must be an integer"));
  assert.ok(w, 'should emit warning for non-integer offset arg');
  assert.ok(w.filePath.includes('date-warn3.test.js'), 'warning should include filePath');
  assert.ok(typeof w.line === 'number' && w.line > 0, 'warning should include positive line number');
});

test('parseSource: day-offset helper with extra arguments emits warning', () => {
  const src = `
const el = is.INPUT.where(idIs('x')).as('Field');
const fillDate = Task(() => {
  Type(tomorrow('MM/DD', 'extra')).in(el);
}).as('Fill Date');
`;
  const result = parseSource(src, 'date-warn4.test.js');

  assert.equal(result.error, null);
  const w = result.warnings.find(x => x.message.includes("'tomorrow' accepts at most 1 argument"));
  assert.ok(w, 'should emit warning for extra args on day-offset helper');
  assert.ok(w.filePath.includes('date-warn4.test.js'), 'warning should include filePath');
  assert.ok(typeof w.line === 'number' && w.line > 0, 'warning should include positive line number');
});

test('parseSource: month-boundary helper with extra arguments emits warning', () => {
  const src = `
const el = is.INPUT.where(idIs('x')).as('Field');
const fillDate = Task(() => {
  Type(lastDateOfMonth(0, 'YYYY-MM-DD', 'extra')).in(el);
}).as('Fill Date');
`;
  const result = parseSource(src, 'date-warn5.test.js');

  assert.equal(result.error, null);
  const w = result.warnings.find(x => x.message.includes("'lastDateOfMonth' accepts at most 2 arguments"));
  assert.ok(w, 'should emit warning for extra args on month-boundary helper');
  assert.ok(w.filePath.includes('date-warn5.test.js'), 'warning should include filePath');
  assert.ok(typeof w.line === 'number' && w.line > 0, 'warning should include positive line number');
});

test('parseSource: unrecognized function in value position emits warning', () => {
  const src = `
const el = is.INPUT.where(idIs('x')).as('Field');
const fillDate = Task(() => {
  Type(unknownHelper()).in(el);
}).as('Fill Date');
`;
  const result = parseSource(src, 'date-warn6.test.js');

  assert.equal(result.error, null);
  const w = result.warnings.find(x => x.message.includes("Unknown function 'unknownHelper' in value position"));
  assert.ok(w, 'should emit warning for unrecognized function call in value position');
  assert.ok(w.filePath.includes('date-warn6.test.js'), 'warning should include filePath');
  assert.ok(typeof w.line === 'number' && w.line > 0, 'warning should include positive line number');
});

test('parseSource: unsupported expression type in template emits warning', () => {
  // Use an array expression inside template — not identifier, date helper call, or arithmetic
  const src = `
const el = is.INPUT.where(idIs('x')).as('Field');
const fillVal = Task(() => {
  Type(\`value is \${[1,2,3]}\`).in(el);
}).as('Fill Val');
`;
  const result = parseSource(src, 'template-warn.test.js');

  assert.equal(result.error, null);
  const w = result.warnings.find(x => x.message.includes('Unsupported expression type in template'));
  assert.ok(w, 'should emit warning for unsupported expression in template');
  assert.ok(w.filePath.includes('template-warn.test.js'), 'warning should include filePath');
  assert.ok(typeof w.line === 'number' && w.line > 0, 'warning should include positive line number');
});

test('parseSource: unrecognized function inside template expression emits warning', () => {
  const src = `
const el = is.INPUT.where(idIs('x')).as('Field');
const fillVal = Task(() => {
  Type(\`date is \${badFunc()}\`).in(el);
}).as('Fill Val');
`;
  const result = parseSource(src, 'template-warn2.test.js');

  assert.equal(result.error, null);
  const w = result.warnings.find(x => x.message.includes("Unknown function 'badFunc' in value position"));
  assert.ok(w, 'should emit warning for unrecognized function inside template expression');
  assert.ok(w.filePath.includes('template-warn2.test.js'), 'warning should include filePath');
  assert.ok(typeof w.line === 'number' && w.line > 0, 'warning should include positive line number');
});

test('parseSource: all warning scenarios include filePath and positive line number', () => {
  // Combine multiple warning triggers in one source to verify all have correct metadata
  const src = `
const el = is.INPUT.where(idIs('x')).as('Field');
const multi = Task(() => {
  Type(today(42)).in(el);
  Type(firstDateOfMonth()).in(el);
  Type(unknownFn()).in(el);
  Type(\`val \${[1]}\`).in(el);
}).as('Multi');
`;
  const result = parseSource(src, 'all-warnings.test.js');

  assert.equal(result.error, null);
  assert.ok(result.warnings.length >= 4, 'should produce at least 4 warnings');

  for (const w of result.warnings) {
    assert.ok(typeof w.filePath === 'string' && w.filePath.length > 0,
      `warning "${w.message}" should have non-empty filePath`);
    assert.ok(typeof w.line === 'number' && w.line > 0,
      `warning "${w.message}" should have positive line number`);
  }
});

// ---------------------------------------------------------------------------
// Requirement 8.1, 5.2, 1.6: Backward compatibility
// ---------------------------------------------------------------------------

test('backward compat: plain string values remain unchanged after refactor', () => {
  const src = `
const el = is.INPUT.where(idIs('x')).as('Field');
const nav = Task(() => {
  Type('hello world').in(el);
  Navigate('https://example.com');
  AssertHasText(el, 'expected text');
}).as('Compat');
`;
  const result = parseSource(src, 'compat-plain.test.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);

  const steps = result.tasks[0].steps;
  // Type value should be a plain string, not an object
  assert.equal(steps[0].value, 'hello world');
  assert.equal(typeof steps[0].value, 'string');

  // Navigate url should be a plain string
  assert.equal(steps[1].url, 'https://example.com');
  assert.equal(typeof steps[1].url, 'string');

  // AssertHasText value should be a plain string
  assert.equal(steps[2].value, 'expected text');
  assert.equal(typeof steps[2].value, 'string');
});

test('backward compat: zero-expression backtick templates emit plain strings', () => {
  const src = `
const el = is.INPUT.where(idIs('x')).as('Field');
const fill = Task(() => {
  Type(\`hello backtick\`).in(el);
  Navigate(\`https://example.com/page\`);
  AssertHasText(el, \`some text\`);
}).as('BacktickCompat');
`;
  const result = parseSource(src, 'compat-backtick.test.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);

  const steps = result.tasks[0].steps;
  // Zero-expression template should emit plain string, not a runtimeTemplate descriptor
  assert.equal(steps[0].value, 'hello backtick');
  assert.equal(typeof steps[0].value, 'string');

  assert.equal(steps[1].url, 'https://example.com/page');
  assert.equal(typeof steps[1].url, 'string');

  assert.equal(steps[2].value, 'some text');
  assert.equal(typeof steps[2].value, 'string');
});

test('backward compat: date helper calls outside value positions are not emitted as descriptors', () => {
  const src = `
const el = is.INPUT.where(idIs('x')).as('Field');
const d = today();
const t = tomorrow('MM/DD/YYYY');
const first = firstDateOfMonth(0);
const doStuff = Task(() => {
  Type('static value').in(el);
}).as('NoDateDescriptor');
`;
  const result = parseSource(src, 'compat-no-descriptor.test.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);

  const steps = result.tasks[0].steps;
  // The task step should only contain the static Type action
  assert.equal(steps.length, 1);
  assert.equal(steps[0].action, 'type');
  assert.equal(steps[0].value, 'static value');
  assert.equal(typeof steps[0].value, 'string');

  // No step should contain a dateHelper descriptor
  for (const step of steps) {
    if (step.value && typeof step.value === 'object') {
      assert.fail('date helper descriptor should not appear for calls outside value positions');
    }
  }
});

// ---------------------------------------------------------------------------
// Requirements 7.1–7.5, 3.8: Preservation of existing condition forms
//
// These tests lock the compiled Condition_Descriptor shape for the condition
// forms that existed before the enum/nested-path feature. Per task 9.1, all
// param-based conditions now emit `path: string[]` (a flat param yields a
// single-segment path such as ['flag']) and no longer emit a `param` field.
// `ctx.key` conditions still emit a ctx-based descriptor
// { source: 'ctx', key, op, value? }.
// ---------------------------------------------------------------------------

test('preservation: flat param truthiness `if (flag)` compiles to a truthy path descriptor (Req 7.1)', () => {
  const src = `
const el = is.BUTTON.where(idIs('go')).as('Go');
const t = Task((params) => {
  const { flag } = params;
  if (flag) {
    Click(el);
  }
}).as('FlatTruthy');
`;
  const result = parseSource(src, 'preserve-flat-truthy.test.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);

  const steps = result.tasks[0].steps;
  assert.equal(steps.length, 1);
  const ifStep = steps[0];
  assert.equal(ifStep.action, 'if');
  assert.deepEqual(ifStep.condition, { path: ['flag'], op: 'truthy' });
  // The old flat `param` field is no longer emitted for newly compiled specs.
  assert.equal('param' in ifStep.condition, false);
  assert.ok(Array.isArray(ifStep.then) && ifStep.then.length === 1);
});

test('preservation: negation `if (!flag)` compiles to a falsy path descriptor (Req 7.2)', () => {
  const src = `
const el = is.BUTTON.where(idIs('go')).as('Go');
const t = Task((params) => {
  const { flag } = params;
  if (!flag) {
    Click(el);
  }
}).as('FlatFalsy');
`;
  const result = parseSource(src, 'preserve-flat-falsy.test.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);

  const ifStep = result.tasks[0].steps[0];
  assert.equal(ifStep.action, 'if');
  assert.deepEqual(ifStep.condition, { path: ['flag'], op: 'falsy' });
  assert.equal('param' in ifStep.condition, false);
});

test('preservation: string equality `===`/`!==` compiles to equals/notEquals with a string value (Req 7.3)', () => {
  const src = `
const el = is.BUTTON.where(idIs('go')).as('Go');
const t = Task((params) => {
  const { status } = params;
  if (status === 'active') {
    Click(el);
  }
  if (status !== 'active') {
    Click(el);
  }
}).as('StringEquality');
`;
  const result = parseSource(src, 'preserve-string-equality.test.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);

  const steps = result.tasks[0].steps;
  assert.equal(steps.length, 2);

  // === → equals, string value preserved
  assert.deepEqual(steps[0].condition, { path: ['status'], op: 'equals', value: 'active' });
  assert.equal(typeof steps[0].condition.value, 'string');

  // !== → notEquals, string value preserved
  assert.deepEqual(steps[1].condition, { path: ['status'], op: 'notEquals', value: 'active' });
  assert.equal(typeof steps[1].condition.value, 'string');
});

test('preservation: boolean equality maps to truthy/falsy with no value (Req 7.4)', () => {
  const src = `
const el = is.BUTTON.where(idIs('go')).as('Go');
const t = Task((params) => {
  const { enabled } = params;
  if (enabled === true) {
    Click(el);
  }
  if (enabled === false) {
    Click(el);
  }
  if (enabled !== true) {
    Click(el);
  }
}).as('BooleanEquality');
`;
  const result = parseSource(src, 'preserve-boolean-equality.test.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);

  const steps = result.tasks[0].steps;
  assert.equal(steps.length, 3);

  // === true → truthy, no value
  assert.deepEqual(steps[0].condition, { path: ['enabled'], op: 'truthy' });
  assert.equal('value' in steps[0].condition, false);

  // === false → falsy, no value
  assert.deepEqual(steps[1].condition, { path: ['enabled'], op: 'falsy' });
  assert.equal('value' in steps[1].condition, false);

  // !== true → falsy, no value
  assert.deepEqual(steps[2].condition, { path: ['enabled'], op: 'falsy' });
  assert.equal('value' in steps[2].condition, false);
});

test('preservation: `ctx.key` truthiness and negation compile to ctx-based descriptors (Req 7.5, 3.8)', () => {
  const src = `
const el = is.BUTTON.where(idIs('go')).as('Go');
const t = Task((params) => {
  if (ctx.loggedIn) {
    Click(el);
  }
  if (!ctx.loggedIn) {
    Click(el);
  }
}).as('CtxKey');
`;
  const result = parseSource(src, 'preserve-ctx-key.test.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);

  const steps = result.tasks[0].steps;
  assert.equal(steps.length, 2);

  // ctx.key truthiness → ctx-based descriptor deferred to runtime
  assert.deepEqual(steps[0].condition, { source: 'ctx', key: 'loggedIn', op: 'truthy' });
  // ctx descriptors are not param-based: no `path` field
  assert.equal('path' in steps[0].condition, false);

  // !ctx.key → ctx-based falsy descriptor
  assert.deepEqual(steps[1].condition, { source: 'ctx', key: 'loggedIn', op: 'falsy' });
  assert.equal('path' in steps[1].condition, false);
});

test('preservation: `ctx.key` string equality compiles to a ctx-based descriptor with value (Req 7.3, 3.8)', () => {
  const src = `
const el = is.BUTTON.where(idIs('go')).as('Go');
const t = Task((params) => {
  if (ctx.role === 'admin') {
    Click(el);
  }
}).as('CtxEquality');
`;
  const result = parseSource(src, 'preserve-ctx-equality.test.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);

  const cond = result.tasks[0].steps[0].condition;
  assert.deepEqual(cond, { source: 'ctx', key: 'role', op: 'equals', value: 'admin' });
  assert.equal(typeof cond.value, 'string');
  assert.equal('path' in cond, false);
});

// ===========================================================================
// Feature: inline-data-enum-member-value
//
// Bugfix exploration (BEFORE the fix). These tests encode the EXPECTED
// behavior: a `const X = Data({...})` template used as an enum-like value
// source should resolve its primitive-literal members when referenced as a
// value `T.M` (two-level) or `Ns.T.M` (three-level).
//
// On the UNFIXED code these tests are EXPECTED TO FAIL — `buildConstBindings`
// skips the `Data()` CallExpression init, so `constBindings[T]` is never
// populated, both Case 6 (two-level) and Case 5 (three-level) resolvers return
// null, and the referenced property key is DROPPED from the compiled template.
// That failure confirms the bug exists. After the fix they validate it
// (reused unchanged in task 3.2).
// ===========================================================================

const fc = require('fast-check');

// ---------------------------------------------------------------------------
// Helpers for the inline-data-enum-member-value feature tests
// ---------------------------------------------------------------------------

// Create a unique temp directory so sibling files (POM / data modules) can be
// resolved via relative imports by the compiler's cross-file resolution
// (baseUrl defaults to path.dirname(filePath)). Returns the directory path.
function mkTmpDir() {
  const dir = path.join(
    os.tmpdir(),
    'tomation-inline-data-enum-' + Date.now() + '-' + Math.random().toString(36).slice(2),
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function rmTmpDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    /* best-effort cleanup */
  }
}

// Locate a parsed Data template by its declared variable name (varName) or its
// resolved Data_Name (name). Returns the `template` object or undefined.
function findTemplate(result, varOrName) {
  const dt = (result.dataTemplates || []).find(
    d => d.varName === varOrName || d.name === varOrName,
  );
  return dt ? dt.template : undefined;
}

// True if any warning message mentions dropping the given data property key.
// Covers both the two-level "Unknown data property" validator-style phrasing
// and the three-level "Unknown namespaced enum reference" parser warning.
function hasUnknownPropertyWarning(result, key) {
  return (result.warnings || []).some(
    w =>
      typeof w.message === 'string' &&
      (w.message.includes('Unknown data property "' + key + '"') ||
        (w.message.includes('Unknown namespaced enum reference') &&
          w.message.includes('"' + key + '"'))),
  );
}

// Parse a standalone test-file source that declares everything locally (no
// imports) via parseSource. Used for the two-level local cases.
function parseLocal(source) {
  return parseSource(source, 'inline-data-enum-local.test.js');
}

// A valid JS identifier used for randomly-generated template/member names.
// Always prefixed with "v" so the result is guaranteed to be a legal, non-
// reserved identifier (never a keyword like `in`/`if`, and never `Data`).
const IDENT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$'.split('');
const identifierArb = fc
  .array(fc.constantFrom(...IDENT_CHARS), { minLength: 0, maxLength: 8 })
  .map(chars => 'v' + chars.join(''));

// Primitive leaf values: string / number / boolean literals. We capture both
// the JS value (expected resolution result) and its source-code rendering.
// Safe single-line string characters: printable ASCII minus backslash and the
// single quote used as the source delimiter, so the generated literal renders
// exactly to the intended value with no escaping concerns.
const SAFE_STRING_CHARS = [];
for (let c = 0x20; c <= 0x7e; c++) {
  const ch = String.fromCharCode(c);
  if (ch !== '\\' && ch !== "'") SAFE_STRING_CHARS.push(ch);
}
const primitiveLeafArb = fc.oneof(
  fc
    .array(fc.constantFrom(...SAFE_STRING_CHARS), { minLength: 0, maxLength: 20 })
    .map(chars => chars.join(''))
    .map(s => ({ value: s, src: "'" + s + "'", kind: 'string' })),
  fc
    .integer({ min: -1000, max: 1000 })
    .map(n => ({ value: n, src: String(n), kind: 'number' })),
  fc.boolean().map(b => ({ value: b, src: String(b), kind: 'boolean' })),
);

// ---------------------------------------------------------------------------
// Feature: inline-data-enum-member-value, Property 1: Data-template member resolves to its literal value
//
// For any Data template property whose value is a member expression (T.M
// two-level or Ns.T.M three-level) where the base T resolves to a Data({...})
// template with a primitive-literal leaf member, the parser SHALL resolve the
// property to the referenced member's literal value, keep the property key
// present in the compiled template, and emit NO "Unknown data property"
// (two-level) / "Unknown namespaced enum reference" (three-level) warning for
// that key. Two-level preserves the member's primitive type (Case 6);
// three-level is string-coerced (Case 5).
//
// EXPECTED on UNFIXED code: FAILS — keys dropped + warnings (bug confirmed).
// ---------------------------------------------------------------------------
test('Property 1: Data-template member resolves to its literal value (two-level, local)', () => {
  // Feature: inline-data-enum-member-value, Property 1: Data-template member resolves to its literal value
  fc.assert(
    fc.property(
      identifierArb, // template variable name  (T)
      identifierArb, // member key              (M)
      identifierArb, // referencing property key
      primitiveLeafArb, // primitive leaf value  (string | number | boolean)
      (tName, memberKey, propKey, leaf) => {
        // Keep identifiers distinct so the generated source is unambiguous.
        fc.pre(tName !== memberKey && tName !== propKey && memberKey !== propKey);

        const source = [
          "import { Data } from '@tomationjs/dsl'",
          '',
          'const ' + tName + ' = Data({ ' + memberKey + ': ' + leaf.src + ' })',
          '',
          'const target = Data({ ' + propKey + ': ' + tName + '.' + memberKey + ' })',
          '',
        ].join('\n');

        const result = parseLocal(source);
        assert.equal(result.error, null);

        const template = findTemplate(result, 'target');
        assert.ok(template, 'target Data template should be parsed');

        // Key is PRESENT (not dropped)…
        assert.ok(
          Object.prototype.hasOwnProperty.call(template, propKey),
          'property key "' + propKey + '" should be present (two-level T.M)',
        );
        // …resolves to the referenced leaf's literal value, with primitive type
        // preserved (Case 6).
        assert.strictEqual(template[propKey], leaf.value);
        // …and NO "Unknown data property" warning is emitted for that key.
        assert.equal(hasUnknownPropertyWarning(result, propKey), false);
      },
    ),
    { numRuns: 100 },
  );
});

test('Property 1: deterministic concrete cases (string, number-preservation, three-level)', () => {
  // Feature: inline-data-enum-member-value, Property 1: Data-template member resolves to its literal value
  //
  // The concrete failing cases drawn from design.md, scoped for deterministic
  // reproducibility. fast-check drives the case selection so the property is
  // exercised uniformly across all three concrete shapes.
  const CASE_TWO_LEVEL_STRING = 'two-level-string';
  const CASE_TWO_LEVEL_NUMBER = 'two-level-number';
  const CASE_THREE_LEVEL = 'three-level';

  fc.assert(
    fc.property(
      fc.constantFrom(CASE_TWO_LEVEL_STRING, CASE_TWO_LEVEL_NUMBER, CASE_THREE_LEVEL),
      caseName => {
        if (caseName === CASE_TWO_LEVEL_STRING) {
          // taskType: TaskTypes.Type1  →  "Type1"  (two-level string)
          const source = [
            "import { Data } from '@tomationjs/dsl'",
            '',
            "const TaskTypes = Data({ Type1: 'Type1', Type2: 'Type2' })",
            '',
            'const newTaskDefault = Data({ taskType: TaskTypes.Type1 })',
          ].join('\n');

          const result = parseLocal(source);
          assert.equal(result.error, null);
          const template = findTemplate(result, 'newTaskDefault');
          assert.ok(template, 'newTaskDefault template should be parsed');
          assert.ok(
            Object.prototype.hasOwnProperty.call(template, 'taskType'),
            'taskType key should be present',
          );
          assert.strictEqual(template.taskType, 'Type1');
          assert.equal(hasUnknownPropertyWarning(result, 'taskType'), false);
          return;
        }

        if (caseName === CASE_TWO_LEVEL_NUMBER) {
          // count: N.Zero where N = Data({ Zero: 0 })  →  number 0 (NOT "0")
          const source = [
            "import { Data } from '@tomationjs/dsl'",
            '',
            'const N = Data({ Zero: 0 })',
            '',
            'const counts = Data({ count: N.Zero })',
          ].join('\n');

          const result = parseLocal(source);
          assert.equal(result.error, null);
          const template = findTemplate(result, 'counts');
          assert.ok(template, 'counts template should be parsed');
          assert.ok(
            Object.prototype.hasOwnProperty.call(template, 'count'),
            'count key should be present',
          );
          // Two-level (Case 6) preserves the primitive type: number 0, not "0".
          assert.strictEqual(template.count, 0);
          assert.strictEqual(typeof template.count, 'number');
          assert.equal(hasUnknownPropertyWarning(result, 'count'), false);
          return;
        }

        // CASE_THREE_LEVEL: Ns.TaskTypes.Type1 via an imported default POM
        // namespace. The POM re-exports a `const TaskTypes = Data({...})`.
        const dir = mkTmpDir();
        try {
          const pomPath = path.join(dir, 'new-task.pom.ts');
          const testPath = path.join(dir, 'new-task.test.ts');
          fs.writeFileSync(
            pomPath,
            [
              "import { Data } from '@tomationjs/dsl'",
              '',
              "const TaskTypes = Data({ Type1: 'Type1', Type2: 'Type2' })",
              '',
              'export default { TaskTypes }',
              '',
            ].join('\n'),
            'utf8',
          );
          fs.writeFileSync(
            testPath,
            [
              "import { Data } from '@tomationjs/dsl'",
              "import NewTaskPage from './new-task.pom'",
              '',
              'const threeLevel = Data({ taskType: NewTaskPage.TaskTypes.Type1 })',
              '',
            ].join('\n'),
            'utf8',
          );

          const result = parseFile(testPath);
          assert.equal(result.error, null);
          const template = findTemplate(result, 'threeLevel');
          assert.ok(template, 'threeLevel template should be parsed');
          assert.ok(
            Object.prototype.hasOwnProperty.call(template, 'taskType'),
            'taskType key should be present (three-level Ns.T.M)',
          );
          // Three-level (Case 5) is string-coerced.
          assert.strictEqual(template.taskType, 'Type1');
          assert.equal(hasUnknownPropertyWarning(result, 'taskType'), false);
        } finally {
          rmTmpDir(dir);
        }
      },
    ),
    { numRuns: 100 },
  );
});

test('Property 1: Data-template member resolves to its literal value (two-level, imported)', () => {
  // Feature: inline-data-enum-member-value, Property 1: Data-template member resolves to its literal value
  //
  // Imported default `Data({...})` template referenced as `T.M` in another file
  // (mirrors `import TaskTypes from '~/data/task-types.data'` then
  // `taskType: TaskTypes.Type1`). Exercises the cross-file import path, which
  // also depends on buildConstBindings registering the Data() template.
  fc.assert(
    fc.property(
      identifierArb, // member key    (M)
      primitiveLeafArb, // primitive leaf value
      (memberKey, leaf) => {
        const dir = mkTmpDir();
        try {
          const dataPath = path.join(dir, 'task-types.data.ts');
          const testPath = path.join(dir, 'imported.test.ts');
          fs.writeFileSync(
            dataPath,
            [
              "import { Data } from '@tomationjs/dsl'",
              '',
              'const TaskTypes = Data({ ' + memberKey + ': ' + leaf.src + ' })',
              '',
              'export default TaskTypes',
              '',
            ].join('\n'),
            'utf8',
          );
          fs.writeFileSync(
            testPath,
            [
              "import { Data } from '@tomationjs/dsl'",
              "import TaskTypes from './task-types.data'",
              '',
              'const imported = Data({ taskType: TaskTypes.' + memberKey + ' })',
              '',
            ].join('\n'),
            'utf8',
          );

          const result = parseFile(testPath);
          assert.equal(result.error, null);
          const template = findTemplate(result, 'imported');
          assert.ok(template, 'imported template should be parsed');
          assert.ok(
            Object.prototype.hasOwnProperty.call(template, 'taskType'),
            'taskType key should be present (two-level imported T.M)',
          );
          // Two-level preserves the primitive type (Case 6).
          assert.strictEqual(template.taskType, leaf.value);
          assert.equal(hasUnknownPropertyWarning(result, 'taskType'), false);
        } finally {
          rmTmpDir(dir);
        }
      },
    ),
    { numRuns: 100 },
  );
});

// ---------------------------------------------------------------------------
// Task 1.1 (optional): supporting example-based unit tests for the Bug Condition.
//
// These assert the EXPECTED (post-fix) behavior for the four concrete cases
// from design.md. On the UNFIXED code they FAIL (keys dropped), documenting the
// counterexamples; after the fix they pass alongside Property 1.
// ---------------------------------------------------------------------------
test('bug condition: imported two-level TaskTypes.Type1 resolves to "Type1"', () => {
  // Feature: inline-data-enum-member-value, Property 1: Data-template member resolves to its literal value
  const dir = mkTmpDir();
  try {
    const dataPath = path.join(dir, 'task-types.data.ts');
    const testPath = path.join(dir, 'new-task.test.ts');
    fs.writeFileSync(
      dataPath,
      [
        "import { Data } from '@tomationjs/dsl'",
        '',
        "const TaskTypes = Data({ Type1: 'Type1', Type2: 'Type2' })",
        '',
        'export default TaskTypes',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      testPath,
      [
        "import { Data } from '@tomationjs/dsl'",
        "import TaskTypes from './task-types.data'",
        '',
        'const newTaskDefault = Data({ taskType: TaskTypes.Type1 })',
        '',
      ].join('\n'),
      'utf8',
    );

    const result = parseFile(testPath);
    assert.equal(result.error, null);
    const template = findTemplate(result, 'newTaskDefault');
    assert.ok(template, 'newTaskDefault template should be parsed');
    // On UNFIXED code the key is dropped — these two assertions fail, which is
    // the documented counterexample: taskType absent + "Unknown data property".
    assert.ok(
      Object.prototype.hasOwnProperty.call(template, 'taskType'),
      'taskType key should be present',
    );
    assert.strictEqual(template.taskType, 'Type1');
    assert.equal(hasUnknownPropertyWarning(result, 'taskType'), false);
  } finally {
    rmTmpDir(dir);
  }
});

test('bug condition: local two-level const T = Data({ A: "a" }) then x: T.A resolves to "a"', () => {
  // Feature: inline-data-enum-member-value, Property 1: Data-template member resolves to its literal value
  const source = [
    "import { Data } from '@tomationjs/dsl'",
    '',
    "const T = Data({ A: 'a', B: 'b' })",
    '',
    'const local = Data({ x: T.A })',
  ].join('\n');

  const result = parseLocal(source);
  assert.equal(result.error, null);
  const template = findTemplate(result, 'local');
  assert.ok(template, 'local template should be parsed');
  assert.ok(
    Object.prototype.hasOwnProperty.call(template, 'x'),
    'x key should be present',
  );
  assert.strictEqual(template.x, 'a');
  assert.equal(hasUnknownPropertyWarning(result, 'x'), false);
});

test('bug condition: three-level Ns.TaskTypes.Type1 resolves (string-coerced) to "Type1"', () => {
  // Feature: inline-data-enum-member-value, Property 1: Data-template member resolves to its literal value
  const dir = mkTmpDir();
  try {
    const pomPath = path.join(dir, 'new-task.pom.ts');
    const testPath = path.join(dir, 'new-task.test.ts');
    fs.writeFileSync(
      pomPath,
      [
        "import { Data } from '@tomationjs/dsl'",
        '',
        "const TaskTypes = Data({ Type1: 'Type1', Type2: 'Type2' })",
        '',
        'export default { TaskTypes }',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      testPath,
      [
        "import { Data } from '@tomationjs/dsl'",
        "import NewTaskPage from './new-task.pom'",
        '',
        'const threeLevel = Data({ taskType: NewTaskPage.TaskTypes.Type1 })',
        '',
      ].join('\n'),
      'utf8',
    );

    const result = parseFile(testPath);
    assert.equal(result.error, null);
    const template = findTemplate(result, 'threeLevel');
    assert.ok(template, 'threeLevel template should be parsed');
    // On UNFIXED code: key dropped + "Unknown namespaced enum reference".
    assert.ok(
      Object.prototype.hasOwnProperty.call(template, 'taskType'),
      'taskType key should be present (three-level)',
    );
    assert.strictEqual(template.taskType, 'Type1');
    assert.equal(hasUnknownPropertyWarning(result, 'taskType'), false);
  } finally {
    rmTmpDir(dir);
  }
});

test('bug condition: primitive-type edge const N = Data({ Zero: 0 }) then count: N.Zero resolves to number 0', () => {
  // Feature: inline-data-enum-member-value, Property 1: Data-template member resolves to its literal value
  const source = [
    "import { Data } from '@tomationjs/dsl'",
    '',
    'const N = Data({ Zero: 0 })',
    '',
    'const counts = Data({ count: N.Zero })',
  ].join('\n');

  const result = parseLocal(source);
  assert.equal(result.error, null);
  const template = findTemplate(result, 'counts');
  assert.ok(template, 'counts template should be parsed');
  assert.ok(
    Object.prototype.hasOwnProperty.call(template, 'count'),
    'count key should be present',
  );
  // After the fix this must be the NUMBER 0, not the string "0".
  assert.strictEqual(template.count, 0);
  assert.strictEqual(typeof template.count, 'number');
  assert.equal(hasUnknownPropertyWarning(result, 'count'), false);
});

// ===========================================================================
// Feature: inline-data-enum-member-value, Property 2: Non-buggy resolution paths unchanged
//
// Preservation (authored BEFORE the fix). For ANY input where the bug condition
// does NOT hold — TS enum members, plain const-object members, `Fake.*`
// expressions, nested objects, date-helper expressions, and `{{data.*}}` step
// tokens — the parser must produce exactly the SAME result after the fix as it
// does today.
//
// Observation-first methodology: these assertions were derived by reading the
// UNFIXED parser's behavior for each non-bug-condition path (parser.js Cases
// 1/3/4/6 inside `parseDataTemplate`, plus the `dataVars` /
// `extractDataMemberPath` step-token path). They are written to PASS on the
// UNFIXED code — confirming the baseline that must be preserved — and are
// reused unchanged after the fix (task 3.3).
//
// Why direct observed-output assertions model `F(X) === F'(X)`: the fix is
// purely ADDITIVE to `constBindings` (it only registers `Data({...})`
// templates, which were previously absent). None of these preserved paths read
// a `Data()`-registered binding — TS enums and plain const objects are already
// registered today; `Fake.*` / nested / date-helper leaves are non-primitive
// SHAPES handled by Cases 1/3/4 before any const lookup; `{{data.*}}` tokens
// use the independent `dataVars` map. So the ORIGINAL observed output (asserted
// here) is by construction identical to the fixed output. Each run also parses
// the same source twice and asserts byte-for-byte equality, pinning F's output
// to a stable value that F' must reproduce.
// ===========================================================================

// Deep structural equality for parsed template/step values (objects, arrays,
// primitives). Used to assert F(X) === F'(X) without depending on test-runner
// internals.
function deepEqualValue(a, b) {
  assert.deepStrictEqual(a, b);
}

// Resolve the first step's `value` for a single-Test source whose body is
// `Type(<expr>).in(el)`. Returns { value, warnings } from the parsed result.
function firstTypeStepValue(result) {
  assert.ok(Array.isArray(result.tests) && result.tests.length >= 1, 'a Test should be parsed');
  const steps = result.tests[0].steps || [];
  assert.ok(steps.length >= 1, 'the Test should have at least one step');
  return steps[0];
}

// ---------------------------------------------------------------------------
// Property 2 (fast-check): non-buggy resolution paths unchanged across the
// generated input domain. Each iteration randomly picks one preserved path and
// a random primitive/shape payload, parses the UNFIXED-equivalent source twice,
// and asserts (a) the two parses are identical (F === F') and (b) the resolved
// value equals the observed baseline for that path. No path here satisfies the
// bug condition (none references a `Data({...})` template member as a value).
// ---------------------------------------------------------------------------
test('Property 2: non-buggy resolution paths unchanged', () => {
  // Feature: inline-data-enum-member-value, Property 2: Non-buggy resolution paths unchanged
  const PATH_CONST_OBJECT = 'const-object';     // 3.2
  const PATH_FAKE = 'fake';                       // 3.3
  const PATH_NESTED = 'nested-object';            // 3.4
  const PATH_DATE_HELPER = 'date-helper';         // 3.5
  const PATH_DATA_TOKEN = 'data-token';           // 3.6

  fc.assert(
    fc.property(
      fc.constantFrom(
        PATH_CONST_OBJECT,
        PATH_FAKE,
        PATH_NESTED,
        PATH_DATE_HELPER,
        PATH_DATA_TOKEN,
      ),
      identifierArb, // a member/property key used by the chosen path
      primitiveLeafArb, // a primitive payload (string | number | boolean)
      (pathKind, memberKey, leaf) => {
        if (pathKind === PATH_CONST_OBJECT) {
          // 3.2 — plain const object literal `const X = { ... }` → `X.K`.
          // This path is ALREADY registered in constBindings today and is not a
          // Data() template, so the fix does not touch it.
          fc.pre(memberKey !== 'target');
          const source = [
            "import { Data } from '@tomationjs/dsl'",
            '',
            'const X = { ' + memberKey + ': ' + leaf.src + ' }',
            '',
            'const target = Data({ picked: X.' + memberKey + ' })',
          ].join('\n');

          const a = parseLocal(source);
          const b = parseLocal(source);
          assert.equal(a.error, null);
          const ta = findTemplate(a, 'target');
          const tb = findTemplate(b, 'target');
          assert.ok(ta, 'target template should be parsed');
          // F === F' (two parses of the same source are identical)
          deepEqualValue(ta, tb);
          // Observed baseline: plain-const member resolves to its literal value
          // with its primitive type preserved (Case 6), key present, no warning.
          assert.ok(Object.prototype.hasOwnProperty.call(ta, 'picked'));
          assert.strictEqual(ta.picked, leaf.value);
          assert.equal(hasUnknownPropertyWarning(a, 'picked'), false);
          return;
        }

        if (pathKind === PATH_FAKE) {
          // 3.3 — `Fake.*` expression. A non-primitive value SHAPE handled by
          // Case 1 before any const lookup; unaffected by the fix.
          const source = [
            "import { Data } from '@tomationjs/dsl'",
            '',
            'const target = Data({ who: Fake.fullName() })',
          ].join('\n');

          const a = parseLocal(source);
          const b = parseLocal(source);
          assert.equal(a.error, null);
          const ta = findTemplate(a, 'target');
          const tb = findTemplate(b, 'target');
          assert.ok(ta, 'target template should be parsed');
          deepEqualValue(ta, tb);
          // Observed baseline: a Fake descriptor { type:'fake', method, options }.
          assert.deepStrictEqual(ta.who, { type: 'fake', method: 'fullName', options: {} });
          return;
        }

        if (pathKind === PATH_NESTED) {
          // 3.4 — nested ObjectExpression. Case 3 recurses; unaffected by fix.
          fc.pre(memberKey !== 'target');
          const source = [
            "import { Data } from '@tomationjs/dsl'",
            '',
            'const target = Data({ outer: { ' + memberKey + ': ' + leaf.src + ' } })',
          ].join('\n');

          const a = parseLocal(source);
          const b = parseLocal(source);
          assert.equal(a.error, null);
          const ta = findTemplate(a, 'target');
          const tb = findTemplate(b, 'target');
          assert.ok(ta, 'target template should be parsed');
          deepEqualValue(ta, tb);
          // Observed baseline: a nested plain object carrying the literal leaf.
          const expectedNested = {};
          expectedNested[memberKey] = leaf.value;
          assert.deepStrictEqual(ta.outer, expectedNested);
          return;
        }

        if (pathKind === PATH_DATE_HELPER) {
          // 3.5 — date-helper expression `nextWeek('MM/DD/YYYY')`. Case 4 emits a
          // dateHelper descriptor; unaffected by the fix.
          const source = [
            "import { Data } from '@tomationjs/dsl'",
            '',
            "const target = Data({ due: nextWeek('MM/DD/YYYY') })",
          ].join('\n');

          const a = parseLocal(source);
          const b = parseLocal(source);
          assert.equal(a.error, null);
          const ta = findTemplate(a, 'target');
          const tb = findTemplate(b, 'target');
          assert.ok(ta, 'target template should be parsed');
          deepEqualValue(ta, tb);
          // Observed baseline: a dayOffset dateHelper descriptor (nextWeek = +7).
          assert.deepStrictEqual(ta.due, {
            type: 'dateHelper',
            kind: 'dayOffset',
            offset: 7,
            format: 'MM/DD/YYYY',
          });
          return;
        }

        // PATH_DATA_TOKEN — 3.6: a `{{data.*}}` step token resolved via the
        // separate `dataVars` mechanism (NOT constBindings). A Data template is
        // referenced as a STEP token (not as another template's value), so the
        // bug condition does not hold and the fix leaves it untouched.
        const source = [
          "import { Data, Test, Type } from '@tomationjs/dsl'",
          '',
          'const el = is.INPUT.where(idIs("x")).as("Field")',
          '',
          'const payload = Data({ ' + memberKey + ': ' + leaf.src + ' })',
          '',
          "Test('uses a data token', () => {",
          '  Type(payload.' + memberKey + ').in(el)',
          '})',
        ].join('\n');

        const a = parseLocal(source);
        const b = parseLocal(source);
        assert.equal(a.error, null);
        deepEqualValue(a.tests, b.tests);
        const step = firstTypeStepValue(a);
        // Observed baseline: the step value is a {{data.<Data_Name>.<path>}}
        // token (Data_Name === varName 'payload'), resolved via dataVars.
        assert.strictEqual(step.value, '{{data.payload.' + memberKey + '}}');
      },
    ),
    { numRuns: 100 },
  );
});

// ---------------------------------------------------------------------------
// Property 2 — TS enum preservation (3.1).
//
// TS enums must be compiled from a real `.ts` file (the type stripper emits the
// transpiled IIFE pattern that `buildEnumBindings` recognizes), so this case is
// driven through `parseFile` with a temp `.test.ts` fixture — mirroring the
// Property 1 imported/three-level cases. An enum member is NOT a `Data({...})`
// template, so the bug condition does not hold and the fix must not change it.
// ---------------------------------------------------------------------------
test('Property 2: TS enum member reference unchanged (3.1)', () => {
  // Feature: inline-data-enum-member-value, Property 2: Non-buggy resolution paths unchanged
  fc.assert(
    fc.property(primitiveLeafArb, leaf => {
      // Enum members must be string- or number-valued in TS; restrict to those.
      fc.pre(leaf.kind === 'string' || leaf.kind === 'number');
      const dir = mkTmpDir();
      try {
        const testPath = path.join(dir, 'enum-preserve.test.ts');
        fs.writeFileSync(
          testPath,
          [
            "import { Data } from '@tomationjs/dsl'",
            '',
            'enum Color { Red = ' + leaf.src + ' }',
            '',
            'const target = Data({ color: Color.Red })',
            '',
          ].join('\n'),
          'utf8',
        );

        const r1 = parseFile(testPath);
        const r2 = parseFile(testPath);
        assert.equal(r1.error, null);
        const t1 = findTemplate(r1, 'target');
        const t2 = findTemplate(r2, 'target');
        assert.ok(t1, 'target template should be parsed');
        // F === F'
        deepEqualValue(t1, t2);
        // Observed baseline: the enum member resolves to its literal value
        // (Case 6 preserves the primitive type), key present, no warning.
        assert.ok(Object.prototype.hasOwnProperty.call(t1, 'color'));
        assert.strictEqual(t1.color, leaf.value);
        assert.equal(hasUnknownPropertyWarning(r1, 'color'), false);
      } finally {
        rmTmpDir(dir);
      }
    }),
    { numRuns: 100 },
  );
});

// ---------------------------------------------------------------------------
// Property 2 — dual-role preservation.
//
// The SAME Data template variable is used in BOTH roles at once:
//   (1) as a VALUE source for another template's member (`Palette.Primary`), and
//   (2) as a `{{data.*}}` STEP token (`Palette.Primary` inside `Type(...)`).
// The two maps are independent: member-value resolution reads `constBindings`
// (populated for the Data() template only AFTER the fix), while step-token
// resolution reads `dataVars` (already populated today). This test asserts the
// STEP-TOKEN role — which the fix must NOT disturb — resolves to the expected
// `{{data.*}}` token on the UNFIXED code, and remains identical after the fix.
// The value-source role is covered by Property 1 (it is the bug being fixed).
// ---------------------------------------------------------------------------
test('Property 2: dual-role Data template — {{data.*}} step token role unchanged', () => {
  // Feature: inline-data-enum-member-value, Property 2: Non-buggy resolution paths unchanged
  const source = [
    "import { Data, Test, Type } from '@tomationjs/dsl'",
    '',
    'const el = is.INPUT.where(idIs("x")).as("Field")',
    '',
    "const Palette = Data({ Primary: 'blue', Secondary: 'green' })",
    '',
    // Value-source role (the bug under fix): a sibling template reads Palette.Primary.
    'const theme = Data({ main: Palette.Primary })',
    '',
    // Step-token role (preservation): Palette.Primary used as a {{data.*}} token.
    "Test('dual role', () => {",
    '  Type(Palette.Primary).in(el)',
    '})',
  ].join('\n');

  const a = parseLocal(source);
  const b = parseLocal(source);
  assert.equal(a.error, null);

  // F === F' for both the templates and the steps.
  deepEqualValue(a.dataTemplates, b.dataTemplates);
  deepEqualValue(a.tests, b.tests);

  // Step-token role: resolves via dataVars to {{data.Palette.Primary}} —
  // UNCHANGED by the const-binding fix (independent map). Data_Name === varName.
  const step = firstTypeStepValue(a);
  assert.strictEqual(step.value, '{{data.Palette.Primary}}');

  // The step-token role must not emit an "Unknown data path" warning for the
  // valid path Palette.Primary (the template literally owns 'Primary').
  const badPathWarn = (a.warnings || []).some(
    w => typeof w.message === 'string' && w.message.includes('Unknown data path "Palette.Primary"'),
  );
  assert.equal(badPathWarn, false);
});
