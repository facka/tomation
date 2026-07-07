'use strict';

/**
 * Integration test: end-to-end compilation of all 9 new matchers.
 *
 * Validates: Requirements 1.2, 2.2, 3.2, 4.2, 5.2, 6.2, 7.2, 8.2, 10.2, 11.1–11.7
 *
 * Verifies that parseSource correctly extracts where descriptors for:
 * - valueIs (1-arg string)
 * - dataAttr (2-arg string)
 * - ariaLabel (1-arg string)
 * - roleIs (1-arg string)
 * - titleIs (1-arg string)
 * - hrefContains (1-arg string)
 * - isDisabled (0-arg boolean)
 * - nthChild (1-arg numeric)
 * - closestLabelIs (2-arg string)
 *
 * Also confirms no regressions for existing matchers (idIs, classIncludes, innerTextIs).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSource } = require('./parser.js');

// ---------------------------------------------------------------------------
// Fixture: POM source using all 9 new matchers + 3 existing matchers
// ---------------------------------------------------------------------------

const fixtureSource = `
const input = is.INPUT.where(valueIs('hello')).as('Value Input');
const card = is.DIV.where(dataAttr('testid', 'submit-btn')).as('Card');
const closeBtn = is.BUTTON.where(ariaLabel('Close dialog')).as('Close Button');
const dialog = is.DIV.where(roleIs('dialog')).as('Dialog');
const link = is.A.where(titleIs('Submit form')).as('Title Link');
const navLink = is.A.where(hrefContains('/login')).as('Login Link');
const disabledBtn = is.BUTTON.where(isDisabled()).as('Disabled Button');
const thirdItem = is.LI.where(nthChild(3)).as('Third Item');
const emailInput = is.INPUT.where(closestLabelIs('LABEL', 'Email')).as('Email Input');
const loginBtn = is.BUTTON.where(idIs('login-btn')).as('Login Button');
const todoItem = is.LI.where(classIncludes('todo-item')).as('Todo Item');
const heading = is.H1.where(innerTextIs('Welcome')).as('Heading');
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('integration: all 9 new matchers compile without errors', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');

  assert.equal(result.error, null, 'should have no parse error');
  assert.equal(result.warnings.length, 0, 'should emit no warnings for valid matchers');
  assert.equal(result.elements.length, 12, 'should extract all 12 elements');
});

test('integration: valueIs produces { value: "hello" }', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');
  const el = result.elements.find(e => e.label === 'Value Input');

  assert.ok(el, 'element should exist');
  assert.deepEqual(el.where, { value: 'hello' });
});

test('integration: dataAttr produces { dataAttr: { name: "testid", value: "submit-btn" } }', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');
  const el = result.elements.find(e => e.label === 'Card');

  assert.ok(el, 'element should exist');
  assert.deepEqual(el.where, { dataAttr: { name: 'testid', value: 'submit-btn' } });
});

test('integration: ariaLabel produces { ariaLabel: "Close dialog" }', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');
  const el = result.elements.find(e => e.label === 'Close Button');

  assert.ok(el, 'element should exist');
  assert.deepEqual(el.where, { ariaLabel: 'Close dialog' });
});

test('integration: roleIs produces { role: "dialog" }', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');
  const el = result.elements.find(e => e.label === 'Dialog');

  assert.ok(el, 'element should exist');
  assert.deepEqual(el.where, { role: 'dialog' });
});

test('integration: titleIs produces { title: "Submit form" }', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');
  const el = result.elements.find(e => e.label === 'Title Link');

  assert.ok(el, 'element should exist');
  assert.deepEqual(el.where, { title: 'Submit form' });
});

test('integration: hrefContains produces { hrefContains: "/login" }', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');
  const el = result.elements.find(e => e.label === 'Login Link');

  assert.ok(el, 'element should exist');
  assert.deepEqual(el.where, { hrefContains: '/login' });
});

test('integration: isDisabled produces { isDisabled: true }', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');
  const el = result.elements.find(e => e.label === 'Disabled Button');

  assert.ok(el, 'element should exist');
  assert.deepEqual(el.where, { isDisabled: true });
});

test('integration: nthChild produces { nthChild: 3 }', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');
  const el = result.elements.find(e => e.label === 'Third Item');

  assert.ok(el, 'element should exist');
  assert.deepEqual(el.where, { nthChild: 3 });
});

test('integration: closestLabelIs produces { closestLabel: { tag: "LABEL", text: "Email" } }', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');
  const el = result.elements.find(e => e.label === 'Email Input');

  assert.ok(el, 'element should exist');
  assert.deepEqual(el.where, { closestLabel: { tag: 'LABEL', text: 'Email' } });
});

// ---------------------------------------------------------------------------
// Regression: existing matchers still work
// ---------------------------------------------------------------------------

test('regression: idIs still produces { id: "login-btn" }', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');
  const el = result.elements.find(e => e.label === 'Login Button');

  assert.ok(el, 'element should exist');
  assert.deepEqual(el.where, { id: 'login-btn' });
});

test('regression: classIncludes still produces { classIncludes: "todo-item" }', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');
  const el = result.elements.find(e => e.label === 'Todo Item');

  assert.ok(el, 'element should exist');
  assert.deepEqual(el.where, { classIncludes: 'todo-item' });
});

test('regression: innerTextIs still produces { textIs: "Welcome" }', () => {
  const result = parseSource(fixtureSource, 'fixture.pom.js');
  const el = result.elements.find(e => e.label === 'Heading');

  assert.ok(el, 'element should exist');
  assert.deepEqual(el.where, { textIs: 'Welcome' });
});
