'use strict';

/**
 * Tests for XPath element extraction in parser.js
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSource } = require('./parser.js');

// ---------------------------------------------------------------------------
// Requirement 3.1: Element(xpath).as('Label') extracts correct descriptor
// ---------------------------------------------------------------------------

test('parseSource: Element(xpath).as(label) extracts XPath element with tag=*, empty where, xpath field', () => {
  const src = `const mainDiv = Element('//div[@id="main"]').as('Main Container');`;
  const result = parseSource(src, 'test.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.elements.length, 1);

  const el = result.elements[0];
  assert.equal(el.variableName, 'mainDiv');
  assert.equal(el.tag, '*');
  assert.equal(el.label, 'Main Container');
  assert.deepEqual(el.where, {});
  assert.equal(el.xpath, '//div[@id="main"]');
  assert.equal(typeof el.line, 'number');
  assert.ok(el.line > 0);
});

// ---------------------------------------------------------------------------
// Requirement 3.2: is.ELEMENT(xpath).as('Label') is equivalent to Element()
// ---------------------------------------------------------------------------

test('parseSource: is.ELEMENT(xpath).as(label) extracts identical descriptor to Element()', () => {
  const src = `const submitBtn = is.ELEMENT('//button[@type="submit"]').as('Submit');`;
  const result = parseSource(src, 'test.pom.js');

  assert.equal(result.error, null);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.elements.length, 1);

  const el = result.elements[0];
  assert.equal(el.variableName, 'submitBtn');
  assert.equal(el.tag, '*');
  assert.equal(el.label, 'Submit');
  assert.deepEqual(el.where, {});
  assert.equal(el.xpath, '//button[@type="submit"]');
});

test('parseSource: Element() and is.ELEMENT() produce equivalent descriptors for same xpath and label', () => {
  const src1 = `const el1 = Element('//nav/ul/li[1]').as('First Nav Item');`;
  const src2 = `const el1 = is.ELEMENT('//nav/ul/li[1]').as('First Nav Item');`;
  const r1 = parseSource(src1, 'test.pom.js');
  const r2 = parseSource(src2, 'test.pom.js');

  assert.equal(r1.elements[0].tag, r2.elements[0].tag);
  assert.equal(r1.elements[0].label, r2.elements[0].label);
  assert.deepEqual(r1.elements[0].where, r2.elements[0].where);
  assert.equal(r1.elements[0].xpath, r2.elements[0].xpath);
});

// ---------------------------------------------------------------------------
// Requirement 3.3: Error for missing/non-string xpath argument
// ---------------------------------------------------------------------------

test('parseSource: Element() with non-string arg emits error about requiring a string argument', () => {
  const src = `const el = Element(123).as('Bad');`;
  const result = parseSource(src, 'test.pom.js');

  assert.equal(result.elements.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].message.includes('requires a string argument'));
  assert.ok(result.warnings[0].message.includes('test.pom.js'));
});

test('parseSource: is.ELEMENT() with no args emits error about requiring a string argument', () => {
  const src = `const el = is.ELEMENT().as('NoXpath');`;
  const result = parseSource(src, 'test.pom.js');

  assert.equal(result.elements.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].message.includes('requires a string argument'));
});

test('parseSource: Element(variable) with identifier arg emits error about requiring a string argument', () => {
  const src = `const myXpath = '//div'; const el = Element(myXpath).as('Var');`;
  const result = parseSource(src, 'test.pom.js');

  // Only the second declarator matches, and it should fail because identifier is not a string literal
  assert.equal(result.elements.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].message.includes('requires a string argument'));
});

// ---------------------------------------------------------------------------
// Requirement 3.4: Error for missing .as('Label') call
// ---------------------------------------------------------------------------

test('parseSource: Element(xpath) without .as() emits error about missing label', () => {
  const src = `const el = Element('//div');`;
  const result = parseSource(src, 'test.pom.js');

  assert.equal(result.elements.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].message.includes('missing label'));
  assert.ok(result.warnings[0].message.includes('.as('));
});

test('parseSource: is.ELEMENT(xpath) without .as() emits error about missing label', () => {
  const src = `const el = is.ELEMENT('//div');`;
  const result = parseSource(src, 'test.pom.js');

  assert.equal(result.elements.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].message.includes('missing label'));
});

test('parseSource: Element(xpath).as(42) with non-string label emits error', () => {
  const src = `const el = Element('//div').as(42);`;
  const result = parseSource(src, 'test.pom.js');

  assert.equal(result.elements.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].message.includes('missing label'));
});

test('parseSource: Element(xpath).as() with no label arg emits error', () => {
  const src = `const el = Element('//div').as();`;
  const result = parseSource(src, 'test.pom.js');

  assert.equal(result.elements.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].message.includes('missing label'));
});

// ---------------------------------------------------------------------------
// Additional coverage: file type detection and multiple elements
// ---------------------------------------------------------------------------

test('parseSource: XPath element marks file as pom type', () => {
  const src = `const el = Element('//div').as('Div');`;
  const result = parseSource(src, 'my-page.js');

  assert.equal(result.type, 'pom');
});

test('parseSource: multiple XPath elements in same file are all extracted', () => {
  const src = `
const header = Element('//header').as('Header');
const footer = is.ELEMENT('//footer').as('Footer');
`;
  const result = parseSource(src, 'layout.pom.js');

  assert.equal(result.elements.length, 2);
  assert.equal(result.elements[0].variableName, 'header');
  assert.equal(result.elements[0].xpath, '//header');
  assert.equal(result.elements[1].variableName, 'footer');
  assert.equal(result.elements[1].xpath, '//footer');
});

test('parseSource: XPath elements coexist with tag-based elements', () => {
  const src = `
const loginBtn = is.BUTTON.where(innerTextIs('Login')).as('Login Button');
const customEl = Element('//div[@class="custom"]').as('Custom');
`;
  const result = parseSource(src, 'mixed.pom.js');

  assert.equal(result.elements.length, 2);
  // First is tag-based
  assert.equal(result.elements[0].tag, 'button');
  assert.equal(result.elements[0].xpath, undefined);
  // Second is XPath-based
  assert.equal(result.elements[1].tag, '*');
  assert.equal(result.elements[1].xpath, '//div[@class="custom"]');
});

test('parseSource: template literal xpath is accepted', () => {
  const src = "const el = Element(`//div[@id=\"main\"]`).as('Main');";
  const result = parseSource(src, 'test.pom.js');

  assert.equal(result.elements.length, 1);
  assert.equal(result.elements[0].xpath, '//div[@id="main"]');
});
