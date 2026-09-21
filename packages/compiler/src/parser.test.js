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
