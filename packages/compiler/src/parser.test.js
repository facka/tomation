'use strict';

/**
 * Tests for parser.js — Page() / Task() AST extraction.
 *
 * Validates: Requirements 12.5, 13.1
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseFile } = require('./parser.js');

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
// Requirement 13.1: Parser recognizes Page(name, { elements, tasks }) calls
// ---------------------------------------------------------------------------

test('parseFile: recognizes a minimal Page() call', () => {
  const src = `
const { Page } = require('@tomation/dsl');
const LoginPage = Page('Login', {
  elements: {},
  tasks: {}
});
module.exports = { LoginPage };
`;
  const filePath = writeTmp(src);
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.equal(result.error, null, 'should not have a parse error');
  assert.equal(result.type, 'pom');
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].name, 'Login');
  assert.equal(typeof result.pages[0].line, 'number');
  assert.ok(result.pages[0].line > 0);
});

test('parseFile: extracts element keys from Page elements map', () => {
  const src = `
const { Page, el } = require('@tomation/dsl');
const LoginPage = Page('Login', {
  elements: {
    username: el({ tag: 'input', where: { id: 'username' } }),
    password: el({ tag: 'input', where: { type: 'password' } }),
    submitBtn: el({ tag: 'button', where: { textIs: 'Sign In' } }),
  },
  tasks: {}
});
module.exports = { LoginPage };
`;
  const filePath = writeTmp(src);
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.equal(result.error, null);
  assert.equal(result.pages.length, 1);
  const page = result.pages[0];
  assert.equal(page.name, 'Login');

  assert.ok('username' in page.elements, 'should have username element');
  assert.ok('password' in page.elements, 'should have password element');
  assert.ok('submitBtn' in page.elements, 'should have submitBtn element');

  assert.equal(page.elements.username.tag, 'input');
  assert.deepEqual(page.elements.username.where, { id: 'username' });

  assert.equal(page.elements.submitBtn.tag, 'button');
  assert.deepEqual(page.elements.submitBtn.where, { textIs: 'Sign In' });
});

test('parseFile: extracts element line numbers', () => {
  const src = [
    "const { Page, el } = require('@tomation/dsl');",
    "const P = Page('P', {",
    "  elements: {",
    "    btn: el({ tag: 'button', where: { id: 'x' } }),",
    "  },",
    "  tasks: {}",
    "});",
    "module.exports = { P };",
  ].join('\n');

  const filePath = writeTmp(src);
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.equal(result.error, null);
  const page = result.pages[0];
  // btn is on line 4 (1-indexed)
  assert.equal(page.elements.btn.line, 4);
});

test('parseFile: extracts Task steps from Page tasks map', () => {
  const src = `
const { Page, Task } = require('@tomation/dsl');
const LoginPage = Page('Login', {
  elements: {
    username: { tag: 'input', where: { id: 'u' } },
    password: { tag: 'input', where: { id: 'p' } },
    submitBtn: { tag: 'button', where: { id: 's' } },
  },
  tasks: {
    login: Task([
      type('username', '{{username}}'),
      typePassword('password', '{{password}}'),
      click('submitBtn'),
    ])
  }
});
module.exports = { LoginPage };
`;
  const filePath = writeTmp(src);
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.equal(result.error, null);
  const page = result.pages[0];
  assert.ok('login' in page.tasks, 'should have login task');

  const loginTask = page.tasks.login;
  assert.ok(Array.isArray(loginTask.steps), 'steps should be an array');
  assert.equal(loginTask.steps.length, 3);

  assert.equal(loginTask.steps[0].action, 'type');
  assert.equal(loginTask.steps[0].target, 'username');
  assert.equal(loginTask.steps[0].value, '{{username}}');

  assert.equal(loginTask.steps[1].action, 'typePassword');
  assert.equal(loginTask.steps[1].target, 'password');

  assert.equal(loginTask.steps[2].action, 'click');
  assert.equal(loginTask.steps[2].target, 'submitBtn');
});

test('parseFile: handles multiple Page() calls in one file', () => {
  const src = `
const { Page, el } = require('@tomation/dsl');
const LoginPage = Page('Login', {
  elements: { btn: el({ tag: 'button', where: { id: 'a' } }) },
  tasks: {}
});
const SignupPage = Page('Signup', {
  elements: { form: el({ tag: 'form', where: { id: 'b' } }) },
  tasks: {}
});
module.exports = { LoginPage, SignupPage };
`;
  const filePath = writeTmp(src);
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.equal(result.error, null);
  assert.equal(result.pages.length, 2);
  assert.equal(result.pages[0].name, 'Login');
  assert.equal(result.pages[1].name, 'Signup');
});

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
    "const { Page } = require('@tomation/dsl');",
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

// ---------------------------------------------------------------------------
// Test file detection
// ---------------------------------------------------------------------------

test('parseFile: detects test file from module.exports = { name, steps }', () => {
  const src = `
const { LoginPage } = require('./login.pom');
module.exports = {
  name: 'Login Flow',
  steps: [
    task('Login__login', { username: 'user@example.com', password: 'secret' }),
    assertHasText('LoginPage__welcome', 'Welcome'),
  ]
};
`;
  const filePath = writeTmp(src, '.test.js');
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.equal(result.error, null);
  assert.equal(result.type, 'test');
  assert.equal(result.pages.length, 0);
  assert.equal(result.tests.length, 1);
  assert.equal(result.tests[0].name, 'Login Flow');
  assert.ok(Array.isArray(result.tests[0].steps));
});

test('parseFile: extracts test steps correctly', () => {
  const src = `
module.exports = {
  name: 'My Test',
  steps: [
    click('Home__submitBtn'),
    navigate('https://example.com'),
    assertHasText('Home__title', 'Hello'),
  ]
};
`;
  const filePath = writeTmp(src, '.test.js');
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.equal(result.error, null);
  assert.equal(result.tests.length, 1);
  const steps = result.tests[0].steps;
  assert.equal(steps.length, 3);
  assert.equal(steps[0].action, 'click');
  assert.equal(steps[0].target, 'Home__submitBtn');
  assert.equal(steps[1].action, 'navigate');
  assert.equal(steps[1].url, 'https://example.com');
  assert.equal(steps[2].action, 'assertHasText');
  assert.equal(steps[2].value, 'Hello');
});

// ---------------------------------------------------------------------------
// Element childOf extraction
// ---------------------------------------------------------------------------

test('parseFile: extracts childOf from el() descriptor', () => {
  const src = `
const { Page, el } = require('@tomation/dsl');
const P = Page('Form', {
  elements: {
    container: el({ tag: 'div', where: { id: 'form-container' } }),
    submitBtn: el({ tag: 'button', childOf: 'form-container', where: { textIs: 'Submit' } }),
  },
  tasks: {}
});
module.exports = { P };
`;
  const filePath = writeTmp(src);
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.equal(result.error, null);
  const page = result.pages[0];
  assert.equal(page.elements.submitBtn.childOf, 'form-container');
  assert.deepEqual(page.elements.submitBtn.where, { textIs: 'Submit' });
});

// ---------------------------------------------------------------------------
// Return shape completeness
// ---------------------------------------------------------------------------

test('parseFile: always returns all required fields', () => {
  const src = `
const { Page } = require('@tomation/dsl');
const P = Page('X', { elements: {}, tasks: {} });
module.exports = { P };
`;
  const filePath = writeTmp(src);
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.ok('filePath' in result);
  assert.ok('type' in result);
  assert.ok('pages' in result);
  assert.ok('tests' in result);
  assert.ok('error' in result);
  assert.ok(Array.isArray(result.pages));
  assert.ok(Array.isArray(result.tests));
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
  assert.ok(Array.isArray(result.pages));
  assert.ok(Array.isArray(result.tests));
});

// ---------------------------------------------------------------------------
// All action types in steps
// ---------------------------------------------------------------------------

test('parseFile: extracts all supported step action types', () => {
  const src = `
const { Page, Task } = require('@tomation/dsl');
const P = Page('P', {
  elements: {},
  tasks: {
    allActions: Task([
      click('el1'),
      type('el2', 'hello'),
      typePassword('el3', 'secret'),
      select('el4', 'option1'),
      assertExists('el5'),
      assertNotExists('el6'),
      assertHasText('el7', 'expected'),
      navigate('https://example.com'),
      wait(500),
      waitFor('el8', false),
      waitFor('el9', true),
      manual('Please check the page'),
      task('SomePage__someTask', { param: 'value' }),
    ])
  }
});
module.exports = { P };
`;
  const filePath = writeTmp(src);
  const result = parseFile(filePath);
  fs.unlinkSync(filePath);

  assert.equal(result.error, null);
  const steps = result.pages[0].tasks.allActions.steps;

  assert.equal(steps[0].action, 'click');
  assert.equal(steps[1].action, 'type');
  assert.equal(steps[2].action, 'typePassword');
  assert.equal(steps[3].action, 'select');
  assert.equal(steps[4].action, 'assertExists');
  assert.equal(steps[5].action, 'assertNotExists');
  assert.equal(steps[6].action, 'assertHasText');
  assert.equal(steps[7].action, 'navigate');
  assert.equal(steps[7].url, 'https://example.com');
  assert.equal(steps[8].action, 'wait');
  assert.equal(steps[8].ms, 500);
  assert.equal(steps[9].action, 'waitFor');
  assert.equal(steps[9].gone, false);
  assert.equal(steps[10].action, 'waitFor');
  assert.equal(steps[10].gone, true);
  assert.equal(steps[11].action, 'manual');
  assert.equal(steps[11].description, 'Please check the page');
  assert.equal(steps[12].action, 'task');
  assert.equal(steps[12].name, 'SomePage__someTask');
});
