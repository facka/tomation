'use strict';

/**
 * Tests for v2 Task/Test declaration extraction in parser.js
 *
 * Validates: Requirements 5.1, 5.2, 6.1
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSource } = require('./parser.js');

// ---------------------------------------------------------------------------
// Requirement 5.1: Task('name', fn) extracts task name and params
// ---------------------------------------------------------------------------

test('parseSource: Task with destructured params extracts name and param names', () => {
  const src = `Task('Login', ({username, password}) => { });`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].name, 'Login');
  assert.deepEqual(result.tasks[0].params, ['username', 'password']);
  assert.deepEqual(result.tasks[0].steps, []);
  assert.equal(typeof result.tasks[0].line, 'number');
  assert.ok(result.tasks[0].line > 0);
});

test('parseSource: Task with no params extracts empty param list', () => {
  const src = `Task('Logout', () => { });`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].name, 'Logout');
  assert.deepEqual(result.tasks[0].params, []);
});

test('parseSource: Task with single identifier param extracts empty param list (no destructuring)', () => {
  const src = `Task('DoSomething', (params) => { });`;
  const result = parseSource(src, 'actions.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].name, 'DoSomething');
  assert.deepEqual(result.tasks[0].params, []);
});

test('parseSource: Task with function expression (not arrow) is accepted', () => {
  const src = `Task('Login', function({username, password}) { });`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].name, 'Login');
  assert.deepEqual(result.tasks[0].params, ['username', 'password']);
});

test('parseSource: Task marks file type as pom', () => {
  const src = `Task('Login', () => { });`;
  const result = parseSource(src, 'login.js');

  assert.equal(result.type, 'pom');
});

// ---------------------------------------------------------------------------
// Requirement 5.2: const { x, y } = params destructuring is tracked
// ---------------------------------------------------------------------------

test('parseSource: Task tracks body destructuring const { x, y } = params', () => {
  const src = `
Task('Login', (params) => {
  const { username, password } = params;
});
`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].name, 'Login');
  assert.deepEqual(result.tasks[0].params, ['username', 'password']);
});

test('parseSource: Task merges fn param destructuring with body destructuring', () => {
  const src = `
Task('ComplexTask', ({baseUrl}) => {
  const { username, password } = params;
});
`;
  const result = parseSource(src, 'complex.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.tasks[0].params, ['baseUrl', 'username', 'password']);
});

test('parseSource: Task body destructuring from any identifier is tracked', () => {
  const src = `
Task('Login', (options) => {
  const { email, code } = options;
});
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
  assert.equal(result.v2Tests.length, 1);
  assert.equal(result.v2Tests[0].name, 'should login successfully');
  assert.deepEqual(result.v2Tests[0].steps, []);
  assert.equal(typeof result.v2Tests[0].line, 'number');
  assert.ok(result.v2Tests[0].line > 0);
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
  assert.equal(result.v2Tests.length, 1);
  assert.equal(result.v2Tests[0].name, 'should work');
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

test('parseSource: Task without name string emits no error (v1 compatibility)', () => {
  // v1 Task([...]) pattern — should not produce an error
  const src = `const t = Task([click('btn')]);`;
  const result = parseSource(src, 'page.pom.js');

  // Should not have errors for v1 Task usage
  const taskErrors = result.warnings.filter(w => w.message.includes('Task()'));
  assert.equal(taskErrors.length, 0);
  assert.equal(result.tasks.length, 0);
});

test('parseSource: Task with name but no function emits warning', () => {
  const src = `Task('Login');`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.tasks.length, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.message.includes('requires a function')));
});

test('parseSource: Task with name but non-function second arg emits warning', () => {
  const src = `Task('Login', 'not a function');`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.tasks.length, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.message.includes('must be a function')));
});

test('parseSource: Test without name emits warning', () => {
  const src = `Test();`;
  const result = parseSource(src, 'login.test.js');

  assert.equal(result.v2Tests.length, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.message.includes('requires a name')));
});

test('parseSource: Test with non-string first arg emits warning', () => {
  const src = `Test(123, () => { });`;
  const result = parseSource(src, 'login.test.js');

  assert.equal(result.v2Tests.length, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.message.includes('must be a string')));
});

test('parseSource: Test with name but non-function second arg emits warning', () => {
  const src = `Test('my test', 'not a function');`;
  const result = parseSource(src, 'login.test.js');

  assert.equal(result.v2Tests.length, 0);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.some(w => w.message.includes('must be a function')));
});

// ---------------------------------------------------------------------------
// Multiple declarations and coexistence
// ---------------------------------------------------------------------------

test('parseSource: multiple Task declarations in same file are all extracted', () => {
  const src = `
Task('Login', ({username, password}) => { });
Task('Logout', () => { });
Task('Register', ({email, name}) => { });
`;
  const result = parseSource(src, 'auth.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 3);
  assert.equal(result.tasks[0].name, 'Login');
  assert.equal(result.tasks[1].name, 'Logout');
  assert.equal(result.tasks[2].name, 'Register');
});

test('parseSource: multiple Test declarations in same file are all extracted', () => {
  const src = `
Test('should login', () => { });
Test('should logout', () => { });
`;
  const result = parseSource(src, 'auth.test.js');

  assert.equal(result.error, null);
  assert.equal(result.v2Tests.length, 2);
  assert.equal(result.v2Tests[0].name, 'should login');
  assert.equal(result.v2Tests[1].name, 'should logout');
});

test('parseSource: Tasks and elements coexist in same file', () => {
  const src = `
const loginBtn = is.BUTTON.where(innerTextIs('Login')).as('Login Button');
Task('Login', ({username}) => { });
`;
  const result = parseSource(src, 'login.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.elements.length, 1);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.type, 'pom');
});

test('parseSource: result includes tasks and v2Tests fields', () => {
  const src = `const x = 1;`;
  const result = parseSource(src, 'test.js');

  assert.ok('tasks' in result);
  assert.ok('v2Tests' in result);
  assert.ok(Array.isArray(result.tasks));
  assert.ok(Array.isArray(result.v2Tests));
});

// ---------------------------------------------------------------------------
// Line number accuracy
// ---------------------------------------------------------------------------

test('parseSource: Task line number is correct', () => {
  const src = [
    '// line 1',
    '// line 2',
    "Task('Login', ({username}) => { });", // line 3
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

  assert.equal(result.v2Tests.length, 1);
  assert.equal(result.v2Tests[0].line, 2);
});
