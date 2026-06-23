'use strict';

/**
 * Tests for Task/Test declaration extraction in parser.js
 *
 * Validates: Requirements 5.1, 5.2, 6.1
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSource } = require('./parser.js');

// ---------------------------------------------------------------------------
// Requirement 5.1: Task(fn) extracts task name and params
// ---------------------------------------------------------------------------

test('parseSource: Task with destructured params extracts name and param names', () => {
  const src = `const login = Task(({username, password}) => { }).as('Login');`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].name, 'login');
  assert.equal(result.tasks[0].label, 'Login');
  assert.deepEqual(result.tasks[0].params, ['username', 'password']);
  assert.deepEqual(result.tasks[0].steps, []);
  assert.equal(typeof result.tasks[0].line, 'number');
  assert.ok(result.tasks[0].line > 0);
});

test('parseSource: Task with no params extracts empty param list', () => {
  const src = `const logout = Task(() => { }).as('Logout');`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].name, 'logout');
  assert.deepEqual(result.tasks[0].params, []);
});

test('parseSource: Task with single identifier param extracts empty param list (no destructuring)', () => {
  const src = `const doSomething = Task((params) => { });`;
  const result = parseSource(src, 'actions.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].name, 'doSomething');
  assert.deepEqual(result.tasks[0].params, []);
});

test('parseSource: Task with function expression (not arrow) is accepted', () => {
  const src = `const login = Task(function({username, password}) { }).as('Login');`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].name, 'login');
  assert.deepEqual(result.tasks[0].params, ['username', 'password']);
});

test('parseSource: Task marks file type as pom', () => {
  const src = `const login = Task(() => { });`;
  const result = parseSource(src, 'login.js');

  assert.equal(result.type, 'pom');
});

// ---------------------------------------------------------------------------
// Requirement 5.2: const { x, y } = params destructuring is tracked
// ---------------------------------------------------------------------------

test('parseSource: Task tracks body destructuring const { x, y } = params', () => {
  const src = `
const login = Task((params) => {
  const { username, password } = params;
}).as('Login');
`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].name, 'login');
  assert.deepEqual(result.tasks[0].params, ['username', 'password']);
});

test('parseSource: Task merges fn param destructuring with body destructuring', () => {
  const src = `
const complexTask = Task(({baseUrl}) => {
  const { username, password } = params;
}).as('ComplexTask');
`;
  const result = parseSource(src, 'complex.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.tasks[0].params, ['baseUrl', 'username', 'password']);
});

test('parseSource: Task body destructuring from any identifier is tracked', () => {
  const src = `
const login = Task((options) => {
  const { email, code } = options;
}).as('Login');
`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.tasks[0].params, ['email', 'code']);
});

// ---------------------------------------------------------------------------
// Requirement 6.1: Test('name', fn) extracts test name and steps
// ---------------------------------------------------------------------------

test('parseSource: Test extracts name and empty steps', () => {
  const src = `Test('should login successfully', () => { });`;
  const result = parseSource(src, 'login.test.js');

  assert.equal(result.error, null);
  assert.equal(result.tests.length, 1);
  assert.equal(result.tests[0].name, 'should login successfully');
  assert.deepEqual(result.tests[0].steps, []);
  assert.equal(typeof result.tests[0].line, 'number');
  assert.ok(result.tests[0].line > 0);
});

test('parseSource: Test marks file type as test', () => {
  const src = `Test('my test', () => { });`;
  const result = parseSource(src, 'login.js');

  assert.equal(result.type, 'test');
});

test('parseSource: Test with function expression is accepted', () => {
  const src = `Test('should work', function() { });`;
  const result = parseSource(src, 'login.test.js');

  assert.equal(result.error, null);
  assert.equal(result.tests.length, 1);
  assert.equal(result.tests[0].name, 'should work');
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

test('parseSource: Task with non-function argument emits warning (array arg)', () => {
  const src = `const t = Task([click('btn')]);`;
  const result = parseSource(src, 'page.pom.js');

  assert.equal(result.tasks.length, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.message.includes('must be a function') || w.message.includes('requires a function')));
});

test('parseSource: Task with no arguments emits error', () => {
  const src = `const login = Task();`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.tasks.length, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.message.includes('requires a function')));
});

test('parseSource: Task with non-function argument emits error', () => {
  const src = `const login = Task('not a function');`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.tasks.length, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.message.includes('must be a function') || w.message.includes('requires a function')));
});

test('parseSource: Test without name emits warning', () => {
  const src = `Test();`;
  const result = parseSource(src, 'login.test.js');

  assert.equal(result.tests.length, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.message.includes('requires a name')));
});

test('parseSource: Test with non-string first arg emits warning', () => {
  const src = `Test(123, () => { });`;
  const result = parseSource(src, 'login.test.js');

  assert.equal(result.tests.length, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.message.includes('must be a string')));
});

test('parseSource: Test with name but non-function second arg emits warning', () => {
  const src = `Test('my test', 'not a function');`;
  const result = parseSource(src, 'login.test.js');

  assert.equal(result.tests.length, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.message.includes('must be a function')));
});

// ---------------------------------------------------------------------------
// Multiple declarations and coexistence
// ---------------------------------------------------------------------------

test('parseSource: multiple Task declarations in same file are all extracted', () => {
  const src = `
const login = Task(({username, password}) => { }).as('Login');
const logout = Task(() => { }).as('Logout');
const register = Task(({email, name}) => { }).as('Register');
`;
  const result = parseSource(src, 'auth.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 3);
  assert.equal(result.tasks[0].name, 'login');
  assert.equal(result.tasks[1].name, 'logout');
  assert.equal(result.tasks[2].name, 'register');
});

test('parseSource: multiple Test declarations in same file are all extracted', () => {
  const src = `
Test('should login', () => { });
Test('should logout', () => { });
`;
  const result = parseSource(src, 'auth.test.js');

  assert.equal(result.error, null);
  assert.equal(result.tests.length, 2);
  assert.equal(result.tests[0].name, 'should login');
  assert.equal(result.tests[1].name, 'should logout');
});

test('parseSource: Tasks and elements coexist in same file', () => {
  const src = `
const loginBtn = is.BUTTON.where(innerTextIs('Login')).as('Login Button');
const login = Task(({username}) => { }).as('Login');
`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.elements.length, 1);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.type, 'pom');
});

test('parseSource: result includes tasks and tests fields', () => {
  const src = `const x = 1;`;
  const result = parseSource(src, 'test.js');

  assert.ok('tasks' in result);
  assert.ok('tests' in result);
  assert.ok(Array.isArray(result.tasks));
  assert.ok(Array.isArray(result.tests));
});

// ---------------------------------------------------------------------------
// Line number accuracy
// ---------------------------------------------------------------------------

test('parseSource: Task line number is correct', () => {
  const src = [
    '// line 1',
    '// line 2',
    "const login = Task(({username}) => { }).as('Login');", // line 3
  ].join('\n');
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].line, 3);
});

test('parseSource: Test line number is correct', () => {
  const src = [
    '// line 1',
    "Test('should work', () => { });", // line 2
  ].join('\n');
  const result = parseSource(src, 'login.test.js');

  assert.equal(result.tests.length, 1);
  assert.equal(result.tests[0].line, 2);
});

// ---------------------------------------------------------------------------
// Param variable references in action values
// ---------------------------------------------------------------------------

test('parseSource: Type(paramVar).in(element) produces template value {{paramVar}}', () => {
  const src = `
const addItem = Task((params) => {
  const { text } = params
  Type(text).in(input)
  Click(addButton)
}).as('addItem')
`;
  const result = parseSource(src, 'todo.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].name, 'addItem');
  assert.deepEqual(result.tasks[0].params, ['text']);

  const steps = result.tasks[0].steps;
  assert.equal(steps.length, 2);
  assert.equal(steps[0].action, 'type');
  assert.equal(steps[0].target, 'input');
  assert.equal(steps[0].value, '{{text}}', 'value should be template reference to param');
  assert.equal(steps[1].action, 'click');
  assert.equal(steps[1].target, 'addButton');
});

test('parseSource: TypePassword(paramVar).in(element) produces template value', () => {
  const src = `
const login = Task((params) => {
  const { password } = params
  TypePassword(password).in(passwordInput)
}).as('login')
`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  const steps = result.tasks[0].steps;
  assert.equal(steps[0].action, 'typePassword');
  assert.equal(steps[0].value, '{{password}}');
});

test('parseSource: Select(paramVar).in(element) produces template value', () => {
  const src = `
const selectOption = Task(({option}) => {
  Select(option).in(dropdown)
}).as('selectOption')
`;
  const result = parseSource(src, 'form.pom.js');

  assert.equal(result.error, null);
  const steps = result.tasks[0].steps;
  assert.equal(steps[0].action, 'select');
  assert.equal(steps[0].value, '{{option}}');
});

test('parseSource: Navigate(paramVar) produces template value', () => {
  const src = `
const goTo = Task(({url}) => {
  Navigate(url)
}).as('goTo')
`;
  const result = parseSource(src, 'nav.pom.js');

  assert.equal(result.error, null);
  const steps = result.tasks[0].steps;
  assert.equal(steps[0].action, 'navigate');
  assert.equal(steps[0].url, '{{url}}');
});

test('parseSource: string literal values still work alongside param references', () => {
  const src = `
const login = Task(({username}) => {
  Type(username).in(usernameInput)
  Type('hardcoded').in(otherInput)
}).as('login')
`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  const steps = result.tasks[0].steps;
  assert.equal(steps[0].value, '{{username}}', 'param ref should be templated');
  assert.equal(steps[1].value, 'hardcoded', 'string literal should stay as-is');
});
