'use strict';

/**
 * Tests for @tomationjs/dsl — Element builders, matcher factories, and action stubs.
 *
 * Validates: Requirements 2.1, 2.2, 3.1, 3.2, 4.1
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  is,
  Element,
  innerTextIs,
  innerTextContains,
  classIncludes,
  placeholderIs,
  nameIs,
  typeIs,
  idIs,
  Task,
  Test,
  Click,
  Type,
  TypePassword,
  Select,
  AssertExists,
  AssertNotExists,
  AssertHasText,
  Navigate,
  Wait,
  WaitFor,
  WaitForGone,
  Manual,
} = require('./index.js');

// ---------------------------------------------------------------------------
// is.TAG.where(matcher).as(label) — ElementBuilder chain
// ---------------------------------------------------------------------------

describe('ElementBuilder via is.TAG', () => {
  test('is.BUTTON.where(innerTextIs("X")).as("Y") returns correct descriptor', () => {
    const result = is.BUTTON.where(innerTextIs('Login')).as('Login Button');

    assert.deepEqual(result, {
      tag: 'button',
      label: 'Login Button',
      where: { textIs: 'Login' },
      __el: true,
    });
  });

  test('is.INPUT.where(placeholderIs("Email")).as("Email Field") returns correct descriptor', () => {
    const result = is.INPUT.where(placeholderIs('Email')).as('Email Field');

    assert.deepEqual(result, {
      tag: 'input',
      label: 'Email Field',
      where: { placeholder: 'Email' },
      __el: true,
    });
  });

  test('is.TAG lowercases the tag name', () => {
    const result = is.DIV.where(idIs('main')).as('Main Container');
    assert.equal(result.tag, 'div');
  });

  test('is.TAG without .where() uses empty where object', () => {
    const result = is.SPAN.as('Some Span');

    assert.deepEqual(result, {
      tag: 'span',
      label: 'Some Span',
      where: {},
      __el: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Element(xpath) and is.ELEMENT(xpath) — XPath builders
// ---------------------------------------------------------------------------

describe('XPathElementBuilder', () => {
  test('Element(xpath).as("Label") returns correct descriptor', () => {
    const xpath = '//div[@class="container"]//button[1]';
    const result = Element(xpath).as('First Button');

    assert.deepEqual(result, {
      tag: '*',
      label: 'First Button',
      where: {},
      xpath: xpath,
      __el: true,
    });
  });

  test('is.ELEMENT(xpath).as("Label") returns correct descriptor', () => {
    const xpath = '//input[@name="email"]';
    const result = is.ELEMENT(xpath).as('Email Input');

    assert.deepEqual(result, {
      tag: '*',
      label: 'Email Input',
      where: {},
      xpath: xpath,
      __el: true,
    });
  });

  test('Element(xpath) and is.ELEMENT(xpath) produce equivalent descriptors', () => {
    const xpath = '//form[@id="login"]//button';
    const fromElement = Element(xpath).as('Submit');
    const fromIsElement = is.ELEMENT(xpath).as('Submit');

    assert.deepEqual(fromElement, fromIsElement);
  });
});

// ---------------------------------------------------------------------------
// .childOf(parent) chains
// ---------------------------------------------------------------------------

describe('.childOf(parent) chains', () => {
  test('.childOf(parent) includes childOf in the descriptor', () => {
    const container = is.DIV.where(idIs('form-container')).as('Container');
    const btn = is.BUTTON.where(innerTextIs('Submit')).childOf(container).as('Submit Button');

    assert.deepEqual(btn, {
      tag: 'button',
      label: 'Submit Button',
      where: { textIs: 'Submit' },
      childOf: container,
      __el: true,
    });
  });

  test('.childOf() before .where() works correctly', () => {
    const parent = is.DIV.where(idIs('parent')).as('Parent');
    const child = is.INPUT.childOf(parent).where(typeIs('text')).as('Text Input');

    assert.deepEqual(child, {
      tag: 'input',
      label: 'Text Input',
      where: { type: 'text' },
      childOf: parent,
      __el: true,
    });
  });

  test('descriptor without .childOf() does not have childOf property', () => {
    const result = is.BUTTON.where(innerTextIs('OK')).as('OK Button');
    assert.equal('childOf' in result, false);
  });
});

// ---------------------------------------------------------------------------
// Matcher factories return correct shape
// ---------------------------------------------------------------------------

describe('Matcher factories', () => {
  test('innerTextIs returns { textIs }', () => {
    assert.deepEqual(innerTextIs('Hello'), { textIs: 'Hello' });
  });

  test('innerTextContains returns { textContains }', () => {
    assert.deepEqual(innerTextContains('world'), { textContains: 'world' });
  });

  test('classIncludes returns { classIncludes }', () => {
    assert.deepEqual(classIncludes('btn-primary'), { classIncludes: 'btn-primary' });
  });

  test('placeholderIs returns { placeholder }', () => {
    assert.deepEqual(placeholderIs('Enter email'), { placeholder: 'Enter email' });
  });

  test('nameIs returns { name }', () => {
    assert.deepEqual(nameIs('username'), { name: 'username' });
  });

  test('typeIs returns { type }', () => {
    assert.deepEqual(typeIs('password'), { type: 'password' });
  });

  test('idIs returns { id }', () => {
    assert.deepEqual(idIs('submit-btn'), { id: 'submit-btn' });
  });
});

// ---------------------------------------------------------------------------
// Action stubs are callable and return correct shape
// ---------------------------------------------------------------------------

describe('Action stubs', () => {
  const dummyEl = { tag: 'button', label: 'Btn', where: {}, __el: true };

  test('Click(element) returns step descriptor', () => {
    const result = Click(dummyEl);
    assert.equal(result.__step, true);
    assert.equal(result.action, 'click');
    assert.equal(result.target, dummyEl);
  });

  test('Type(value).in(element) returns step descriptor', () => {
    const result = Type('hello').in(dummyEl);
    assert.equal(result.__step, true);
    assert.equal(result.action, 'type');
    assert.equal(result.target, dummyEl);
    assert.equal(result.value, 'hello');
  });

  test('TypePassword(value).in(element) returns step descriptor', () => {
    const result = TypePassword('secret').in(dummyEl);
    assert.equal(result.__step, true);
    assert.equal(result.action, 'typePassword');
    assert.equal(result.target, dummyEl);
    assert.equal(result.value, 'secret');
  });

  test('Select(value).in(element) returns step descriptor', () => {
    const result = Select('option1').in(dummyEl);
    assert.equal(result.__step, true);
    assert.equal(result.action, 'select');
    assert.equal(result.target, dummyEl);
    assert.equal(result.value, 'option1');
  });

  test('AssertExists(element) returns step descriptor', () => {
    const result = AssertExists(dummyEl);
    assert.equal(result.__step, true);
    assert.equal(result.action, 'assertExists');
    assert.equal(result.target, dummyEl);
  });

  test('AssertNotExists(element) returns step descriptor', () => {
    const result = AssertNotExists(dummyEl);
    assert.equal(result.__step, true);
    assert.equal(result.action, 'assertNotExists');
    assert.equal(result.target, dummyEl);
  });

  test('AssertHasText(element, text) returns step descriptor', () => {
    const result = AssertHasText(dummyEl, 'Welcome');
    assert.equal(result.__step, true);
    assert.equal(result.action, 'assertHasText');
    assert.equal(result.target, dummyEl);
    assert.equal(result.value, 'Welcome');
  });

  test('Navigate(url) returns step descriptor', () => {
    const result = Navigate('https://example.com');
    assert.equal(result.__step, true);
    assert.equal(result.action, 'navigate');
    assert.equal(result.url, 'https://example.com');
  });

  test('Wait(ms) returns step descriptor', () => {
    const result = Wait(2000);
    assert.equal(result.__step, true);
    assert.equal(result.action, 'wait');
    assert.equal(result.ms, 2000);
  });

  test('WaitFor(element) returns step descriptor with gone=false', () => {
    const result = WaitFor(dummyEl);
    assert.equal(result.__step, true);
    assert.equal(result.action, 'waitFor');
    assert.equal(result.target, dummyEl);
    assert.equal(result.gone, false);
  });

  test('WaitForGone(element) returns step descriptor with gone=true', () => {
    const result = WaitForGone(dummyEl);
    assert.equal(result.__step, true);
    assert.equal(result.action, 'waitFor');
    assert.equal(result.target, dummyEl);
    assert.equal(result.gone, true);
  });

  test('Manual(description) returns step descriptor', () => {
    const result = Manual('Verify the page looks correct');
    assert.equal(result.__step, true);
    assert.equal(result.action, 'manual');
    assert.equal(result.description, 'Verify the page looks correct');
  });
});
